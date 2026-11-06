import { bus } from './eventbus.js';

const $ = (id) => document.getElementById(id);

export class DebugPanel {
  constructor({ labels, quality, onExposure }) {
    this.stats = $('stats');
    this.select = $('quality');
    this.auto = $('auto');
    this.notice = $('notice');
    this.noticeTimer = 0;
    $('legend').innerHTML = labels.map((l) => `<li>${l}</li>`).join('');
    this.select.value = quality.level;
    this.auto.checked = quality.auto;
    this.select.addEventListener('change', () => { quality.auto = this.auto.checked; quality.set(this.select.value); this.select.blur(); });
    this.auto.addEventListener('change', () => { quality.auto = this.auto.checked; bus.emit('settings', {}); });
    $('exposure').addEventListener('input', (e) => { onExposure(parseFloat(e.target.value)); bus.emit('settings', {}); });
    bus.on('quality', ({ level, from, byAuto }) => {
      this.select.value = level;
      if (byAuto) this.showNotice(`動作が重いため品質を ${from} → ${level} に自動変更しました`);
    });
  }
  showNotice(msg, ms = 6000) {
    this.notice.textContent = msg;
    this.notice.hidden = false;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.notice.hidden = true; }, ms);
  }
  update(d) {
    this.stats.textContent =
      `AETHERFALL  Stage 2  ${d.build}\n` +
      `FPS ${d.fps.toFixed(0)}(上限推定 ${d.cap || '計測中'})  品質 ${d.level}${d.auto ? '(自動)' : ''}\n` +
      `DPR ${d.dpr.toFixed(2)}  描画 ${d.w}x${d.h}\n` +
      `影 ${d.shadow ? d.shadow + 'px' : 'OFF'}  ポスト ${d.post ? 'ON' : 'OFF'}\n` +
      `AA ${d.aa}  ブルーム ${d.bloom ? 'ON' : 'OFF'}\n` +
      `Draw ${d.calls}  Tri ${d.tris}\n` +
      `粒子 ${d.particles}`;
  }
}
export const BUILD = 'r6';
