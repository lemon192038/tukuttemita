import { bus } from './eventbus.js';

// 第1段階: キーボードのみ。タッチUIは第3段階で追加。
export class Input {
  constructor() {
    this.down = new Set();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      bus.emit('key', e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }
  isDown(code) { return this.down.has(code); }
}
export const BUILD = 'r7';
