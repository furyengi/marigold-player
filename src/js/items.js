import { store } from './store.js';
import { router } from './router.js';
import * as P from './player.js';
import { player } from './player.js';
import { setVideo } from './audio.js';
import { bus } from './bus.js';
import { hint } from './hotkeys.js';
import { getThumb } from './thumbs.js';
import { h, showMenu, toast, baseName, stripExt, fmtTime, clamp, artGradient } from './ui.js';
import { icon, skipIcon } from './icons.js';

// ------------------------------------------------------------ shared actions

export async function snapshot() {
  const el = player.el;
  if (!player.current || player.kind !== 'video' || !el.videoWidth) { toast('Snapshots work while a video is playing'); return; }
  try {
    const c = document.createElement('canvas');
    c.width = el.videoWidth;
    c.height = el.videoHeight;
    c.getContext('2d').drawImage(el, 0, 0);
    const name = `${(player.current.title || 'snapshot').slice(0, 60)} ${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const file = await window.native.saveImage(c.toDataURL('image/png'), name);
    toast(file ? 'Snapshot saved to Pictures/Marigold Player' : 'Could not save the snapshot');
  } catch {
    toast("Snapshots aren't available for this stream");
  }
}

export async function pip() {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (player.kind === 'video') await player.el.requestPictureInPicture();
  } catch { toast('Picture in picture is not available'); }
}

const ZOOMS = [100, 125, 150, 200, 300];
export function cycleZoom() {
  const i = ZOOMS.indexOf(store.state.video.zoom);
  setVideo({ zoom: ZOOMS[(i + 1) % ZOOMS.length] });
  toast(`Zoom ${store.state.video.zoom}%`);
}
export function rotate() { setVideo({ rotate: (store.state.video.rotate + 90) % 360 }); }

export const mediaKey = (it) => (it ? it.path || it.url : null);
const isFav = () => { const k = mediaKey(player.current); return !!k && store.state.favorites.some((f) => (f.path || f.url) === k); };
export function toggleFavorite() {
  const it = player.current;
  if (!it) return;
  const k = mediaKey(it);
  const on = isFav();
  store.update((s) => {
    if (on) s.favorites = s.favorites.filter((f) => (f.path || f.url) !== k);
    else s.favorites.unshift(it.url ? { url: it.url, name: it.name, kind: it.kind } : { path: it.path, name: it.name, kind: it.kind });
  }, 'favorites');
  toast(on ? 'Removed from favorites' : 'Added to favorites');
}

export function addBookmark() {
  const it = player.current;
  if (!it) return;
  const k = mediaKey(it);
  const t = player.time;
  store.update((s) => { (s.bookmarks[k] ||= []).push({ t, label: `Bookmark at ${fmtTime(t)}` }); }, 'bookmarks');
  toast(`Bookmarked ${fmtTime(t)}`);
}

export function toggleSleep() {
  if (player.sleepAt) P.setSleep(0); else P.setSleep(store.s.sleepMinutes);
}

// ------------------------------------------------------------ volume control

export function createVolume() {
  const icoBtn = h('button.ctl', { title: 'Mute', onclick: () => P.toggleMute() });
  const fillWrap = h('div.vol-fill-wrap', null, h('div.vol-fill'));
  const track = h('div.vol-track', { role: 'slider', 'aria-label': 'Volume' }, h('div.vol-shape'), fillWrap);
  const set = (e) => { const r = track.getBoundingClientRect(); P.setVolume(clamp((e.clientX - r.left) / r.width, 0, 1)); };
  let drag = false;
  track.addEventListener('pointerdown', (e) => { drag = true; track.setPointerCapture(e.pointerId); set(e); });
  track.addEventListener('pointermove', (e) => { if (drag) set(e); });
  track.addEventListener('pointerup', () => { drag = false; });
  const el = h('div.vol', null, icoBtn, track);
  const refresh = () => {
    const v = player.volume;
    icoBtn.innerHTML = icon(v === 0 ? 'volumeMute' : v < 0.5 ? 'volumeLow' : 'volume', 20);
    icoBtn.title = `Mute (${hint('mute')})`;
    fillWrap.style.width = v * 100 + '%';
    track.title = `${Math.round(v * 100)}%`;
  };
  refresh();
  return { el, refresh };
}

// ------------------------------------------------------------ item registry

const speedMenu = (anchor) => showMenu(anchor, [
  { heading: 'Playback speed' },
  ...P.rateOptions.map((r) => ({ label: r === 1 ? 'Normal' : `${r}×`, checked: player.rate === r, onClick: () => P.setRate(r) })),
], { align: 'end' });

const entryOf = (it) => ({ type: 'file', path: it.path, url: it.url, name: it.name, kind: it.kind });

function chaptersMenu(anchor) {
  const ch = player.chapters;
  const now = player.time;
  const cur = ch.reduce((a, c, i) => (c.start <= now + 0.5 ? i : a), -1);
  showMenu(anchor, ch.map((c, i) => ({ label: `${fmtTime(c.start).replace(/^00:/, '')}  ${c.title || `Chapter ${i + 1}`}`, checked: i === cur, onClick: () => P.seek(c.start) })), { align: 'end' });
}

function bookmarksMenu(anchor) {
  const k = mediaKey(player.current);
  const list = ((k && store.state.bookmarks[k]) || []).slice().sort((a, b) => a.t - b.t);
  showMenu(anchor, [
    { label: 'Bookmark this moment', icon: 'bookmarkAdd', onClick: addBookmark },
    list.length && { sep: true },
    ...list.map((b) => ({ label: b.label, icon: 'bookmark', onClick: () => P.seek(b.t) })),
    list.length && { sep: true },
    list.length && { label: 'Clear bookmarks', icon: 'trash', danger: true, onClick: () => store.update((s) => { delete s.bookmarks[k]; }, 'bookmarks') },
  ], { align: 'end' });
}

function playlistsMenu(anchor) {
  const it = player.current;
  showMenu(anchor, [
    { heading: 'Add to playlist' },
    ...store.state.playlists.map((p) => ({ label: p.name, icon: 'playlist', disabled: !it, onClick: () => bus.addToPlaylist(p.id, [entryOf(it)]) })),
    { label: 'New playlist…', icon: 'plus', disabled: !it, onClick: () => bus.newPlaylist([entryOf(it)]) },
    { sep: true },
    { label: 'Open playlists', icon: 'playlist', onClick: () => router.go({ view: 'playlists' }) },
  ], { align: 'end' });
}

const LANGS = { eng: 'English', fra: 'French', fre: 'French', deu: 'German', ger: 'German', spa: 'Spanish', ita: 'Italian', por: 'Portuguese', rus: 'Russian', jpn: 'Japanese', kor: 'Korean', zho: 'Chinese', chi: 'Chinese', ara: 'Arabic', hin: 'Hindi', nld: 'Dutch', dut: 'Dutch', pol: 'Polish', tur: 'Turkish', swe: 'Swedish', nor: 'Norwegian', dan: 'Danish', fin: 'Finnish', ces: 'Czech', cze: 'Czech', hun: 'Hungarian', ell: 'Greek', gre: 'Greek', heb: 'Hebrew', tha: 'Thai', vie: 'Vietnamese', ind: 'Indonesian', ukr: 'Ukrainian' };
export const langName = (code) => LANGS[code] || (code ? code.toUpperCase() : '');
export function audioTrackLabel(a, i) {
  const lang = langName(a.lang);
  const name = lang || `Track ${i + 1}`;
  const detail = [a.title, a.codec.toUpperCase(), a.channels].filter(Boolean).join(' · ');
  return `${name}  ${detail}`;
}
function audioMenu(anchor) {
  showMenu(anchor, [
    { heading: 'Audio track' },
    ...player.audioTracks.map((a, i) => ({ label: audioTrackLabel(a, i), checked: a.index === player.audioTrack, onClick: () => P.setAudioTrack(a.index) })),
  ], { align: 'end' });
}

const sleepMenu = (anchor) => showMenu(anchor, [
  { heading: 'Sleep timer' },
  player.sleepAt && { label: 'Cancel timer', icon: 'close', onClick: () => P.setSleep(0) },
  ...[15, 30, 45, 60, 90].map((m) => ({ label: `${m} minutes`, onClick: () => P.setSleep(m) })),
], { align: 'end' });

/**
 * Item definitions. `btn` items render as icon buttons and re-evaluate icon/active/disabled/hidden on refresh;
 * custom items provide their own build().
 */
const mk = (label, iconName, extra) => ({ label, icon: iconName, ...extra });
export const ITEMS = {
  menu: mk('Menu', 'dots', { run: (el) => bus.appMenu(el), title: () => 'Menu' }),
  sidebar: mk('Queue sidebar', 'sidebar', { run: () => bus.toggleQueue(), title: () => `Queue (${hint('queue')})`, active: () => store.state.player.sidebar && store.state.player.sidebarSide === 'left' }),
  rightSidebar: mk('Right sidebar', 'rightSidebar', { run: () => bus.toggleQueue('right'), title: () => 'Queue on the right', active: () => store.state.player.sidebar && store.state.player.sidebarSide === 'right' }),
  queue: mk('Queue', 'queue', { run: () => bus.toggleQueue(), title: () => `Queue (${hint('queue')})`, active: () => store.state.player.sidebar }),
  prev: mk('Previous', 'prev', { run: () => P.prev(), title: () => `Previous (${hint('prev')})`, disabled: () => !player.current || (player.queue.length < 2 && player.time < 3) }),
  next: mk('Next', 'next', { run: () => P.next(), title: () => `Next (${hint('next')})`, disabled: () => !player.current || (player.order.indexOf(player.index) >= player.order.length - 1 && player.repeat !== 'all') }),
  play: mk('Play / pause', 'play', { cls: 'ctl-play', run: () => P.toggle(), title: () => `Play / pause (${hint('play')})`, html: () => icon(player.playing ? 'pause' : 'play', 20), disabled: () => !player.current }),
  volume: mk('Volume', 'volume', { custom: 'volume' }),
  effects: mk('Effects & equalizer', 'equalizer', { run: (el) => bus.openEffects(el), title: () => 'Effects & equalizer' }),
  subtitles: mk('Subtitles', 'subtitles', { run: (el) => bus.openSubtitleMenu(el), title: () => `Subtitles (${hint('subs')})`, active: () => player.subIndex >= 0, hidden: () => player.kind === 'audio' }),
  audioTrack: mk('Audio track', 'audioTrack', { run: (el) => audioMenu(el), title: () => 'Audio track', hidden: () => player.audioTracks.length < 2 }),
  settings: mk('Settings', 'settings', { run: () => bus.openSettings(), title: () => `Settings (${hint('settings')})` }),
  home: mk('Go home', 'home', { run: () => bus.goHome(), title: () => 'Go home' }),
  quit: mk('Quit', 'power', { run: () => window.native.win('close'), title: () => 'Quit' }),
  stop: mk('Stop', 'stop', { run: () => P.stop(), title: () => `Stop (${hint('stop')})`, disabled: () => !player.current }),
  skipBack: mk('Skip back', 'skipBack', { run: () => P.seekBy(-store.s.skipStep), title: () => `Back ${store.s.skipStep}s`, html: () => skipIcon(-1, store.s.skipStep), disabled: () => !player.current }),
  skipFwd: mk('Skip forward', 'skipFwd', { run: () => P.seekBy(store.s.skipStep), title: () => `Forward ${store.s.skipStep}s`, html: () => skipIcon(1, store.s.skipStep), disabled: () => !player.current }),
  back10: mk('Backward 10s', 'skipBack', { run: () => P.seekBy(-10), title: () => 'Back 10s', html: () => skipIcon(-1, 10), disabled: () => !player.current }),
  fwd10: mk('Forward 10s', 'skipFwd', { run: () => P.seekBy(10), title: () => 'Forward 10s', html: () => skipIcon(1, 10), disabled: () => !player.current }),
  back15: mk('Backward 15s', 'skipBack', { run: () => P.seekBy(-15), title: () => 'Back 15s', html: () => skipIcon(-1, 15), disabled: () => !player.current }),
  fwd15: mk('Forward 15s', 'skipFwd', { run: () => P.seekBy(15), title: () => 'Forward 15s', html: () => skipIcon(1, 15), disabled: () => !player.current }),
  repeat: mk('Repeat', 'repeat', { run: () => P.cycleRepeat(), title: () => `Repeat: ${store.state.player.repeat} (${hint('repeat')})`, html: () => icon(store.state.player.repeat === 'one' ? 'repeatOne' : 'repeat', 20), active: () => store.state.player.repeat !== 'off' }),
  shuffle: mk('Shuffle', 'shuffle', { run: () => P.toggleShuffle(), title: () => `Shuffle (${hint('shuffle')})`, active: () => store.state.player.shuffle }),
  speed: mk('Playback speed', 'speed', { run: (el) => speedMenu(el), title: () => `Speed ${player.rate}×`, active: () => player.rate !== 1 }),
  record: mk('Record', 'record', { run: () => P.toggleRecording(), title: () => (player.recording ? 'Stop recording' : `Record (${hint('record')})`), active: () => player.recording, cls2: () => (player.recording ? 'rec' : ''), disabled: () => !player.current }),
  snapshot: mk('Snapshot', 'snapshot', { run: () => snapshot(), title: () => `Snapshot (${hint('snapshot')})`, hidden: () => player.kind === 'audio', disabled: () => !player.current }),
  pip: mk('Picture in picture', 'pip', { run: () => pip(), title: () => 'Picture in picture', hidden: () => player.kind === 'audio' }),
  zoom: mk('Zoom', 'zoom', { run: () => cycleZoom(), title: () => `Zoom ${store.state.video.zoom}% (${hint('zoom')})`, active: () => store.state.video.zoom !== 100, hidden: () => player.kind === 'audio' }),
  rotate: mk('Rotate', 'rotate', { run: () => rotate(), title: () => `Rotate (${hint('rotate')})`, active: () => store.state.video.rotate !== 0, hidden: () => player.kind === 'audio' }),
  replay: mk('Replay', 'replay', { run: () => { P.seek(0); P.resume(); }, title: () => `Replay (${hint('replay')})`, disabled: () => !player.current }),
  loop: mk('A-B loop', 'loop', { run: () => P.cycleLoop(), title: () => (player.loopB !== null ? 'Clear loop' : player.loopA !== null ? 'Set loop end' : `Set loop start (${hint('loop')})`), active: () => player.loopA !== null, disabled: () => !player.current }),
  sleep: mk('Sleep timer', 'moon', { run: (el) => sleepMenu(el), title: () => (player.sleepAt ? 'Sleep timer running' : 'Sleep timer'), active: () => !!player.sleepAt }),
  chapters: mk('Chapters', 'flag', { run: (el) => chaptersMenu(el), title: () => 'Chapters', disabled: () => !player.chapters.length }),
  favorite: mk('Favorite', 'heart', { run: () => toggleFavorite(), title: () => `Favorite (${hint('favorite')})`, active: () => isFav(), disabled: () => !player.current, fillWhenActive: true }),
  bookmark: mk('Bookmark', 'bookmarkAdd', { run: () => addBookmark(), title: () => `Bookmark this moment (${hint('bookmark')})`, disabled: () => !player.current }),
  bookmarks: mk('Bookmarks', 'bookmark', { run: (el) => bookmarksMenu(el), title: () => 'Bookmarks', disabled: () => !player.current }),
  playlists: mk('Playlists', 'playlist', { run: (el) => playlistsMenu(el), title: () => 'Playlists' }),
  properties: mk('Properties', 'info', { run: () => player.current && bus.openProperties(entryOf(player.current)), title: () => 'Properties', disabled: () => !player.current }),
  // non-button items
  folder: mk('Folder name', 'folder', { custom: 'folder' }),
  filename: mk('File name', 'file', { custom: 'text', text: () => (player.current ? player.current.title || stripExt(player.current.name) : '') }),
  artist: mk('Artist name', 'user', { custom: 'text', text: () => (player.meta && player.meta.artist) || '' }),
  playlistName: mk('Playlist name', 'playlist', { custom: 'text', text: () => (player.source || '') }),
  thumbnail: mk('Thumbnail', 'image', { custom: 'thumb' }),
  spacer: mk('Spacer', 'spacer', { custom: 'spacer' }),
  divider: mk('Divider', 'divider', { custom: 'divider' }),
};

/** Order shown in the Customize palette. */
export const ITEM_ORDER = ['spacer', 'divider', 'speed', 'fwd10', 'back10', 'fwd15', 'back15', 'stop', 'repeat', 'shuffle', 'record', 'snapshot', 'pip', 'zoom', 'rotate', 'rightSidebar', 'quit', 'settings', 'home', 'thumbnail', 'filename', 'artist', 'folder', 'playlistName', 'properties', 'replay', 'loop', 'sleep', 'chapters', 'favorite', 'bookmark', 'bookmarks', 'playlists', 'menu', 'sidebar', 'queue', 'prev', 'play', 'next', 'volume', 'effects', 'audioTrack', 'subtitles', 'skipBack', 'skipFwd'];

/** Build one item; returns { el, refresh }. */
export function buildItem(id) {
  const d = ITEMS[id];
  if (!d) return null;
  if (d.custom === 'volume') { const v = createVolume(); return { el: v.el, refresh: v.refresh }; }
  if (d.custom === 'spacer') return { el: h('span.ctl-spacer'), refresh() {} };
  if (d.custom === 'divider') return { el: h('span.tb-sep'), refresh() {} };
  if (d.custom === 'text') {
    const el = h('span.ctl-text');
    return { el, refresh() { el.textContent = d.text(); el.title = el.textContent; el.hidden = !el.textContent; } };
  }
  if (d.custom === 'folder') {
    const label = h('span');
    const el = h('button.chip', { onclick: () => { const it = player.current; if (it && it.folder) router.go({ view: it.kind === 'audio' ? 'music' : 'videos', dir: it.folder }); } }, h('span', { html: icon('folder', 20), style: { display: 'contents' } }), label);
    return {
      el,
      refresh() {
        const it = player.current;
        const text = it ? (it.folder ? baseName(it.folder) : it.remote ? 'Network' : '') : '';
        label.textContent = text;
        el.hidden = !text;
        el.title = it && it.folder ? it.folder : '';
      },
    };
  }
  if (d.custom === 'thumb') {
    const el = h('div.ctl-thumb');
    let shown = null;
    return {
      el,
      refresh() {
        const it = player.current;
        el.hidden = !it;
        if (!it || shown === it.id + (player.meta ? 'm' : '')) return;
        shown = it.id + (player.meta ? 'm' : '');
        el.style.backgroundImage = '';
        el.style.background = '';
        const cover = player.meta && player.meta.cover;
        if (cover) { el.style.backgroundImage = `url(${cover})`; return; }
        if (it.remote) { el.style.background = artGradient(it.name); return; }
        getThumb({ path: it.path, kind: it.kind, name: it.name }).then((r) => {
          if (player.current !== it) return;
          if (r && r.thumb) el.style.backgroundImage = `url(${r.thumb})`; else el.style.background = artGradient(it.name);
        });
      },
    };
  }
  // generic button
  const el = h('button.' + (d.cls || 'ctl'), { onclick: (e) => { d.run(e.currentTarget, e); setTimeout(() => el._refresh && el._refresh(), 0); } });
  const refresh = () => {
    el.innerHTML = d.html ? d.html() : icon(d.icon, 20);
    el.title = d.title ? d.title() : d.label;
    el.disabled = !!(d.disabled && d.disabled());
    el.hidden = !!(d.hidden && d.hidden());
    if (!d.cls) {
      el.classList.toggle('on', !!(d.active && d.active()));
      el.classList.toggle('rec', !!(d.cls2 && d.cls2()));
    }
    if (d.fillWhenActive) el.querySelector('svg')?.setAttribute('fill', d.active && d.active() ? 'currentColor' : 'none');
  };
  el._refresh = refresh;
  refresh();
  return { el, refresh };
}
