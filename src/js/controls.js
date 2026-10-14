import { store } from './store.js';
import { buildItem } from './items.js';
import * as P from './player.js';
import { player } from './player.js';
import { h, clear, fmtTime, clamp } from './ui.js';

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

// ------------------------------------------------------------ item zones

/** A row of customizable items (control bar halves, top bar). `getIds` returns the ids to show right now. */
export function createZone(el, getIds) {
  let built = [];
  let sig = '';
  const rebuild = () => {
    clear(el);
    built = [];
    for (const id of getIds()) {
      const b = buildItem(id);
      if (!b) continue;
      el.append(b.el);
      built.push(b);
    }
  };
  return {
    el,
    /** Rebuild when the id list changed, otherwise just refresh button states. */
    update() {
      const ids = getIds().join();
      if (ids !== sig) { sig = ids; rebuild(); }
      built.forEach((b) => b.refresh());
    },
  };
}

// ------------------------------------------------------------ the bar

export function createControls() {
  const root = document.getElementById('controls');
  const seek = createSeek();
  const cur = h('span.time', null, '00:00:00');
  const dur = h('span.time', null, '00:00:00');

  const idsFor = (zone) => () => {
    const ids = [...store.state.player.layout[zone]];
    // Music mode keeps skip buttons next to play, as in the design.
    if (zone === 'left' && player.kind === 'audio') {
      const i = ids.indexOf('play');
      if (i >= 0 && !ids.some((x) => ['skipBack', 'skipFwd', 'back10', 'fwd10', 'back15', 'fwd15'].includes(x))) ids.splice(i, 1, 'skipBack', 'play', 'skipFwd');
    }
    return ids;
  };
  const left = createZone(h('div.ctl-group'), idsFor('left'));
  const right = createZone(h('div.ctl-group'), idsFor('right'));
  root.append(left.el, cur, seek.el, dur, right.el);

  let wasAudio = null;
  function updateState() {
    const audio = player.kind === 'audio';
    if (audio !== wasAudio) { wasAudio = audio; seek.setWave(audio); }
    left.update();
    right.update();
  }
  function updateTime() {
    cur.textContent = fmtTime(player.time);
    dur.textContent = fmtTime(player.duration);
    seek.update();
  }
  function updateAll() { updateState(); updateTime(); }

  return { updateState, updateTime, updateVolume: updateState, updateAll, renderExtras: updateState, redrawSeek: () => seek.update() };
}
