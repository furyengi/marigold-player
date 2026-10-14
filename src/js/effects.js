import { store } from './store.js';
import * as P from './player.js';
import { player } from './player.js';
import * as A from './audio.js';
import { h, clear, iconButton, closeMenu, toggle, select, range } from './ui.js';

let panel = null;
const tab = { main: 'audio', audio: 'eq', video: 'essential' };

export function closeEffects() {
  if (panel) { panel.remove(); panel = null; document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', onKey, true); }
}
const outside = (e) => { if (panel && !panel.contains(e.target) && !e.target.closest('.popover, .backdrop')) closeEffects(); };
const onKey = (e) => { if (e.key === 'Escape') { closeEffects(); e.stopPropagation(); } };

/** Floating panel above the control bar. `section` can be 'audio' or 'video' to jump to a tab. */
export function openEffects(anchor, section) {
  if (panel && !section) { closeEffects(); return; }
  closeEffects();
  closeMenu();
  if (section) tab.main = section;
  const el = h('div.fx');
  const draw = () => {
    clear(el);
    const main = h('div.fx-tabs', null,
      ...[['audio', 'Audio'], ['video', 'Video']].map(([id, label]) => h('button' + (tab.main === id ? '.on' : ''), { onclick: () => { tab.main = id; draw(); } }, label)),
      h('span', { style: { flex: 1 } }),
      iconButton('close', { title: 'Close', size: 18, onclick: closeEffects }));
    const subs = tab.main === 'audio'
      ? [['eq', 'Equalizer'], ['comp', 'Compressor'], ['spatial', 'Spatializer'], ['widen', 'Stereo widener']]
      : [['essential', 'Essential'], ['crop', 'Crop'], ['colors', 'Colors'], ['transform', 'Transform']];
    const subRow = h('div.fx-tabs.sub', null, ...subs.map(([id, label]) => h('button' + (tab[tab.main] === id ? '.on' : ''), { onclick: () => { tab[tab.main] = id; draw(); } }, label)));
    const builders = { eq, comp, spatial, widen, essential, crop, colors, transform };
    el.append(main, subRow, builders[tab[tab.main]](draw));
  };
  draw();
  document.body.append(el);
  const r = anchor ? anchor.getBoundingClientRect() : { right: innerWidth - 20 };
  el.style.right = Math.max(10, innerWidth - r.right - 8) + 'px';
  el.style.bottom = '64px';
  panel = el;
  setTimeout(() => { document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', onKey, true); });
}

// ------------------------------------------------------------ helpers

function slider(label, { min, max, step = 1, value, unit = '', onInput, digits = 0 }) {
  const out = h('output', null, fmt(value));
  function fmt(v) { return `${Number(v).toFixed(digits)}${unit}`; }
  const input = range({ min, max, step, value, onInput: (v) => { out.textContent = fmt(v); onInput(v); } });
  return h('div.fx-row', null, h('span', null, label), input, out);
}
const head = (title, on, onChange) => h('div.fx-top', null, h('div', { style: { color: 'var(--fg-2)', fontSize: '13px' } }, title), on === null ? null : toggle(on, onChange));
const reset = (fn) => h('div', { style: { marginTop: '10px' } }, h('button.btn.ghost', { onclick: fn }, 'Reset'));
const note = () => (player.current && player.current.remote ? h('p.dlg-note', { style: { margin: '10px 0 0' } }, 'Audio effects only work on local files; network streams play unprocessed.') : null);

// ------------------------------------------------------------ audio

function eq(redraw) {
  const a = store.state.audio;
  const body = h('div.fx-body');
  const presets = Object.keys(A.EQ_PRESETS);
  if (a.preset === 'Custom') presets.push('Custom');
  body.append(h('div.fx-top', null, select(presets.map((p) => [p, p]), a.preset, (v) => { A.setPreset(v); redraw(); }),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--fg-2)', fontSize: '13px' } }, 'Equalizer', toggle(a.eqOn, (v) => A.setEqOn(v)))));
  const bands = h('div.eq-bands');
  A.EQ_FREQS.forEach((f, i) => {
    const inp = h('input', { type: 'range', min: -12, max: 12, step: 0.5, value: a.eq[i], title: `${a.eq[i]} dB`, oninput: (e) => { A.setEqBand(i, Number(e.target.value)); e.target.title = `${e.target.value} dB`; } });
    bands.append(h('div.eq-band', null, inp, f >= 1000 ? `${f / 1000}k` : f));
  });
  body.append(bands,
    slider('Preamp', { min: -12, max: 12, step: 0.5, value: a.preamp, unit: ' dB', onInput: A.setPreamp, digits: 1 }),
    slider('Speed', { min: 0.25, max: 3, step: 0.05, value: player.rate, unit: '×', digits: 2, onInput: (v) => P.setRate(Math.round(v * 100) / 100) }),
    note());
  return body;
}

function comp(redraw) {
  const c = store.state.audio.comp;
  const set = (patch) => A.setFx('comp', patch);
  return h('div.fx-body', null,
    head('Dynamic range compressor', c.on, (v) => set({ on: v })),
    h('p.dlg-note', { style: { margin: '0 0 6px' } }, 'Evens out loud and quiet passages. Handy for movies at night.'),
    slider('Threshold', { min: -60, max: 0, value: c.threshold, unit: ' dB', onInput: (v) => set({ threshold: v }) }),
    slider('Knee', { min: 0, max: 40, value: c.knee, unit: ' dB', onInput: (v) => set({ knee: v }) }),
    slider('Ratio', { min: 1, max: 20, step: 0.5, value: c.ratio, unit: ':1', digits: 1, onInput: (v) => set({ ratio: v }) }),
    slider('Attack', { min: 0, max: 100, value: c.attack, unit: ' ms', onInput: (v) => set({ attack: v }) }),
    slider('Release', { min: 10, max: 1000, step: 10, value: c.release, unit: ' ms', onInput: (v) => set({ release: v }) }),
    slider('Make-up gain', { min: 0, max: 24, step: 0.5, value: c.makeup, unit: ' dB', digits: 1, onInput: (v) => set({ makeup: v }) }),
    reset(() => { A.resetFx('comp'); redraw(); }), note());
}

function spatial(redraw) {
  const s = store.state.audio.spatial;
  const set = (patch) => A.setFx('spatial', patch);
  return h('div.fx-body', null,
    head('Spatializer', s.on, (v) => set({ on: v })),
    h('p.dlg-note', { style: { margin: '0 0 6px' } }, 'Adds a sense of room around the sound, best with headphones.'),
    slider('Room size', { min: 0, max: 100, value: s.room, unit: '%', onInput: (v) => set({ room: v }) }),
    slider('Mix', { min: 0, max: 100, value: s.mix, unit: '%', onInput: (v) => set({ mix: v }) }),
    reset(() => { A.resetFx('spatial'); redraw(); }), note());
}

function widen(redraw) {
  const w = store.state.audio.widen;
  const set = (patch) => A.setFx('widen', patch);
  return h('div.fx-body', null,
    head('Stereo widener', w.on, (v) => set({ on: v })),
    h('p.dlg-note', { style: { margin: '0 0 6px' } }, '0% is mono, 100% is the original mix and 200% is extra wide.'),
    slider('Width', { min: 0, max: 200, value: w.width, unit: '%', onInput: (v) => set({ width: v }) }),
    reset(() => { A.resetFx('widen'); redraw(); }), note());
}

// ------------------------------------------------------------ video

function essential(redraw) {
  const v = store.state.video;
  const set = (patch) => A.setVideo(patch);
  return h('div.fx-body', null,
    slider('Brightness', { min: 40, max: 180, value: v.brightness, unit: '%', onInput: (x) => set({ brightness: x }) }),
    slider('Contrast', { min: 40, max: 180, value: v.contrast, unit: '%', onInput: (x) => set({ contrast: x }) }),
    slider('Saturation', { min: 0, max: 220, value: v.saturation, unit: '%', onInput: (x) => set({ saturation: x }) }),
    slider('Hue', { min: -180, max: 180, value: v.hue, unit: '°', onInput: (x) => set({ hue: x }) }),
    slider('Gamma', { min: 50, max: 200, value: v.gamma, unit: '%', onInput: (x) => set({ gamma: x }) }),
    h('div.fx-row', null, h('span', null, 'Aspect'), select([['contain', 'Fit to window'], ['cover', 'Fill (crop edges)'], ['fill', 'Stretch']], v.fit, (x) => set({ fit: x }))),
    reset(() => { A.resetVideo(['brightness', 'contrast', 'saturation', 'hue', 'gamma', 'fit']); redraw(); }));
}

function crop(redraw) {
  const c = store.state.video.crop;
  const set = (side, val) => A.setVideo({ crop: { ...store.state.video.crop, [side]: val } });
  return h('div.fx-body', null,
    h('p.dlg-note', { style: { margin: '0 0 6px' } }, 'Trim the edges of the picture, for example to remove black bars.'),
    slider('Top', { min: 0, max: 40, value: c.t, unit: '%', onInput: (x) => set('t', x) }),
    slider('Bottom', { min: 0, max: 40, value: c.b, unit: '%', onInput: (x) => set('b', x) }),
    slider('Left', { min: 0, max: 40, value: c.l, unit: '%', onInput: (x) => set('l', x) }),
    slider('Right', { min: 0, max: 40, value: c.r, unit: '%', onInput: (x) => set('r', x) }),
    reset(() => { A.resetVideo(['crop']); redraw(); }));
}

function colors(redraw) {
  const v = store.state.video;
  const row = (label, key) => h('div.fx-top', null, h('div', { style: { color: 'var(--fg-1)', fontSize: '13px' } }, label), toggle(v[key], (x) => A.setVideo({ [key]: x })));
  return h('div.fx-body', null, row('Black and white', 'gray'), row('Sepia', 'sepia'), row('Invert colors', 'invert'),
    reset(() => { A.resetVideo(['gray', 'sepia', 'invert']); redraw(); }));
}

function transform(redraw) {
  const v = store.state.video;
  const set = (patch) => A.setVideo(patch);
  const rot = h('div.segmented', null, ...[0, 90, 180, 270].map((d) => h('button' + (v.rotate === d ? '.on' : ''), { style: { minWidth: '56px' }, onclick: () => { set({ rotate: d }); redraw(); } }, `${d}°`)));
  return h('div.fx-body', null,
    h('div.fx-top', null, h('div', { style: { color: 'var(--fg-1)', fontSize: '13px' } }, 'Rotate'), rot),
    h('div.fx-top', null, h('div', { style: { color: 'var(--fg-1)', fontSize: '13px' } }, 'Flip horizontally'), toggle(v.flipH, (x) => set({ flipH: x }))),
    h('div.fx-top', null, h('div', { style: { color: 'var(--fg-1)', fontSize: '13px' } }, 'Flip vertically'), toggle(v.flipV, (x) => set({ flipV: x }))),
    slider('Zoom', { min: 100, max: 300, step: 5, value: v.zoom, unit: '%', onInput: (x) => set({ zoom: x }) }),
    reset(() => { A.resetVideo(['rotate', 'flipH', 'flipV', 'zoom']); redraw(); }));
}
