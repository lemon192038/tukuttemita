import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { bus } from './eventbus.js';
import * as Save from './save.js';
import { QualityManager, LEVELS } from './quality.js';
import { Gfx } from './renderer.js';
import { Loop } from './loop.js';
import { Input } from './input.js';
import { buildTestScene } from './testScene.js';
import { DebugPanel } from './debugPanel.js';

const data = Save.load();
const quality = new QualityManager(data.settings.quality, data.settings.autoQuality);

const gfx = new Gfx(document.getElementById('game'));
const world = buildTestScene(gfx.renderer);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 3.5, 11);
gfx.init(world.scene, camera);
gfx.shadowLights.push(world.keyLight);
gfx.setExposure(data.settings.exposure);
document.getElementById('exposure').value = data.settings.exposure;

const controls = new OrbitControls(camera, gfx.renderer.domElement);
controls.target.set(0, 1.2, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 3; controls.maxDistance = 40;

const panel = new DebugPanel({
  labels: world.labels, quality,
  onExposure: (v) => { gfx.setExposure(v); data.settings.exposure = v; },
});

function applyQuality() {
  gfx.applyQuality(quality.preset);
  world.setParticleScale(quality.preset.particleScale);
  data.settings.quality = quality.level;
  data.settings.autoQuality = quality.auto;
  Save.save(data);
}
bus.on('quality', applyQuality);
bus.on('settings', () => { data.settings.autoQuality = quality.auto; Save.save(data); });
applyQuality();

// キー 1〜4 で品質を切り替え
const input = new Input();
bus.on('key', (code) => {
  const m = /^Digit([1-4])$/.exec(code);
  if (m) quality.set(LEVELS[+m[1] - 1]);
});
window.addEventListener('resize', () => gfx.resize());

let t = 0, statTimer = 0;
const loop = new Loop(
  (dt) => { t += dt; world.update(dt, t); controls.update(); },
  (dt) => {
    gfx.render(dt);
    quality.tick(loop.fps, dt);
    statTimer += dt;
    if (statTimer > 0.4) {
      statTimer = 0;
      const sz = gfx.renderer.getDrawingBufferSize(new THREE.Vector2());
      panel.update({
        fps: loop.fps, cap: quality.cap, level: quality.level, auto: quality.auto, dpr: gfx.dpr, w: sz.x, h: sz.y,
        shadow: gfx.renderer.shadowMap.enabled ? quality.preset.shadowSize : 0, post: gfx.usePost,
        calls: gfx.info.render.calls, tris: gfx.info.render.triangles, particles: world.particleCount,
      });
    }
  },
);
loop.start();
window.__aetherBooted = true;
