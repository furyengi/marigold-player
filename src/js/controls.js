import { store } from './store.js';
import * as P from './player.js';
import { player } from './player.js';
import { h, clear, fmtTime, clamp } from './ui.js';
import { icon, skipIcon } from './icons.js';
import { EXTRAS } from './extras.js';

// ------------------------------------------------------------ seek bar

function createSeek() {
  const fill = h('div.seek-fill');
  const buf = h('div.seek-buf');
  const handle = h('div.seek-handle');
  const canvas = h('canvas');
  const tip = h('div.seek-tip');
  tip.hidden = true;
  const el = h('div.seek', { role: 'slider', 'aria-label': 'Seek' }, buf, fill, canvas, handle, tip);
  const ctx2d = canvas.getContext('2d');
  let wave = false;
  let dragging = false;

  const frac = (e) => {
    const r = el.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  };
  const seekTo = (e) => { if (player.duration) P.seekBy(frac(e) * player.duration - player.time); };
  el.addEventListener('pointerdown', (e) => { dragging = true; el.setPointerCapture(e.pointerId); seekTo(e); });
  el.addEventListener('pointermove', (e) => {
    if (dragging) seekTo(e);
    if (!player.duration) return;
    const r = el.getBoundingClientRect();
    tip.hidden = false;
    tip.textContent = fmtTime(frac(e) * player.duration);
    tip.style.left = clamp(e.clientX - r.left, 30, r.width - 30) + 'px';
  });
  el.addEventListener('pointerup', () => { dragging = false; });
  el.addEventListener('pointerleave', () => { tip.hidden = true; });
  el.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') P.seekBy(-5); if (e.key === 'ArrowRight') P.seekBy(5); });

  function drawWave(p) {
    const w = el.clientWidth;
    const hgt = el.clientHeight;
    if (!w) return;
    const dpr = devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr); }
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, hgt);
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#d37918';
    const dim = css.getPropertyValue('--fg-4').trim() || '#404040';
    const step = 5;
    const n = Math.floor(w / step);
    const peaks = player.peaks;
    for (let i = 0; i < n; i++) {
      const x = i * step + 1;
      let a = 0.1;
      if (peaks) a = Math.max(0.08, peaks[Math.min(peaks.length - 1, Math.floor((i / n) * peaks.length))]);
      const bh = Math.max(2, a * (hgt - 6));
      ctx2d.fillStyle = i / n <= p ? accent : dim;
      ctx2d.fillRect(x, (hgt - bh) / 2, 2, bh);
    }
    handle.style.left = p * w + 'px';
  }

  return {
    el,
    setWave(on) { wave = on; el.classList.toggle('wave', on); handle.classList.toggle('w', on); },
    update() {
      const d = player.duration;
      const p = d ? clamp(player.time / d, 0, 1) : 0;
      if (wave) { drawWave(p); return; }
      fill.style.width = p * 100 + '%';
      handle.style.left = p * 100 + '%';
      const b = player.el.buffered;
      buf.style.width = d && b.length ? clamp(b.end(b.length - 1) / d, 0, 1) * 100 + '%' : '0';
    },
  };
}

// ------------------------------------------------------------ volume

function createVolume() {
  const icoBtn = h('button.ctl', { title: 'Mute (M)', onclick: () => P.toggleMute() });
  const fillWrap = h('div.vol-fill-wrap', null, h('div.vol-fill'));
  const track = h('div.vol-track', { role: 'slider', 'aria-label': 'Volume' }, h('div.vol-shape'), fillWrap);
  const set = (e) => {
    const r = track.getBoundingClientRect();
    P.setVolume(clamp((e.clientX - r.left) / r.width, 0, 1));
  };
  let drag = false;
  track.addEventListener('pointerdown', (e) => { drag = true; track.setPointerCapture(e.pointerId); set(e); });
  track.addEventListener('pointermove', (e) => { if (drag) set(e); });
  track.addEventListener('pointerup', () => { drag = false; });
  const el = h('div.vol', null, icoBtn, track);
  return {
    el,
    update() {
      const v = player.volume;
      icoBtn.innerHTML = icon(v === 0 ? 'volumeMute' : v < 0.5 ? 'volumeLow' : 'volume', 20);
      fillWrap.style.width = v * 100 + '%';
      track.title = `${Math.round(v * 100)}%`;
    },
  };
}

// ------------------------------------------------------------ the bar

export function createControls({ onEffects, onSubtitles, onSettings, onQueue }) {
  const root = document.getElementById('controls');
  const seek = createSeek();
  const vol = createVolume();
  const cur = h('span.time', null, '00:00:00');
  const dur = h('span.time', null, '00:00:00');
  const prevBtn = h('button.ctl', { title: 'Previous (P)', html: icon('prev', 20), onclick: () => P.prev() });
  const nextBtn = h('button.ctl', { title: 'Next (N)', html: icon('next', 20), onclick: () => P.next() });
  const playBtn = h('button.ctl-play', { title: 'Play / Pause (Space)', onclick: () => P.toggle() });
  const backBtn = h('button.ctl', { title: 'Skip back', onclick: () => P.seekBy(-store.s.skipStep) });
  const fwdBtn = h('button.ctl', { title: 'Skip forward', onclick: () => P.seekBy(store.s.skipStep) });
  const transport = h('div.ctl-group');
  const extras = h('div.ctl-group');
  const fxBtn = h('button.ctl', { title: 'Effects & equalizer', html: icon('equalizer', 20), onclick: (e) => onEffects(e.currentTarget) });
  const subBtn = h('button.ctl', { title: 'Subtitles', html: icon('subtitles', 20), onclick: (e) => onSubtitles(e.currentTarget) });
  const setBtn = h('button.ctl', { title: 'Settings (Ctrl+,)', html: icon('settings', 20), onclick: onSettings });
  const queueBtn = h('button.ctl', { title: 'Queue', html: icon('queue', 20), onclick: onQueue });
  const right = h('div.ctl-group', null, fxBtn, subBtn, setBtn, queueBtn);

  root.append(transport, cur, seek.el, dur, extras, vol.el, right);

  let isAudio = null;
  function layoutTransport() {
    const audio = player.kind === 'audio';
    if (audio === isAudio) return;
    isAudio = audio;
    clear(transport);
    backBtn.innerHTML = skipIcon(-1, store.s.skipStep);
    fwdBtn.innerHTML = skipIcon(1, store.s.skipStep);
    transport.append(prevBtn, ...(audio ? [backBtn] : []), playBtn, ...(audio ? [fwdBtn] : []), nextBtn);
    seek.setWave(audio);
    renderExtras();
  }

  function renderExtras() {
    clear(extras);
    const chosen = store.state.player.controls;
    for (const x of EXTRAS) {
      if (!chosen.includes(x.id)) continue;
      if (isAudio && (x.id === 'skipBack' || x.id === 'skipFwd')) continue; // already beside play
      const b = h('button.ctl' + (x.active && x.active() ? '.on' : ''), { title: x.label, html: x.icon(), onclick: (e) => { x.run(e.currentTarget); setTimeout(updateAll, 0); } });
      extras.append(b);
    }
  }

  function updateState() {
    layoutTransport();
    playBtn.innerHTML = icon(player.playing ? 'pause' : 'play', 20);
    const none = !player.current;
    playBtn.disabled = none;
    backBtn.disabled = fwdBtn.disabled = none;
    prevBtn.disabled = none || (player.queue.length < 2 && player.time < 3);
    nextBtn.disabled = none || (player.order.indexOf(player.index) >= player.order.length - 1 && player.repeat !== 'all');
    subBtn.classList.toggle('on', player.subIndex >= 0);
    subBtn.hidden = player.kind === 'audio';
    renderExtras();
  }

  function updateTime() {
    cur.textContent = fmtTime(player.time);
    dur.textContent = fmtTime(player.duration);
    seek.update();
  }

  function updateAll() { updateState(); updateTime(); vol.update(); }

  return { updateState, updateTime, updateVolume: () => vol.update(), updateAll, renderExtras, redrawSeek: () => seek.update() };
}

