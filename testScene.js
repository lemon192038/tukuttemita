import * as THREE from 'three';
import { makeEnvironment } from './env.js';

// 起伏のある地形の高さ関数(中心の展示エリアは平坦)。後の衝突判定でも使う。
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  const k = THREE.MathUtils.smoothstep(r, 9, 24);
  const h = 2.2 * Math.sin(x * 0.11) * Math.cos(z * 0.09) + 0.9 * Math.sin(x * 0.29 + z * 0.17) + 0.4 * Math.sin(z * 0.53);
  return h * k;
}

// 「黒いシルエット問題」の検証用に、素材ごとの球を並べる
const SAMPLES = [
  ['肌',         new THREE.MeshPhysicalMaterial({ color: 0xf0c8b0, roughness: 0.55, clearcoat: 0.1 })],
  ['髪',         new THREE.MeshPhysicalMaterial({ color: 0x2a3566, roughness: 0.35, metalness: 0.1, clearcoat: 0.4 })],
  ['布',         new THREE.MeshStandardMaterial({ color: 0x8a2a36, roughness: 0.92 })],
  ['金属(明)',   new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.25, metalness: 1 })],
  ['金属(暗装甲)', new THREE.MeshStandardMaterial({ color: 0x4a505c, roughness: 0.4, metalness: 0.85 })],
  ['石',         new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.95 })],
  ['発光結晶',   new THREE.MeshStandardMaterial({ color: 0x2a9ad0, emissive: 0x1a8cff, emissiveIntensity: 1.6, roughness: 0.2 })],
];

export function buildTestScene(renderer) {
  const scene = new THREE.Scene();
  const sky = new THREE.Color(0x9db8d6);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 40, 140);

  // 環境ライティング(PBR反射の土台)
  scene.environment = makeEnvironment(renderer);

  // ライト: Hemisphere(Ambient) + Key + Fill + Rim
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5a4a3a, 0.5));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
  key.position.set(12, 20, 8);
  key.shadow.camera.left = key.shadow.camera.bottom = -22;
  key.shadow.camera.right = key.shadow.camera.top = 22;
  key.shadow.camera.near = 1; key.shadow.camera.far = 70;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9ab8ff, 0.6); fill.position.set(-10, 6, 8); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xaad4ff, 1.2); rim.position.set(-6, 8, -14); scene.add(rim);

  // 地形(頂点カラー: 草/砂/岩)
  const geo = new THREE.PlaneGeometry(160, 160, 160, 160);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const col = new Float32Array(pos.count * 3);
  const nrm = geo.attributes.normal;
  const grassA = new THREE.Color(0x4f7a3a), grassB = new THREE.Color(0x6f9a48);
  const sand = new THREE.Color(0xb8a574), rock = new THREE.Color(0x7d776d), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ny = nrm.getY(i);
    c.copy(grassA).lerp(grassB, 0.5 + 0.5 * Math.sin(pos.getX(i) * 0.7 + pos.getZ(i) * 0.5));
    if (y < -0.6) c.lerp(sand, THREE.MathUtils.clamp(-0.6 - y, 0, 1));
    if (ny < 0.82) c.lerp(rock, THREE.MathUtils.clamp((0.82 - ny) * 6, 0, 1));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // 素材サンプルの展示台
  const sphereGeo = new THREE.SphereGeometry(0.6, 48, 32);
  const padGeo = new THREE.CylinderGeometry(0.55, 0.7, 0.3, 32);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x6b675f, roughness: 0.9 });
  const spinners = [];
  SAMPLES.forEach(([, mat], i) => {
    const x = (i - (SAMPLES.length - 1) / 2) * 2.4;
    const pad = new THREE.Mesh(padGeo, padMat); pad.position.set(x, 0.15, 0);
    pad.castShadow = pad.receiveShadow = true; scene.add(pad);
    const ball = new THREE.Mesh(sphereGeo, mat); ball.position.set(x, 1.0, 0);
    ball.castShadow = ball.receiveShadow = true; scene.add(ball);
    spinners.push(ball);
  });

  // 浮遊粒子(上限はUltra=1.5倍分を確保し、drawRangeで品質に合わせる)
  const BASE = 2000, MAX = BASE * 1.5;
  const pGeo = new THREE.BufferGeometry();
  const pArr = new Float32Array(MAX * 3);
  for (let i = 0; i < MAX; i++) pArr.set([(Math.random() - 0.5) * 40, Math.random() * 9, (Math.random() - 0.5) * 40], i * 3);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 600 }, uSize: { value: 0.07 }, uClamp: { value: new THREE.Vector2(1, 4) } },
    vertexShader: `uniform float uScale; uniform float uSize; uniform vec2 uClamp; varying float vFade;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = -mv.z;
        gl_PointSize = clamp(uSize * uScale / d, uClamp.x, uClamp.y);
        vFade = smoothstep(0.8, 3.0, d);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vFade;
      void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; if (r > 1.0) discard;
        float a = smoothstep(1.0, 0.1, r) * 0.7 * vFade;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.78) * a, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dust = new THREE.Points(pGeo, dustMat);
  dust.frustumCulled = false;
  const dbSize = new THREE.Vector2();
  dust.onBeforeRender = (r, s, cam) => {
    r.getDrawingBufferSize(dbSize);
    dustMat.uniforms.uScale.value = dbSize.y * 0.5 / Math.tan(cam.fov * Math.PI / 360);
    const pr = r.getPixelRatio();
    dustMat.uniforms.uClamp.value.set(0.75 * pr, 3.5 * pr);
  };
  scene.add(dust);
  let particleCount = BASE;

  return {
    scene, keyLight: key,
    labels: SAMPLES.map((s) => s[0]),
    setParticleScale(s) { particleCount = Math.floor(BASE * s); pGeo.setDrawRange(0, particleCount); },
    get particleCount() { return particleCount; },
    update(dt, t) {
      spinners.forEach((m, i) => { m.rotation.y += dt * 0.6; m.position.y = 1.0 + Math.sin(t * 1.2 + i) * 0.05; });
      for (let i = 0; i < particleCount; i++) {
        const k = i * 3 + 1;
        pArr[k] += dt * 0.25;
        if (pArr[k] > 9) pArr[k] = 0;
        pArr[i * 3] += Math.sin(t + i) * dt * 0.1;
      }
      pGeo.attributes.position.needsUpdate = true;
    },
  };
}
