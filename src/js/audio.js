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

// Signal path: source -> preamp -> 10-band EQ -> [stereo widener] -> [spatializer] -> [compressor] -> [normalizer] -> out.
// Optional stages are bypassed by rewiring, so they cost nothing while off.
let ctx = null;
const wired = new WeakSet();
let preGain = null;
let filters = [];
let eqOut = null;
let master = null;
const stages = {};
let signature = '';
let irKey = '';

function makeStages() {
  // Stereo widener: mid/side matrix with four gains.
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const g = { ll: ctx.createGain(), lr: ctx.createGain(), rl: ctx.createGain(), rr: ctx.createGain() };
  split.connect(g.ll, 0); split.connect(g.lr, 0); split.connect(g.rl, 1); split.connect(g.rr, 1);
  g.ll.connect(merge, 0, 0); g.rl.connect(merge, 0, 0);
  g.lr.connect(merge, 0, 1); g.rr.connect(merge, 0, 1);
  stages.widen = { input: split, output: merge, g };

  // Spatializer: a generated room impulse response mixed in parallel with the dry signal.
  const sIn = ctx.createGain();
  const sOut = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const conv = ctx.createConvolver();
  sIn.connect(dry).connect(sOut);
  sIn.connect(conv).connect(wet).connect(sOut);
  stages.spatial = { input: sIn, output: sOut, dry, wet, conv };

  // Compressor with make-up gain.
  const comp = ctx.createDynamicsCompressor();
  const makeup = ctx.createGain();
  comp.connect(makeup);
  stages.comp = { input: comp, output: makeup, comp, makeup };

  // Loudness normaliser: gentle, fixed-curve compressor plus lift.
  const nComp = ctx.createDynamicsCompressor();
  nComp.threshold.value = -34;
  nComp.knee.value = 24;
  nComp.ratio.value = 8;
  nComp.attack.value = 0.01;
  nComp.release.value = 0.3;
  const nGain = ctx.createGain();
  nGain.gain.value = Math.pow(10, 7 / 20);
  nComp.connect(nGain);
  stages.norm = { input: nComp, output: nGain };
}

function ensureCtx() {
  if (ctx) return ctx;
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
  eqOut = filters[filters.length - 1];
  master = ctx.createGain();
  master.connect(ctx.destination);
  makeStages();
  applyAudioFx();
  return ctx;
}

/** Route a CORS-enabled media element through the effects chain (once per element). */
export function wire(el) {
  if (wired.has(el)) return;
  try {
    const c = ensureCtx();
    c.createMediaElementSource(el).connect(preGain);
    wired.add(el);
  } catch (err) {
    console.warn('Audio effects unavailable', err);
  }
}

let recDest = null;
/** Audio as processed by the effects chain, for recording. Null until a local file has been wired. */
export function recordingStream() {
  if (!ctx || !master) return null;
  if (!recDest) { recDest = ctx.createMediaStreamDestination(); master.connect(recDest); }
  return recDest.stream;
}

export function resumeContext() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }

function impulse(seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  return buf;
}

/** Push every audio setting into the graph. Cheap enough to call on each slider move. */
export function applyAudioFx() {
  if (!ctx) return;
  const a = store.state.audio;
  filters.forEach((f, i) => { f.gain.value = a.eqOn ? a.eq[i] : 0; });
  preGain.gain.value = a.eqOn ? Math.pow(10, a.preamp / 20) : 1;

  const w = a.widen.width / 100;
  const { g } = stages.widen;
  g.ll.gain.value = g.rr.gain.value = (1 + w) / 2;
  g.lr.gain.value = g.rl.gain.value = (1 - w) / 2;

  const sp = a.spatial;
  const key = String(sp.room);
  if (key !== irKey) { irKey = key; stages.spatial.conv.buffer = impulse(0.2 + (sp.room / 100) * 3.2); }
  stages.spatial.wet.gain.value = sp.mix / 100;
  stages.spatial.dry.gain.value = 1 - (sp.mix / 100) * 0.5;

  const c = a.comp;
  const { comp, makeup } = stages.comp;
  comp.threshold.value = c.threshold;
  comp.knee.value = c.knee;
  comp.ratio.value = c.ratio;
  comp.attack.value = c.attack / 1000;
  comp.release.value = c.release / 1000;
  makeup.gain.value = Math.pow(10, c.makeup / 20);

  const on = { widen: a.widen.on, spatial: sp.on, comp: c.on, norm: store.s.normalize };
  const sig = Object.values(on).join();
  if (sig !== signature) {
    signature = sig;
    for (const n of [eqOut, ...Object.values(stages).map((s) => s.output)]) { try { n.disconnect(); } catch {} }
    let prev = eqOut;
    for (const name of ['widen', 'spatial', 'comp', 'norm']) {
      if (!on[name]) continue;
      prev.connect(stages[name].input);
      prev = stages[name].output;
    }
    prev.connect(master);
  }
}
export const applyEq = applyAudioFx;

export function setEqBand(i, gain) {
  store.update((s) => { s.audio.eq[i] = gain; s.audio.preset = 'Custom'; }, 'audio');
  applyAudioFx();
}
export function setPreset(name) {
  if (!EQ_PRESETS[name]) return;
  store.update((s) => { s.audio.eq = [...EQ_PRESETS[name]]; s.audio.preset = name; }, 'audio');
  applyAudioFx();
}
export function setPreamp(db) { store.update((s) => { s.audio.preamp = db; }, 'audio'); applyAudioFx(); }
export function setEqOn(on) { store.update((s) => { s.audio.eqOn = on; }, 'audio'); applyAudioFx(); }

/** Update one effect group, e.g. setFx('comp', { ratio: 6 }). */
export function setFx(group, patch) {
  store.update((s) => { Object.assign(s.audio[group], patch); }, 'audio');
  applyAudioFx();
}
export const FX_DEFAULTS = {
  comp: { on: false, threshold: -24, knee: 30, ratio: 4, attack: 3, release: 250, makeup: 0 },
  widen: { on: false, width: 100 },
  spatial: { on: false, room: 40, mix: 25 },
};
export function resetFx(group) { setFx(group, { ...FX_DEFAULTS[group] }); }

// ------------------------------------------------------------ video filters

/** Apply every picture setting (colour, crop, rotation, flip, zoom) to the media elements. */
export function applyVideoFx() {
  const v = store.state.video;
  const parts = [`brightness(${v.brightness}%)`, `contrast(${v.contrast}%)`, `saturate(${v.saturation}%)`, `hue-rotate(${v.hue}deg)`];
  if (v.gray) parts.push('grayscale(1)');
  if (v.sepia) parts.push('sepia(1)');
  if (v.invert) parts.push('invert(1)');
  if (v.gamma !== 100) {
    const e = (1 / (v.gamma / 100)).toFixed(3);
    const fx = document.getElementById('mg-gamma');
    if (fx) fx.querySelectorAll('feFuncR,feFuncG,feFuncB').forEach((n) => n.setAttribute('exponent', e));
    parts.push('url(#mg-gamma-filter)');
  }
  const crop = v.crop;
  const cropped = crop.t || crop.r || crop.b || crop.l;
  for (const el of document.querySelectorAll('#mediaSlot video')) {
    el.style.filter = parts.join(' ');
    el.style.objectFit = v.fit;
    el.style.objectViewBox = cropped ? `inset(${crop.t}% ${crop.r}% ${crop.b}% ${crop.l}%)` : '';
    const sx = (v.flipH ? -1 : 1) * (v.zoom / 100);
    const sy = (v.flipV ? -1 : 1) * (v.zoom / 100);
    // A quarter turn swaps the box's width and height, so shrink it to stay inside the stage.
    let fit = 1;
    if (v.rotate % 180 !== 0) {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      fit = Math.min(w / h, h / w);
    }
    const transform = `rotate(${v.rotate}deg) scale(${sx * fit}, ${sy * fit})`;
    el.style.transform = v.rotate || v.flipH || v.flipV || v.zoom !== 100 ? transform : '';
  }
}
window.addEventListener('resize', () => { if (store.state.video.rotate % 180 !== 0) applyVideoFx(); });

export function setVideo(patch) {
  store.update((s) => { Object.assign(s.video, patch); }, 'video');
  applyVideoFx();
}
export const VIDEO_DEFAULTS = {
  brightness: 100, contrast: 100, saturation: 100, hue: 0, gamma: 100, fit: 'contain',
  crop: { t: 0, r: 0, b: 0, l: 0 }, rotate: 0, flipH: false, flipV: false, zoom: 100,
  gray: false, sepia: false, invert: false,
};
export function resetVideo(keys) {
  const patch = {};
  for (const k of keys) patch[k] = structuredClone(VIDEO_DEFAULTS[k]);
  setVideo(patch);
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
