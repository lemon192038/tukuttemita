// LocalStorage保存。失敗してもゲームは止めない。
const KEY = 'aetherfall.save.v1';
const DEFAULTS = {
  settings: { quality: 'medium', autoQuality: true, exposure: 1.0, character: 'male' },
  progress: {},
};
const clone = (o) => JSON.parse(JSON.stringify(o));

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    const d = JSON.parse(raw);
    return {
      settings: { ...DEFAULTS.settings, ...(d.settings || {}) },
      progress: { ...DEFAULTS.progress, ...(d.progress || {}) },
    };
  } catch (e) {
    console.warn('[save] load failed', e);
    return clone(DEFAULTS);
  }
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch (e) { console.warn('[save] write failed', e); return false; }
}
export const BUILD = 'r6';
