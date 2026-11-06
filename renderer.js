import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5));
      c.rgb *= 1.0 - smoothstep(0.35, 0.85, d) * strength; gl_FragColor = c; }`,
};

export class Gfx {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const r = this.renderer;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.info.autoReset = false; // 複数パスの合計を統計に出すため手動リセット
    this.shadowLights = [];
    this.usePost = false;
    this.dpr = 1;
    this.preset = null;
    this.state = {};
    // 負荷の切り分け用(診断パネルから切替)
    this.diag = { post: true, msaa: true, bloom: true, fxaa: true, shadow: true };
    this._samples = -1;
  }

  init(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.6, 0.9);
    // ブルームは低周波の光なので、さらに半分の解像度で計算して軽くする
    const origSetSize = this.bloom.setSize.bind(this.bloom);
    this.bloom.setSize = (w, h) => origSetSize(w / 2, h / 2);
    this.vignette = new ShaderPass(VignetteShader);
    this.fxaa = new ShaderPass(FXAAShader); // MSAAの代わりの軽量AA(トーンマップ後に適用)
    this.composer.addPass(new RenderPass(scene, camera));
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass()); // トーンマッピングと色空間変換
    this.composer.addPass(this.fxaa);
  }

  setExposure(v) { this.renderer.toneMappingExposure = v; }

  // 合成用バッファのMSAAサンプル数を実行時に変更
  setSamples(n) {
    if (this._samples === n) return;
    this._samples = n;
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      rt.samples = n;
      rt.dispose(); // 次回使用時に新しいサンプル数で再確保される
    }
  }

  applyQuality(p) {
    const d = this.diag;
    this.preset = p;
    this.dpr = Math.min(p.dpr, window.devicePixelRatio || 1);
    this.usePost = p.post && d.post;

    const bloomOn = p.bloom > 0 && d.bloom;
    this.bloom.enabled = bloomOn;
    this.bloom.strength = p.bloom;
    this.vignette.enabled = p.vignette;

    const samples = d.msaa ? p.msaa : 0;
    this.setSamples(samples);
    this.fxaa.enabled = d.fxaa && samples === 0;

    const wasShadow = this.renderer.shadowMap.enabled;
    const shadowOn = p.shadowSize > 0 && d.shadow;
    this.renderer.shadowMap.enabled = shadowOn;
    for (const l of this.shadowLights) {
      l.castShadow = shadowOn;
      if (shadowOn && l.shadow.mapSize.x !== p.shadowSize) {
        if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
        l.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      }
    }
    if (wasShadow !== shadowOn) {
      this.scene.traverse((o) => {
        const m = o.material;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; });
      });
    }
    this.state = { post: this.usePost, samples, fxaa: this.fxaa.enabled, bloom: bloomOn && this.usePost };
    this.resize();
  }

  get aaLabel() {
    const s = this.state;
    if (!s.post) return '標準';
    return s.samples > 0 ? 'MSAA' + s.samples : s.fxaa ? 'FXAA' : 'なし';
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(w, h);
    this.fxaa.material.uniforms['resolution'].value.set(1 / (w * this.dpr), 1 / (h * this.dpr));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt) {
    this.renderer.info.reset();
    if (this.usePost) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  get info() { return this.renderer.info; }
}
export const BUILD = 'r6';
