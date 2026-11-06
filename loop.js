// 固定タイムステップ(60Hz)で更新、描画は可変
export class Loop {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this.fps = 60;
    this.step = 1 / 60;
  }
  start() {
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (dt <= 0) return;
      this.fps += (1 / dt - this.fps) * 0.05;
      acc += dt;
      let n = 0;
      while (acc >= this.step && n < 5) { this.update(this.step); acc -= this.step; n++; }
      if (n === 5) acc = 0;
      this.render(dt);
    };
    requestAnimationFrame(frame);
  }
}
export const BUILD = 'r5';
