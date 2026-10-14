import { store } from './store.js';
import { router } from './router.js';
import * as P from './player.js';
import { player } from './player.js';
import { h, $, clear, ico, iconButton, showMenu, baseName, stripExt, artGradient } from './ui.js';
import { icon } from './icons.js';
import { createControls, createZone } from './controls.js';
import { bus } from './bus.js';
import { update as updateInfo } from './updates.js';
const updateState = () => updateInfo.state;
const updateAvailable = () => ['available', 'ready', 'downloading'].includes(updateInfo.state.status);
import { getThumb } from './thumbs.js';
import { renderView } from './views.js';
import { addMenu, openFilesDialog, openMediaPaths } from './actions.js';
import { openSettings, openShortcuts, openAbout, openCustomize, openEffects, openSubtitleMenu, openNetwork } from './dialogs.js';

const app = $('#app');
const topbar = $('#topbar');
const nav = $('#nav');
const stage = $('#stage');
const viewRoot = $('#viewRoot');
const queuePanel = $('#queuePanel');
const mini = $('#mini');

let winState = { maximized: false, fullscreen: false };
let controls;
let hideUi = false;
export function toggleHideUi() { hideUi = !hideUi; applyMode(); }

export const isPlayerView = () => router.route.view === 'player';

// ------------------------------------------------------------ top bar

const NAV = [
  ['home', 'Home', 'home'],
  ['videos', 'Videos', 'video'],
  ['music', 'Music', 'music'],
  ['network', 'Network', 'network'],
  ['playlists', 'Playlists', 'playlist'],
  ['recent', 'Recent', 'history'],
];

export function appMenu(anchor) {
  showMenu(anchor, [
    { label: 'Open files…', icon: 'play', kbd: 'Ctrl+O', onClick: openFilesDialog },
    { label: 'Open folder…', icon: 'folder', kbd: 'Ctrl+Shift+O', onClick: async () => { const d = await window.native.pickFolder(); if (d) openMediaPaths([d]); } },
    { label: 'Open network stream…', icon: 'network', kbd: 'Ctrl+N', onClick: openNetwork },
    { sep: true },
    { label: 'Customize player…', icon: 'sliders', onClick: openCustomize },
    { label: 'Settings', icon: 'settings', kbd: 'Ctrl+,', onClick: () => openSettings() },
    { label: 'Keyboard shortcuts', icon: 'keyboard', kbd: 'F1', onClick: openShortcuts },
    { label: updateAvailable() ? `Update available (${updateState().latest})` : 'Check for updates…', icon: 'download', onClick: () => bus.openUpdates() },
    { label: 'About', icon: 'info', onClick: openAbout },
    { sep: true },
    { label: 'Quit', icon: 'close', kbd: 'Alt+F4', onClick: () => window.native.win('close') },
  ]);
}

let topZone = null;
const topIds = () => store.state.player.layout.top;

function renderTopbar() {
  const playerMode = isPlayerView();
  const it = player.current;
  const left = h('div.tb-left', null, h('div.tb-logo', null, h('img', { src: '../assets/logo.svg', alt: '' })));
  if (playerMode) {
    topZone = createZone(h('div.ctl-group.top-zone'), topIds);
    left.append(topZone.el);
    topZone.update();
  } else {
    topZone = null;
    left.append(iconButton('dots', { title: 'Menu', onclick: (e) => appMenu(e.currentTarget) }));
  }
  const title = h('div.tb-title', null, it ? it.title || stripExt(it.name) : 'Marigold Player');
  const right = h('div.tb-right', null,
    iconButton('minimize', { title: 'Minimize', cls: 'win', onclick: () => window.native.win('minimize') }),
    iconButton(winState.maximized ? 'restore' : 'maximize', { title: winState.maximized ? 'Restore' : 'Maximize', cls: 'win', onclick: () => window.native.win('maximize') }),
    iconButton(winState.fullscreen ? 'exitFullscreen' : 'fullscreen', { title: 'Fullscreen', cls: 'win', onclick: () => window.native.win('fullscreen') }),
    iconButton('close', { title: 'Close', cls: 'win close', onclick: () => window.native.win('close') }),
  );
  clear(topbar).append(left, title, right);
  topbar.ondblclick = (e) => { if (e.target === topbar || e.target.classList.contains('tb-title')) window.native.win('maximize'); };
}

// ------------------------------------------------------------ nav

function renderNav() {
  const cur = ['playlist', 'favorites'].includes(router.route.view) ? 'playlists' : router.route.view;
  clear(nav);
  for (const [view, label, ic] of NAV) {
    nav.append(h('button.nav-item' + (cur === view ? '.active' : ''), { title: label, onclick: () => router.go({ view }) }, ico(ic, 20), h('span', null, label)));
  }
  const add = h('button.nav-item', { title: 'Add item', onclick: () => addMenu(add, { align: 'start' }) }, ico('plus', 20), h('span', null, 'Add item'));
  nav.append(add);
}

// ------------------------------------------------------------ queue panel

export function toggleQueue(side) {
  store.update((s) => {
    const p = s.player;
    if (side && p.sidebar && p.sidebarSide !== side) { p.sidebarSide = side; return; }
    if (side) p.sidebarSide = side;
    p.sidebar = !p.sidebar;
  }, 'player');
  applyMode();
}

function renderQueue() {
  if (queuePanel.hidden) return;
  clear(queuePanel);
  const q = player.queue;
  const it = player.current;
  const head = h('div.panel-head', null,
    h('h3', null, it && it.folder ? baseName(it.folder) : 'Queue'),
    iconButton('shuffle', { title: 'Shuffle', cls: store.state.player.shuffle ? 'on' : '', onclick: () => P.toggleShuffle() }),
    iconButton('trash', { title: 'Clear queue', onclick: () => P.clearQueue() }),
    iconButton('close', { title: 'Hide queue', onclick: toggleQueue }),
  );
  const sub = h('div.panel-sub', null, h('span', null, `${q.length} item${q.length === 1 ? '' : 's'}`));
  const list = h('div.queue-list');
  if (!q.length) list.append(h('div.q-empty', null, 'The queue is empty. Play something from your library and it will show up here.'));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); e.target._load && e.target._load(); } }), { root: list, rootMargin: '200px' });
  q.forEach((item, i) => {
    const t = h('div.q-thumb', { html: icon(item.remote ? 'network' : item.kind === 'audio' ? 'music' : 'video', 16) });
    if (!item.remote) t._load = () => getThumb({ path: item.path, kind: item.kind, name: item.name }).then((r) => { if (r && r.thumb) { t.style.backgroundImage = `url(${r.thumb})`; t.innerHTML = ''; } });
    const row = h('button.q-item' + (i === player.index ? '.current' : ''), {
      onclick: () => P.playIndex(i),
      oncontextmenu: (ev) => { ev.preventDefault(); showMenu({ x: ev.clientX, y: ev.clientY }, [{ label: 'Play', icon: 'play', onClick: () => P.playIndex(i) }, { label: 'Remove from queue', icon: 'trash', danger: true, disabled: i === player.index, onClick: () => P.removeAt(i) }]); },
    }, t, h('span.t', null, stripExt(item.title && item.kind === 'audio' ? item.title : item.name)));
    list.append(row);
    if (t._load) io.observe(t);
  });
  queuePanel.append(head, sub, list);
  const active = list.querySelector('.current');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

// ------------------------------------------------------------ stage (video + music artwork)

function renderStage() {
  const it = player.current;
  const audio = it && it.kind === 'audio';
  stage.classList.toggle('audio', !!audio);
  const art = $('#stageArt');
  clear(art);
  if (audio) {
    const cover = player.meta && player.meta.cover;
    const bg = h('div.art-bg', { style: { backgroundImage: cover ? `url(${cover})` : artGradient(it.name) } });
    const card = h('div.art-card', { style: cover ? { backgroundImage: `url(${cover})` } : { background: artGradient(it.name) }, html: cover ? '' : icon('music', 64) });
    art.append(bg, card);
    const meta = player.meta;
    const title = meta && meta.title ? meta.title : stripExt(it.name);
    $('#stageTitle').textContent = meta && meta.artist ? `${title} - ${meta.artist}` : title;
  }
  const msg = $('#stageMsg');
  msg.classList.toggle('show', !!player.error);
  msg.textContent = player.error || '';
}

// ------------------------------------------------------------ mini player

function renderMini() {
  const it = player.current;
  const show = !!it && !isPlayerView();
  mini.hidden = !show;
  if (!show) return;
  const audio = it.kind === 'audio';
  const cover = player.meta && player.meta.cover;
  const view = h('div.mini-view' + (audio ? '.audio' : ''), { onclick: () => router.go({ view: 'player' }) });
  const art = h('div.mini-art', { style: audio ? { background: cover ? `url(${cover}) center/cover` : artGradient(it.name) } : null, html: audio && !cover ? icon('music', 40) : '' });
  const hover = h('div.mini-hover', null,
    h('button', { title: 'Play / Pause', html: icon(player.playing ? 'pause' : 'play', 20), onclick: (e) => { e.stopPropagation(); P.toggle(); } }),
    h('button', { title: 'Stop', html: icon('stop', 18), onclick: (e) => { e.stopPropagation(); P.stop(); } }),
  );
  view.append(art, hover);
  view.prepend(player.slot);
  const bar = h('div.mini-bar', { onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); P.seek(((e.clientX - r.left) / r.width) * player.duration); } }, h('i'));
  const chips = h('div.mini-meta');
  if (it.folder) chips.append(h('button.chip', { title: it.folder, onclick: () => router.go({ view: audio ? 'music' : 'videos', dir: it.folder }) }, ico('folder', 18), h('span', null, baseName(it.folder))));
  if (audio && player.meta && player.meta.artist) chips.append(h('div.chip', null, ico('music', 18), h('span', null, player.meta.artist)));
  chips.append(h('span.grow'), iconButton('queue', { title: 'Open queue', onclick: () => { store.update((s) => { s.player.sidebar = true; }, 'player'); router.go({ view: 'player' }); } }));
  clear(mini).append(view, bar, h('div.mini-title', null, it.title || stripExt(it.name)), chips);
  updateMiniBar();
}

function updateMiniBar() {
  const i = mini.querySelector('.mini-bar i');
  if (i) i.style.width = (player.duration ? (player.time / player.duration) * 100 : 0) + '%';
}

// ------------------------------------------------------------ modes

export function applyMode() {
  const playerMode = isPlayerView();
  app.classList.toggle('mode-player', playerMode);
  app.classList.toggle('mode-library', !playerMode);
  app.classList.toggle('fullscreen', winState.fullscreen);
  stage.hidden = !playerMode;
  viewRoot.hidden = playerMode;
  $('#controls').hidden = !playerMode;
  queuePanel.hidden = !(playerMode && store.state.player.sidebar && !winState.fullscreen);
  $('#body').classList.toggle('queue-right', store.state.player.sidebarSide === 'right');
  app.classList.toggle('hide-ui', hideUi && playerMode);
  if (playerMode) { stage.prepend(player.slot); player.slot.after($('#stageArt')); }
  renderTopbar();
  renderNav();
  renderQueue();
  renderStage();
  renderMini();
  if (playerMode) controls.updateAll();
  syncPlaying();
}

let raf = 0;
function loop() {
  raf = 0;
  if (isPlayerView()) controls.updateTime(); else updateMiniBar();
  if (player.playing) raf = requestAnimationFrame(loop);
}
function syncPlaying() { if (player.playing && !raf) raf = requestAnimationFrame(loop); }

// ------------------------------------------------------------ init

export function initShell() {
  controls = createControls();

  router.subscribe((route) => {
    if (route.view === 'player' && !player.current) { router.replace({ view: 'home' }); return; }
    applyMode();
    if (route.view !== 'player') renderView(viewRoot, route);
  });

  const refreshChrome = () => { controls.updateState(); if (topZone) topZone.update(); };

  P.on('item', () => {
    window.native.win('title', player.current ? player.current.title || player.current.name : 'Marigold Player');
    renderTopbar(); renderStage(); renderMini(); renderQueue();
    if (!player.current && isPlayerView()) router.go({ view: 'home' });
    if (isPlayerView()) controls.updateAll();
  });
  P.on('meta', () => { renderStage(); renderMini(); renderTopbar(); });
  P.on('peaks', () => controls.redrawSeek());
  P.on('queue', () => { renderQueue(); refreshChrome(); });
  P.on('state', () => { refreshChrome(); renderMini(); syncPlaying(); renderStage(); });
  P.on('time', () => { if (isPlayerView()) controls.updateTime(); else updateMiniBar(); });
  for (const ev of ['volume', 'subs', 'loop', 'record', 'sleep', 'chapters']) P.on(ev, refreshChrome);

  store.subscribe((key) => {
    if (key === 'player') { refreshChrome(); renderQueue(); }
    if (['audio', 'favorites', 'bookmarks', 'video'].includes(key)) refreshChrome();
    if (key === 'settings') { controls.updateAll(); if (topZone) topZone.update(); }
  });

  window.native.onWinState((s) => { winState = s; applyMode(); wake(); });
  window.addEventListener('resize', () => controls.redrawSeek());

  // stage interactions
  let clickTimer = 0;
  stage.addEventListener('click', (e) => {
    if (e.target.closest('#stageMsg')) return;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => P.toggle(), 220);
  });
  stage.addEventListener('dblclick', () => { clearTimeout(clickTimer); window.native.win('fullscreen'); });
  stage.addEventListener('wheel', (e) => {
    const act = store.s.wheelAction;
    const up = e.deltaY < 0;
    if (act === 'volume') P.setVolume(player.volume + (up ? 0.05 : -0.05));
    else if (act === 'seek' && player.current) P.seekBy(up ? store.s.skipStep : -store.s.skipStep);
  }, { passive: true });

  // hide the chrome after a pause in fullscreen
  let idleTimer = 0;
  function wake() {
    app.classList.remove('idle');
    clearTimeout(idleTimer);
    if (winState.fullscreen && isPlayerView()) idleTimer = setTimeout(() => { if (!document.querySelector('.popover, .fx')) app.classList.add('idle'); }, store.s.idleHide * 1000);
  }
  for (const ev of ['mousemove', 'keydown', 'pointerdown']) window.addEventListener(ev, wake, true);
  // With the interface hidden (H), moving to the top or bottom edge brings it back temporarily.
  window.addEventListener('mousemove', (e) => { app.classList.toggle('reveal', e.clientY < 56 || e.clientY > innerHeight - 76); }, true);

  applyMode();
  renderView(viewRoot, router.route);
}

