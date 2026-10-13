// Small persisted state container. Everything lives in localStorage under one key.
const KEY = 'vlc-redesign:v1';

const defaults = () => ({
  onboarded: false,
  settings: {
    theme: 'dark',
    accent: '#d37918',
    startView: 'home',
    saveHistory: true,
    resume: true,
    autoNext: true,
    skipStep: 10,
    wheelVolume: true,
    idleHide: 2.5,
    thumbs: true,
    autoSubs: true,
    subSize: 28,
    subBg: 60,
    subColor: '#ffffff',
    defaultRate: 1,
  },
  folders: [],
  playlists: [],
  recent: [],
  resume: {},
  streams: [],
  audio: { volume: 0.8, muted: false, preamp: 0, preset: 'Flat', eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], eqOn: true },
  video: { brightness: 100, contrast: 100, saturation: 100, hue: 0, fit: 'contain' },
  player: { controls: [], shuffle: false, repeat: 'off', sidebar: false },
  ui: { layout: { videos: 'grid', music: 'grid', default: 'list' }, sort: { key: 'name', dir: 1 } },
});

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  if (over && typeof over === 'object') {
    for (const k of Object.keys(over)) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

let data;
try { data = merge(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { data = defaults(); }

const listeners = new Set();
let timer = 0;
let dirty = false;
function flush() {
  clearTimeout(timer);
  if (!dirty) return;
  dirty = false;
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}
function persist() {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}
window.addEventListener('beforeunload', flush);

export const store = {
  get state() { return data; },
  get s() { return data.settings; },
  /** Mutate state in place, then persist and notify. `keys` hints what changed. */
  update(fn, key = '*') {
    fn(data);
    persist();
    for (const l of listeners) l(key);
  },
  flush,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  reset() { data = defaults(); persist(); for (const l of listeners) l('*'); },
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
