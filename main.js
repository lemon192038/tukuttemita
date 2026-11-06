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
import * as mEventbus from './eventbus.js';
import * as mQuality from './quality.js';
import * as mRenderer from './renderer.js';
import * as mLoop from './loop.js';
import * as mInput from './input.js';
import * as mEnv from './env.js';
import * as mTestScene from './testScene.js';
import * as mPanel from './debugPanel.js';
import * as mHero from './hero.js';

const BUILD = 'r6';
document.title = 'AETHERFALL ' + BUILD;

const data = Save.load();
data.settings.exposure = Math.min(data.settings.exposure, 1.2); // 以前の最大値の保存を引き継がない
const quality = new QualityManager(data.settings.quality, data.settings.autoQuality);

const gfx = new Gfx(document.getElementById('game'));
const world = buildTestScene(gfx.renderer, data.settings.character === 'female' ? 'female' : 'male');
const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 1.6, 4.8);
gfx.init(world.scene, camera);
gfx.shadowLights.push(world.keyLight);
gfx.setExposure(data.settings.exposure);
document.getElementById('exposure').value = data.settings.exposure;

const controls = new OrbitControls(camera, gfx.renderer.domElement);
controls.target.set(0, 1.05, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1.0; controls.maxDistance = 40;

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

// 診断パネル: 負荷の切り分け用(自動調整はOFFにして使う)
const DIAG = { 'd-post': 'post', 'd-msaa': 'msaa', 'd-bloom': 'bloom', 'd-fxaa': 'fxaa', 'd-shadow': 'shadow' };
for (const [id, key] of Object.entries(DIAG)) {
  document.getElementById(id).addEventListener('change', (e) => { gfx.diag[key] = e.target.checked; applyQuality(); });
}

// キー 1〜4 で品質を切り替え
// 古いファイルの混在検出 / 主人公の生成エラー表示
const mods = { 'eventbus.js': mEventbus, 'save.js': Save, 'quality.js': mQuality, 'renderer.js': mRenderer, 'loop.js': mLoop,
  'input.js': mInput, 'env.js': mEnv, 'testScene.js': mTestScene, 'debugPanel.js': mPanel, 'hero.js': mHero };
const stale = Object.entries(mods).filter(([, mod]) => mod.BUILD !== BUILD).map(([n]) => n);
if (stale.length) panel.showNotice('古いファイルが残っています: ' + stale.join(', ') + ' (全ファイルを再アップロードしてください)', 30000);
if (window.__heroError) panel.showNotice('主人公の生成に失敗: ' + window.__heroError, 30000);

// 視点ボタン(正面/側面/背面/斜め)と自動回転
document.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
  const a = parseFloat(b.dataset.a), d = 4.8;
  camera.position.set(Math.sin(a) * d, 1.6, Math.cos(a) * d);
  controls.target.set(0, 1.05, 0);
}));
const spin = document.getElementById('spin');
spin.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  controls.autoRotateSpeed = 1.5;
  spin.setAttribute('aria-pressed', String(controls.autoRotate));
});

// 操作キャラクターの切替(男 / 女)。キー C でも切替
const charBtns = document.querySelectorAll('[data-c]');
const markChar = () => charBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === world.heroKind)));
const pickChar = (k) => {
  world.setHero(k); data.settings.character = k; Save.save(data); markChar();
  if (window.__heroError) panel.showNotice('生成に失敗: ' + window.__heroError, 30000);
};
charBtns.forEach((b) => b.addEventListener('click', () => pickChar(b.dataset.c)));
markChar();
bus.on('key', (c) => { if (c === 'KeyC') pickChar(world.heroKind === 'male' ? 'female' : 'male'); });

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
        calls: gfx.info.render.calls, tris: gfx.info.render.triangles, particles: world.particleCount, aa: gfx.aaLabel, build: BUILD, bloom: gfx.state.bloom,
      });
    }
  },
);
loop.start();
window.__aetherBooted = true;
