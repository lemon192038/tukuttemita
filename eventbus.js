// システム間の疎結合な連携用イベントバス
export class EventBus {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { const s = this.map.get(name); if (s) s.delete(fn); }
  emit(name, data) {
    const s = this.map.get(name);
    if (!s) return;
    s.forEach((fn) => { try { fn(data); } catch (e) { console.error('[bus]', name, e); } });
  }
}
export const bus = new EventBus();
export const BUILD = 'r5';
