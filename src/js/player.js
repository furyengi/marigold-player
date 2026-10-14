import { store, uid } from './store.js';
import * as fx from './audio.js';
import { toast } from './ui.js';
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
  v.poster = '../assets/idle.svg';
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
  chapters: [],
  source: null,
  loopA: null,
  loopB: null,
  sleepAt: null,
  recording: false,
  error: null,
  get current() { return this.queue[this.index] || null; },
  get playing() { return !!this.current && !this.el.paused && !this.el.ended; },
  get kind() { return this.current ? this.current.kind : null; },
  /** Length in seconds. Converted streams have no reliable element duration, so the probe's value wins. */
  get duration() {
    const it = this.current;
    if (it && it.stream && it.info && it.info.duration) return it.info.duration;
    if (Number.isFinite(this.el.duration)) return this.el.duration;
    return (it && it.info && it.info.duration) || 0;
  },
  /** Position in the whole file, including the offset of a restarted converted stream. */
  get time() {
    const it = this.current;
    if (!it || !it.stream) return this.el.currentTime || 0;
    return it.stream.seeking ? it.stream.start : (this.el.currentTime || 0) + it.stream.start;
  },
  get audioTracks() { return (this.current && this.current.info && this.current.info.audios) || []; },
  get audioTrack() {
    const it = this.current;
    if (!it || !it.info) return null;
    if (it.stream && it.stream.audio !== null && it.stream.audio !== undefined) return it.stream.audio;
    const d = it.info.audios.find((a) => a.default) || it.info.audios[0];
    return d ? d.index : null;
  },
  get embeddedSubs() { return (this.current && this.current.info && this.current.info.subs) || []; },
  get converting() { return !!(this.current && this.current.stream); },
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
    if (it.pendingSeek && !it.stream) { el.currentTime = it.pendingSeek; it.pendingSeek = 0; }
    emit('time');
  }));
  el.addEventListener('error', live(() => {
    const it = player.current;
    if (!it || !el.getAttribute('src')) return;
    console.warn('media error', el.error && el.error.code, el.error && el.error.message, it.name);
    // Anything the browser engine could not decode gets a second chance through the compatibility engine.
    if (!it.remote && engineOn && store.s.compat && !(it.stream && it.stream.mode === 'transcode')) {
      const at = player.time;
      toast('Switching to the compatibility engine…');
      startStream(it, 'transcode', { start: at });
      return;
    }
    const code = el.error && el.error.code;
    player.error = it.remote
      ? "Couldn't load this stream. It may be offline, need a different protocol (HLS/DASH aren't supported yet), or block playback from apps."
      : code === 4
        ? "This file can't be played. Its video or audio codec isn't supported."
        : 'Something went wrong while decoding this file.';
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

export function play(items, start = 0, source = null) {
  if (!items.length) return;
  player.source = source;
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

let engineOn = false;
window.native.engine().then((v) => { engineOn = !!v; });
let loadToken = 0;

async function load(i) {
  saveResume();
  const it = player.queue[i];
  if (!it) return;
  const token = ++loadToken;
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
  player.chapters = [];
  it.stream = null;
  it.info = null;
  clearLoop();
  if (player.recording) stopRecording();
  clearSubs();
  el.querySelectorAll('track').forEach((tr) => tr.remove());

  el.poster = it.kind === 'audio' ? '' : '../assets/idle.svg';
  el.preload = store.s.preload || 'auto';
  el.volume = store.state.audio.volume;
  el.muted = store.state.audio.muted;
  el.defaultPlaybackRate = el.playbackRate = player.rate || store.s.defaultRate || 1;
  if (!useRemote) fx.wire(el);
  fx.applyVideoFx();
  emit('item');
  emit('queue');

  // Ask the engine what is inside the file so we can pick the right playback route.
  let info = null;
  if (!useRemote && engineOn && store.s.compat) {
    info = await window.native.probe(it.path);
    if (token !== loadToken) return;
  }
  it.info = info;
  if (info && !info.video && it.kind === 'video') { it.kind = 'audio'; emit('item'); }
  if (info && info.chapters.length) { player.chapters = info.chapters; emit('chapters'); }

  const saved = !useRemote && store.s.resume && store.state.resume[it.path];
  const resumeAt = saved && saved.t > 10 && saved.d && saved.t < saved.d - 15 ? saved.t : 0;
  const plan = info ? info.plan : { mode: 'direct', reason: '' };
  if (plan.mode === 'direct') {
    it.pendingSeek = resumeAt;
    el.src = useRemote ? it.url : window.native.mediaUrl(it.path);
    el.play().catch(() => {});
  } else {
    it.pendingSeek = 0;
    startStream(it, plan.mode, { start: resumeAt });
    toast('Converting for playback (' + plan.reason + ')', 3200);
  }
  emit('state');

  if (!useRemote) {
    remember(it);
    if (it.kind === 'audio') loadAudioExtras(it, window.native.mediaUrl(it.path));
    else loadChapters(it);
    loadSiblingSubs(it);
  }
  notifyChange(it);
  mediaSession(it);
}

/** (Re)start playback through the compatibility engine at `start` seconds. */
function startStream(it, mode, { start = 0, audio } = {}) {
  const keepAudio = audio === undefined ? (it.stream ? it.stream.audio : null) : audio;
  it.stream = { mode, start, audio: keepAudio, seeking: false };
  const el = player.el;
  el.src = window.native.streamUrl(it.path, { start, mode, audio: keepAudio, quality: store.s.compatQuality });
  el.play().catch(() => {});
  rebuildSubs();
  emit('time');
  emit('state');
}

/** Switch audio language/track. Works on any local file the engine can read. */
export function setAudioTrack(index) {
  const it = player.current;
  if (!it || !it.info || it.remote || index === player.audioTrack) return;
  const mode = (it.stream && it.stream.mode === 'transcode') || it.info.plan.mode === 'transcode' ? 'transcode' : 'remux';
  startStream(it, mode, { start: player.time, audio: index });
}

async function loadAudioExtras(it, url) {
  const m = await window.native.meta(it.path);
  if (player.current !== it) return;
  if (m) {
    player.meta = m;
    player.chapters = m.chapters || [];
    emit('chapters');
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
  const d = player.duration;
  const t = player.time;
  if (!Number.isFinite(d) || d < 60) return;
  store.update((s) => {
    if (finished || t > d - 10 || t < 10) delete s.resume[it.path];
    else s.resume[it.path] = { t, d, ts: Date.now() };
  }, 'resume');
}
setInterval(() => { if (player.playing) saveResume(); }, 5000);
window.addEventListener('beforeunload', () => { saveResume(); store.flush(); });

// ------------------------------------------------------------ transport

export function toggle() {
  if (!player.current) return;
  const el = player.el;
  if (el.ended) { seek(0); }
  el.paused || el.ended ? el.play().catch(() => {}) : el.pause();
}
export const pause = () => player.el.pause();
export const resume = () => player.current && player.el.play().catch(() => {});

let seekTimer = 0;
export function seek(t) {
  const it = player.current;
  if (!it) return;
  const el = player.el;
  const d = player.duration;
  t = clamp(t, 0, d || t);
  if (it.stream) {
    // A converted stream has no byte ranges, so seeking means restarting the converter at the new position.
    // Dragging the seek bar fires many seeks, so only the last one actually restarts it.
    it.stream.start = t;
    it.stream.seeking = true;
    emit('time');
    clearTimeout(seekTimer);
    seekTimer = setTimeout(() => { if (player.current === it && it.stream) startStream(it, it.stream.mode, { start: it.stream.start }); }, 140);
    return;
  }
  if (Number.isFinite(el.duration)) { el.currentTime = t; emit('time'); }
}
export function seekBy(d) { seek(player.time + d); }

export function next(auto = false) {
  if (!player.queue.length) return;
  if (auto && player.repeat === 'one') { seek(0); player.el.play().catch(() => {}); return; }
  const pos = player.order.indexOf(player.index);
  if (pos < player.order.length - 1) load(player.order[pos + 1]);
  else if (player.repeat === 'all') { if (store.state.player.shuffle) rebuildOrder(false); load(player.order[0]); }
}

export function prev() {
  if (!player.queue.length) return;
  if (player.time > 3) { seek(0); return; }
  const pos = player.order.indexOf(player.index);
  if (pos > 0) load(player.order[pos - 1]);
  else if (player.repeat === 'all') load(player.order[player.order.length - 1]);
  else seek(0);
}

export function stop() {
  saveResume();
  if (player.recording) stopRecording();
  clearLoop();
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

// WebVTT timestamps look like 01:02:03.456 or 02:03.456.
const stamp = /(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})/;
const toSec = (m) => Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
const fromSec = (v) => {
  v = Math.max(0, v);
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const sec = Math.floor(v % 60);
  const ms = Math.round((v - Math.floor(v)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
};

/** Shift every cue earlier by `shift` seconds, dropping cues that end before the new start. Used when a converted stream restarts mid-file. */
function shiftVtt(vtt, shift) {
  if (!shift) return vtt;
  const blocks = vtt.replace(/\r+/g, '').split(/\n\n+/);
  const out = [blocks[0]];
  for (const b of blocks.slice(1)) {
    const lines = b.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) { out.push(b); continue; }
    const [a, c] = lines[i].split('-->');
    const ma = stamp.exec(a);
    const mc = stamp.exec(c);
    if (!ma || !mc) { out.push(b); continue; }
    const end = toSec(mc) - shift;
    if (end <= 0) continue;
    const rest = c.replace(stamp, '').replace(/^\s*/, '');
    lines[i] = `${fromSec(toSec(ma) - shift)} --> ${fromSec(end)}${rest ? ' ' + rest : ''}`;
    out.push(lines.join('\n'));
  }
  return out.join('\n\n') + '\n';
}

const streamShift = () => (player.current && player.current.stream ? player.current.stream.start : 0);

function attachTrack(sub) {
  const url = URL.createObjectURL(new Blob([shiftVtt(sub.raw, streamShift())], { type: 'text/vtt' }));
  const trackEl = document.createElement('track');
  trackEl.kind = 'subtitles';
  trackEl.label = sub.label;
  trackEl.src = url;
  player.el.append(trackEl);
  trackEl.track.mode = 'disabled';
  sub.url = url;
  sub.trackEl = trackEl;
}

/** Add subtitle cues (already WebVTT). Returns the new index. */
export function addSubtitleText(label, vtt, select = true, extra = {}) {
  const sub = { label, raw: vtt, ...extra };
  attachTrack(sub);
  player.subs.push(sub);
  if (select) setSubtitle(player.subs.length - 1); else emit('subs');
  return player.subs.length - 1;
}

export async function addSubtitle(path, select = true) {
  const text = await window.native.readText(path);
  if (!text) return false;
  const ext = path.split('.').pop().toLowerCase();
  const vtt = ext === 'vtt' ? text : ext === 'srt' ? srtToVtt(text) : assToVtt(text);
  addSubtitleText(baseName(path), vtt, select, { path });
  return true;
}

/** Pull a text subtitle track out of the file with the compatibility engine and show it. */
export async function enableEmbeddedSub(sub) {
  const it = player.current;
  if (!it || !it.path) return;
  const at = player.subs.findIndex((x) => x.embeddedIndex === sub.index);
  if (at >= 0) { setSubtitle(at); return; }
  if (!sub.text) { toast('Image-based subtitles (such as Blu-ray PGS) are not supported yet'); return; }
  toast('Loading subtitles…', 1500);
  const text = await window.native.embeddedSubtitle(it.path, sub.index);
  if (player.current !== it) return;
  if (!text) { toast("Couldn't read that subtitle track"); return; }
  addSubtitleText(embeddedLabel(sub), text, true, { embeddedIndex: sub.index });
}
export const embeddedLabel = (s) => [s.lang && s.lang.toUpperCase(), s.title || s.codec].filter(Boolean).join(' · ') || 'Subtitles';

export function setSubtitle(i) {
  player.subIndex = i;
  player.subs.forEach((s, j) => { s.trackEl.track.mode = j === i ? 'showing' : 'disabled'; });
  emit('subs');
}

/** After a converted stream restarts, cue times need re-basing onto the new start offset. */
function rebuildSubs() {
  const keep = player.subIndex;
  for (const s of player.subs) { URL.revokeObjectURL(s.url); s.trackEl.remove(); attachTrack(s); }
  setSubtitle(keep);
}

function clearSubs() {
  for (const s of player.subs) { URL.revokeObjectURL(s.url); s.trackEl.remove(); }
  player.subs = [];
  player.subIndex = -1;
  emit('subs');
}

async function loadSiblingSubs(it) {
  const mapped = store.state.subMap[it.path] || [];
  const sibs = await window.native.siblings(it.path);
  const files = [...new Set([...mapped, ...sibs])];
  if (player.current !== it) return;
  for (let k = 0; k < files.length; k++) await addSubtitle(files[k], (store.s.autoSubs || mapped.length > 0) && k === 0);
  // With no subtitle file next to the video, fall back to an embedded track flagged as default.
  if (!files.length && store.s.autoSubs && it.info) {
    await new Promise((r) => setTimeout(r, 0));
    const def = it.info.subs.find((x) => x.default && x.text);
    if (def && player.current === it) enableEmbeddedSub(def);
  }
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

// ------------------------------------------------------------ chapters

async function loadChapters(it) {
  const m = await window.native.meta(it.path, true);
  if (player.current !== it || !m) return;
  player.chapters = m.chapters || [];
  emit('chapters');
}

// ------------------------------------------------------------ A-B loop

let loopTimer = 0;
export function clearLoop() {
  player.loopA = player.loopB = null;
  clearInterval(loopTimer);
  loopTimer = 0;
  emit('loop');
}
/** First call marks A, second marks B and starts looping, third clears the loop. */
export function cycleLoop() {
  if (!player.current) return;
  const t = player.time;
  if (player.loopA === null) { player.loopA = t; toast(`Loop start set at ${fmt(t)}`); }
  else if (player.loopB === null) {
    if (t <= player.loopA + 0.5) { toast('Pick a point after the start'); return; }
    player.loopB = t;
    toast(`Looping ${fmt(player.loopA)} to ${fmt(t)}`);
    loopTimer = setInterval(() => { if (player.loopB !== null && player.time >= player.loopB) seek(player.loopA); }, 60);
  } else { clearLoop(); toast('Loop cleared'); return; }
  emit('loop');
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ------------------------------------------------------------ sleep timer

let sleepTimer = 0;
export function setSleep(minutes) {
  clearTimeout(sleepTimer);
  if (!minutes) { player.sleepAt = null; emit('sleep'); return; }
  player.sleepAt = Date.now() + minutes * 60000;
  sleepTimer = setTimeout(() => {
    player.sleepAt = null;
    player.el.pause();
    emit('sleep');
    toast('Sleep timer: playback paused');
  }, minutes * 60000);
  toast(`Sleep timer set for ${minutes} min`);
  emit('sleep');
}

// ------------------------------------------------------------ recording

let recorder = null;
let chunks = [];
export function toggleRecording() { return player.recording ? stopRecording() : startRecording(); }

function startRecording() {
  const it = player.current;
  if (!it) return;
  const el = player.el;
  let stream;
  try { stream = el.captureStream(); } catch { toast("Recording isn't available for this source"); return; }
  const wanted = store.s.recordFormat;
  const audioOnly = wanted === 'audio' || it.kind === 'audio';
  if (!it.remote) {
    // Take audio from the effects chain so the recording matches what you hear.
    const dest = fx.recordingStream();
    if (dest) { stream.getAudioTracks().forEach((t) => stream.removeTrack(t)); dest.getAudioTracks().forEach((t) => stream.addTrack(t)); }
  }
  const types = audioOnly ? ['audio/webm;codecs=opus', 'audio/webm'] : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mimeType = types.find((m) => MediaRecorder.isTypeSupported(m));
  try {
    recorder = new MediaRecorder(audioOnly ? new MediaStream(stream.getAudioTracks()) : stream, { mimeType, videoBitsPerSecond: store.s.recordBitrate * 1e6 });
  } catch { toast("Recording isn't available for this source"); return; }
  chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const name = `${(it.title || it.name).replace(/\.[^.]+$/, '').slice(0, 50)} ${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  const ext = audioOnly ? 'weba' : 'webm';
  recorder.onstop = async () => {
    const blob = new Blob(chunks, { type: mimeType });
    chunks = [];
    if (!blob.size) return;
    const file = await window.native.saveRecording(await blob.arrayBuffer(), `${name}.${ext}`, store.s.recordDir);
    toast(file ? `Recording saved: ${file.split(/[\/]/).pop()}` : "Couldn't save the recording", 4000);
  };
  recorder.start(1000);
  player.recording = true;
  emit('record');
  toast('Recording started');
}

export function stopRecording() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  player.recording = false;
  emit('record');
}

// ------------------------------------------------------------ notifications

function notifyChange(it) {
  if (!store.s.notify || !document.hidden || !('Notification' in window)) return;
  const show = () => new Notification(it.title || it.name, { body: it.folder ? it.folder.split(/[\/]/).pop() : 'Now playing', silent: true });
  if (Notification.permission === 'granted') show();
  else if (Notification.permission !== 'denied') Notification.requestPermission().then((p) => p === 'granted' && show());
}
