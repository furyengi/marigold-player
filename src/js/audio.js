import { store } from './store.js';

export const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass boost': [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
  'Treble boost': [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
  Vocal: [-3, -2, -1, 1, 4, 5, 4, 2, 0, -1],
  Rock: [5, 4, 2, -1, -2, 1, 3, 4, 5, 5],
  Pop: [-1, 2, 4, 5, 3, 0, -1, -1, 2, 3],
  Jazz: [3, 2, 1, 2, -2, -2, 0, 1, 3, 4],
  Classical: [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
  Dance: [6, 5, 3, 0, 1, 3, 4, 3, 1, 0],
  Loudness: [6, 4, 0, 0, -2, 0, -1, -5, 5, 1],
};

let ctx = null;
const wired = new WeakSet();
let filters = [];
let preGain = null;

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    preGain = ctx.createGain();
    filters = EQ_FREQS.map((f) => {
      const b = ctx.createBiquadFilter();
      b.type = 'peaking';
      b.frequency.value = f;
      b.Q.value = 1.1;
      return b;
    });
    preGain.connect(filters[0]);
    filters.forEach((f, i) => { if (filters[i + 1]) f.connect(filters[i + 1]); });
    filters[filters.length - 1].connect(ctx.destination);
    applyEq();
  }
  return ctx;
}

/** Route a CORS-enabled media element through the equaliser chain (once per element). */
export function wire(el) {
  if (wired.has(el)) return;
  try {
    const c = ensureCtx();
    c.createMediaElementSource(el).connect(preGain);
    wired.add(el);
  } catch (err) {
    console.warn('EQ unavailable', err);
  }
}

export function resumeContext() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

export function applyEq() {
  if (!ctx) return;
  const a = store.state.audio;
  filters.forEach((f, i) => { f.gain.value = a.eqOn ? a.eq[i] : 0; });
  preGain.gain.value = a.eqOn ? Math.pow(10, a.preamp / 20) : 1;
}

export function setEqBand(i, gain) {
  store.update((s) => { s.audio.eq[i] = gain; s.audio.preset = 'Custom'; }, 'audio');
  applyEq();
}
export function setPreset(name) {
  if (!EQ_PRESETS[name]) return;
  store.update((s) => { s.audio.eq = [...EQ_PRESETS[name]]; s.audio.preset = name; }, 'audio');
  applyEq();
}
export function setPreamp(db) { store.update((s) => { s.audio.preamp = db; }, 'audio'); applyEq(); }
export function setEqOn(on) { store.update((s) => { s.audio.eqOn = on; }, 'audio'); applyEq(); }

// ------------------------------------------------------------ video filters

export function applyVideoFx(...els) {
  const v = store.state.video;
  const f = `brightness(${v.brightness}%) contrast(${v.contrast}%) saturate(${v.saturation}%) hue-rotate(${v.hue}deg)`;
  for (const el of els) {
    el.style.filter = f;
    el.style.objectFit = v.fit;
  }
}

// ------------------------------------------------------------ waveform peaks

const peakCache = new Map();
export async function computePeaks(url, bars = 260, maxBytes = 48 * 1024 * 1024) {
  if (peakCache.has(url)) return peakCache.get(url);
  try {
    const res = await fetch(url);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) return null;
    const dec = new OfflineAudioContext(1, 1, 44100);
    const audio = await dec.decodeAudioData(buf);
    const ch = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / bars));
    const peaks = new Float32Array(bars);
    let max = 0;
    for (let i = 0; i < bars; i++) {
      let m = 0;
      const start = i * step;
      const end = Math.min(ch.length, start + step);
      const stride = Math.max(1, Math.floor((end - start) / 400));
      for (let j = start; j < end; j += stride) { const a = Math.abs(ch[j]); if (a > m) m = a; }
      peaks[i] = m;
      if (m > max) max = m;
    }
    if (max > 0) for (let i = 0; i < bars; i++) peaks[i] = peaks[i] / max;
    if (peakCache.size > 30) peakCache.delete(peakCache.keys().next().value);
    peakCache.set(url, peaks);
    return peaks;
  } catch {
    return null;
  }
}
