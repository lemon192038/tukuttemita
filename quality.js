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
    this.cooldown = 4; // 起動直後は判定しない
  }
  get preset() { return PRESETS[this.level]; }

  set(level, { byAuto = false } = {}) {
    if (!LEVELS.includes(level)) return;
    const from = this.level;
    this.level = level;
    this.lowTime = 0;
    this.cooldown = 5;
    bus.emit('quality', { level, from, byAuto });
  }

  // FPSが低い状態が続いたら1段階下げる(UIに通知する)
  tick(fps, dt) {
    if (!this.auto) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0) return;
    this.lowTime = fps < 38 ? this.lowTime + dt : 0;
    const i = LEVELS.indexOf(this.level);
    if (this.lowTime > 3 && i > 0) this.set(LEVELS[i - 1], { byAuto: true });
  }
}
