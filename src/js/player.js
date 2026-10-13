import { store, uid } from './store.js';
import * as fx from './audio.js';
import { baseName, stripExt, dirName, clamp } from './ui.js';

const handlers = {};
const emit = (ev, d) => (handlers[ev] || []).forEach((f) => f(d));
export const on = (ev, fn) => { (handlers[ev] ||= []).push(fn); };

const AUDIO_URL = /\.(mp3|flac|wav|ogg|oga|opus|m4a|aac|aif|aiff)(\?|#|$)/i;

export function toItem(entry) {
  return { id: uid(), path: entry.path, name: entry.name, kind: entry.kind, folder: dirName(entry.path), size: entry.size, ext: entry.ext, title: stripExt(entry.name) };
}
export function streamItem(url, name) {
  let n = name;
  if (!n) { try { n = decodeURIComponent(baseName(new URL(url).pathname)) || url; } catch { n = url; } }
  return { id: uid(), url, name: n, title: n, kind: AUDIO_URL.test(url) ? 'audio' : 'video', remote: true };
}

function makeEl(cls, cross) {
  const v = document.createElement('video');
  v.className = cls;
  v.preload = 'auto';
  v.playsInline = true;
  if (cross) v.crossOrigin = 'anonymous';
  v.poster = '../assets/idle.png';
  return v;
}

const slot = document.getElementById('mediaSlot');
const local = makeEl('local', true);
const remote = makeEl('remote', false);
remote.hidden = true;
slot.append(local, remote);

export const player = {
  queue: [],
  index: -1,
  order: [],
  el: local,
  slot,
  subs: [],
  subIndex: -1,
  meta: null,
  peaks: null,
  error: null,
  get current() { return this.queue[this.index] || null; },
  get playing() { return !!this.current && !this.el.paused && !this.el.ended; },
  get kind() { return this.current ? this.current.kind : null; },
  get duration() { return Number.isFinite(this.el.duration) ? this.el.duration : 0; },
  get time() { return this.el.currentTime || 0; },
  get repeat() { return store.state.player.repeat; },
  get shuffle() { return store.state.player.shuffle; },
  get volume() { return store.state.audio.muted ? 0 : store.state.audio.volume; },
};

function setupEl(el) {
  const live = (fn) => (e) => { if (e.target === player.el) fn(e); };
  el.addEventListener('play', live(() => { fx.resumeContext(); emit('state'); }));
  el.addEventListener('pause', live(() => { saveResume(); emit('state'); }));
  el.addEventListener('playing', live(() => { player.error = null; emit('state'); }));
  el.addEventListener('waiting', live(() => emit('state')));
  el.addEventListener('timeupdate', live(() => emit('time')));
  el.addEventListener('durationchange', live(() => emit('time')));
  el.addEventListener('progress', live(() => emit('time')));
  el.addEventListener('ended', live(() => { saveResume(true); emit('state'); if (store.s.autoNext || player.repeat === 'one') next(true); }));
  el.addEventListener('loadedmetadata', live(() => {
    const it = player.current;
    if (!it) return;
    // A "video" with no picture is really audio (e.g. an .mp4 or .mkv holding only a soundtrack).
    if (it.kind === 'video' && el.videoWidth === 0) { it.kind = 'audio'; emit('item'); }
    if (it.pendingSeek) { el.currentTime = it.pendingSeek; it.pendingSeek = 0; }
    emit('time');
  }));
  el.addEventListener('error', live(() => {
    const it = player.current;
    if (!it || !el.getAttribute('src')) return;
    const code = el.error && el.error.code;
    player.error = it.remote
      ? "Couldn't load this stream. It may be offline, need a different protocol (HLS/DASH aren't supported yet), or block playback from apps."
      : code === 4
        ? "This file can't be played. Its video or audio codec isn't supported by the built-in decoder (common with HEVC/H.265, AC-3 and DTS)."
        : "Something went wrong while decoding this file.";
    emit('error', player.error);
    emit('state');
  }));
}
setupEl(local);
setupEl(remote);

// ------------------------------------------------------------ queue handling

function rebuildOrder(keepCurrent = true) {
  const idx = player.queue.map((_, i) => i);
  if (store.state.player.shuffle) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    if (keepCurrent && player.index >= 0) {
      const at = idx.indexOf(player.index);
      if (at > 0) { idx.splice(at, 1); idx.unshift(player.index); }
    }
  }
  player.order = idx;
}

export function play(items, start = 0) {
  if (!items.length) return;
  player.queue = items.slice();
  player.index = clamp(start, 0, items.length - 1);
  rebuildOrder();
  emit('queue');
  load(player.index);
}

export function enqueue(items, playNext = false) {
  if (!player.queue.length) return play(items, 0);
  const at = playNext ? player.index + 1 : player.queue.length;
  player.queue.splice(at, 0, ...items);
  rebuildOrder();
  emit('queue');
}

export function removeAt(i) {
  if (i === player.index) return;
  player.queue.splice(i, 1);
  if (i < player.index) player.index--;
  rebuildOrder();
  emit('queue');
}

export function clearQueue() {
  const cur = player.current;
  player.queue = cur ? [cur] : [];
  player.index = cur ? 0 : -1;
  rebuildOrder();
  emit('queue');
}

export function playIndex(i) { if (i >= 0 && i < player.queue.length) { player.index = i; load(i); } }

async function load(i) {
  saveResume();
  const it = player.queue[i];
  if (!it) return;
  player.index = i;
  const useRemote = !!it.url;
  const el = useRemote ? remote : local;
  const other = useRemote ? local : remote;
  other.pause();
  other.removeAttribute('src');
  other.load();
  other.hidden = true;
  el.hidden = false;
  player.el = el;
  player.error = null;
  player.meta = null;
  player.peaks = null;
  clearSubs();
  el.querySelectorAll('track').forEach((t) => t.remove());

  const url = useRemote ? it.url : window.vlc.mediaUrl(it.path);
  el.poster = it.kind === 'audio' ? '' : '../assets/idle.png';
  el.volume = store.state.audio.volume;
  el.muted = store.state.audio.muted;
  el.defaultPlaybackRate = el.playbackRate = player.rate || store.s.defaultRate || 1;
  if (!useRemote) fx.wire(el);
  fx.applyVideoFx(local, remote);

  const saved = !useRemote && store.s.resume && store.state.resume[it.path];
  it.pendingSeek = saved && saved.t > 10 && saved.d && saved.t < saved.d - 15 ? saved.t : 0;

  el.src = url;
  emit('item');
  emit('queue');
  el.play().catch(() => {});

  if (!useRemote) {
    remember(it);
    if (it.kind === 'audio') loadAudioExtras(it, url);
    loadSiblingSubs(it);
  }
  mediaSession(it);
}

async function loadAudioExtras(it, url) {
  const m = await window.vlc.meta(it.path);
  if (player.current !== it) return;
  if (m) {
    player.meta = m;
    if (m.title) it.title = m.title;
    emit('meta');
  }
  const peaks = await fx.computePeaks(url);
  if (player.current !== it) return;
  player.peaks = peaks;
  emit('peaks');
}

function remember(it) {
  if (!store.s.saveHistory) return;
  store.update((s) => {
    s.recent = [{ path: it.path, name: it.name, kind: it.kind, ts: Date.now() }, ...s.recent.filter((r) => r.path !== it.path)].slice(0, 100);
  }, 'recent');
}

export function saveResume(finished = false) {
  const it = player.current;
  if (!it || it.remote || !store.s.resume) return;
  const el = player.el;
  const d = el.duration;
  if (!Number.isFinite(d) || d < 60) return;
  store.update((s) => {
    if (finished || el.currentTime > d - 10 || el.currentTime < 10) delete s.resume[it.path];
    else s.resume[it.path] = { t: el.currentTime, d, ts: Date.now() };
  }, 'resume');
}
setInterval(() => { if (player.playing) saveResume(); }, 5000);
window.addEventListener('beforeunload', () => { saveResume(); store.flush(); });

// ------------------------------------------------------------ transport

export function toggle() {
  if (!player.current) return;
  const el = player.el;
  if (el.ended) { el.currentTime = 0; }
  el.paused || el.ended ? el.play().catch(() => {}) : el.pause();
}
export const pause = () => player.el.pause();
export const resume = () => player.current && player.el.play().catch(() => {});

export function seek(t) { if (player.current && Number.isFinite(player.el.duration)) { player.el.currentTime = clamp(t, 0, player.el.duration); emit('time'); } }
export function seekBy(d) { seek(player.el.currentTime + d); }

export function next(auto = false) {
  if (!player.queue.length) return;
  if (auto && player.repeat === 'one') { player.el.currentTime = 0; player.el.play().catch(() => {}); return; }
  const pos = player.order.indexOf(player.index);
  if (pos < player.order.length - 1) load(player.order[pos + 1]);
  else if (player.repeat === 'all') { if (store.state.player.shuffle) rebuildOrder(false); load(player.order[0]); }
}

export function prev() {
  if (!player.queue.length) return;
  if (player.el.currentTime > 3) { seek(0); return; }
  const pos = player.order.indexOf(player.index);
  if (pos > 0) load(player.order[pos - 1]);
  else if (player.repeat === 'all') load(player.order[player.order.length - 1]);
  else seek(0);
}

export function stop() {
  saveResume();
  for (const el of [local, remote]) { el.pause(); el.removeAttribute('src'); el.load(); }
  player.queue = [];
  player.index = -1;
  player.order = [];
  player.meta = null;
  player.peaks = null;
  player.error = null;
  clearSubs();
  emit('queue');
  emit('item');
  emit('state');
}

export function setVolume(v) {
  v = clamp(v, 0, 1);
  store.update((s) => { s.audio.volume = v; s.audio.muted = v === 0 ? s.audio.muted : false; }, 'audio');
  for (const el of [local, remote]) { el.volume = v; el.muted = store.state.audio.muted; }
  emit('volume');
}
export function toggleMute() {
  store.update((s) => { s.audio.muted = !s.audio.muted; }, 'audio');
  for (const el of [local, remote]) el.muted = store.state.audio.muted;
  emit('volume');
}
export function setRate(r) {
  player.rate = r;
  for (const el of [local, remote]) el.defaultPlaybackRate = el.playbackRate = r;
  emit('state');
}
export function cycleRepeat() {
  const order = ['off', 'all', 'one'];
  store.update((s) => { s.player.repeat = order[(order.indexOf(s.player.repeat) + 1) % 3]; }, 'player');
  emit('state');
}
export function toggleShuffle() {
  store.update((s) => { s.player.shuffle = !s.player.shuffle; }, 'player');
  rebuildOrder();
  emit('state');
  emit('queue');
}

// ------------------------------------------------------------ subtitles

function srtToVtt(text) {
  return 'WEBVTT\n\n' + text.replace(/\r+/g, '').replace(/^﻿/, '').replace(/(\d+:\d+:\d+),(\d+)/g, '$1.$2');
}
function assToVtt(text) {
  const lines = text.replace(/\r+/g, '').split('\n');
  let fmt = null;
  const cues = [];
  const toT = (s) => { const m = /(\d+):(\d+):(\d+)[.](\d+)/.exec(s.trim()); return m ? `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}.${m[4].padEnd(3, '0').slice(0, 3)}` : '00:00:00.000'; };
  for (const l of lines) {
    if (l.startsWith('Format:') && !fmt) fmt = l.slice(7).split(',').map((x) => x.trim().toLowerCase());
    else if (l.startsWith('Dialogue:') && fmt) {
      const parts = l.slice(9).split(',');
      const text = parts.slice(fmt.length - 1).join(',');
      const start = parts[fmt.indexOf('start')];
      const end = parts[fmt.indexOf('end')];
      cues.push(`${toT(start)} --> ${toT(end)}\n${text.replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n')}`);
    }
  }
  return 'WEBVTT\n\n' + cues.join('\n\n');
}

export async function addSubtitle(path, select = true) {
  const text = await window.vlc.readText(path);
  if (!text) return false;
  const ext = path.split('.').pop().toLowerCase();
  const vtt = ext === 'vtt' ? text : ext === 'srt' ? srtToVtt(text) : assToVtt(text);
  const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
  const trackEl = document.createElement('track');
  trackEl.kind = 'subtitles';
  trackEl.label = baseName(path);
  trackEl.src = url;
  player.el.append(trackEl);
  trackEl.track.mode = 'disabled';
  player.subs.push({ label: baseName(path), url, trackEl, path });
  if (select) setSubtitle(player.subs.length - 1);
  else emit('subs');
  return true;
}

export function setSubtitle(i) {
  player.subIndex = i;
  player.subs.forEach((s, j) => { s.trackEl.track.mode = j === i ? 'showing' : 'disabled'; });
  emit('subs');
}

function clearSubs() {
  for (const s of player.subs) { URL.revokeObjectURL(s.url); s.trackEl.remove(); }
  player.subs = [];
  player.subIndex = -1;
  emit('subs');
}

async function loadSiblingSubs(it) {
  const files = await window.vlc.siblings(it.path);
  if (player.current !== it) return;
  for (let k = 0; k < files.length; k++) await addSubtitle(files[k], store.s.autoSubs && k === 0);
}

// ------------------------------------------------------------ OS media keys

function mediaSession(it) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: it.title || it.name, artist: (player.meta && player.meta.artist) || '' });
  const set = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch {} };
  set('play', () => resume());
  set('pause', () => pause());
  set('previoustrack', () => prev());
  set('nexttrack', () => next());
  set('stop', () => stop());
}

export const rateOptions = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3];
player.rate = store.s.defaultRate || 1;
