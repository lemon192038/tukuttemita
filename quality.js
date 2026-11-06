import { bus } from './eventbus.js';

export const LEVELS = ['low', 'medium', 'high', 'ultra'];

// 各項目は実際に描画へ反映される(renderer.js / testScene.js)
export const PRESETS = {
  low:    { dpr: 1.0, shadowSize: 0,    post: false, bloom: 0,    vignette: false, particleScale: 0.25 },
  medium: { dpr: 1.5, shadowSize: 1024, post: true,  bloom: 0.30, vignette: false, particleScale: 0.5 },
  high:   { dpr: 2.0, shadowSize: 2048, post: true,  bloom: 0.40, vignette: true,  particleScale: 1.0 },
  ultra:  { dpr: 2.5, shadowSize: 4096, post: true,  bloom: 0.50, vignette: true,  particleScale: 1.5 },
};

export class QualityManager {
  constructor(level = 'medium', auto = true) {
    this.level = LEVELS.includes(level) ? level : 'medium';
    this.auto = auto;
    this.lowTime = 0;
    this.cooldown = 5; // 起動直後は判定しない
    this.age = 0;
    this.peak = 0;     // 観測した最大FPS(画面のリフレッシュ上限の推定に使う)
  }
  get preset() { return PRESETS[this.level]; }

  // 低電力モード(30fps上限)等を考慮した上限FPSの推定。未計測ならnull。
  get cap() {
    if (this.peak <= 0) return null;
    return this.peak >= 100 ? 120 : this.peak >= 52 ? 60 : 30;
  }

  set(level, { byAuto = false } = {}) {
    if (!LEVELS.includes(level)) return;
    const from = this.level;
    this.level = level;
    this.lowTime = 0;
    this.cooldown = 5;
    bus.emit('quality', { level, from, byAuto });
  }

  // 「上限の80%未満」が3秒続いたら1段階下げる(UIに通知する)
  tick(fps, dt) {
    this.age += dt;
    if (this.age > 5) this.peak = Math.max(this.peak, fps);
    if (!this.auto) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const cap = this.cap;
    if (this.cooldown > 0 || !cap) return;
    this.lowTime = fps < cap * 0.8 ? this.lowTime + dt : 0;
    const i = LEVELS.indexOf(this.level);
    if (this.lowTime > 3 && i > 0) this.set(LEVELS[i - 1], { byAuto: true });
  }
}
