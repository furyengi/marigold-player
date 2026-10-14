import { store } from './store.js';
import { router } from './router.js';
import * as P from './player.js';
import { applyVideoFx, applyAudioFx } from './audio.js';
import { initShell, isPlayerView, appMenu, toggleQueue, toggleHideUi } from './shell.js';
import { renderView } from './views.js';
import { openFilesDialog, openMediaPaths, addToPlaylist, newPlaylist } from './actions.js';
import { openSettings, openShortcuts, openNetwork, openOnboarding, openCustomize, openEffects, openSubtitleMenu, openProperties, closeEffects, openAddSubtitles, pickSubtitleTarget } from './dialogs.js';
import { syncNative } from './settings.js';
import { actionForEvent } from './hotkeys.js';
import * as items from './items.js';
import { bus } from './bus.js';
import { hasModal, topModal, closeMenu, confirmBox, $ } from './ui.js';

// ------------------------------------------------------------ appearance

const media = matchMedia('(prefers-color-scheme: dark)');
function applyAppearance() {
  const s = store.s;
  const theme = s.theme === 'system' ? (media.matches ? 'dark' : 'light') : s.theme;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('reduce-motion', !!s.reduceMotion);
  root.style.setProperty('--accent', s.accent);
  root.style.setProperty('--sub-size', s.subSize + 'px');
  root.style.setProperty('--sub-bg', String(s.subBg / 100));
  root.style.setProperty('--sub-color', s.subColor);
  root.style.setProperty('--thumb-min', { s: '160px', m: '210px', l: '280px' }[s.thumbSize] || '210px');
  $('#mini').dataset.side = s.miniSide;
  window.native.win('theme', s.theme);
}
media.addEventListener('change', applyAppearance);

let lastSettings = '';
store.subscribe((key) => {
  if (key === 'settings' || key === '*') {
    applyAppearance();
    // Re-render the library when display options change, and push audio/proxy settings through.
    const sig = JSON.stringify([store.s.thumbSize, store.s.showHidden, store.s.showExt, store.s.thumbs]);
    if (sig !== lastSettings) { lastSettings = sig; if (!isPlayerView()) renderView($('#viewRoot'), router.route); }
    applyAudioFx();
  }
  if (['folders', 'playlists', 'streams', 'favorites'].includes(key)) { if (!isPlayerView()) renderView($('#viewRoot'), router.route); }
});
applyAppearance();
applyVideoFx();

// ------------------------------------------------------------ action bus

Object.assign(bus, {
  appMenu, toggleQueue, toggleHideUi,
  openSettings, openShortcuts, openNetwork, openCustomize, openEffects, openSubtitleMenu, openProperties, openAddSubtitles, pickSubtitleTarget,
  openFiles: openFilesDialog,
  openFolder: async () => { const d = await window.native.pickFolder(); if (d) openMediaPaths([d]); },
  goHome: () => router.go({ view: 'home' }),
  addToPlaylist, newPlaylist,
  snapshot: items.snapshot, pip: items.pip, cycleZoom: items.cycleZoom, rotate: items.rotate,
  toggleFavorite: items.toggleFavorite, addBookmark: items.addBookmark, toggleSleep: items.toggleSleep,
});

// ------------------------------------------------------------ keyboard

const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range';

window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  if (e.key === 'Escape') {
    if (hasModal()) { const m = topModal(); if (m.closable) m.close(); return; }
    closeMenu();
    closeEffects();
    if ($('#app').classList.contains('fullscreen')) { window.native.win('fullscreen', false); return; }
    if (isPlayerView()) router.back();
    return;
  }
  if (hasModal()) return;
  // Let a focused button handle Space/Enter itself.
  if (e.target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
  const action = actionForEvent(e);
  if (action) { e.preventDefault(); action.run(); }
});

// ------------------------------------------------------------ drag & drop

const hint = $('#dropHint');
let depth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; hint.hidden = false; } });
window.addEventListener('dragleave', (e) => { if (hasFiles(e)) { depth = Math.max(0, depth - 1); if (!depth) hint.hidden = true; } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  depth = 0;
  hint.hidden = true;
  const paths = [...(e.dataTransfer ? e.dataTransfer.files : [])].map((f) => window.native.pathForFile(f)).filter(Boolean);
  if (paths.length) openMediaPaths(paths, { enqueue: e.shiftKey });
});

window.native.onOpenFiles((files) => openMediaPaths(files));

// ------------------------------------------------------------ mini player: drag to the other corner

(() => {
  const mini = $('#mini');
  let drag = null;
  mini.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .mini-bar')) return;
    drag = { x: e.clientX, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 12) drag.moved = true;
  });
  window.addEventListener('pointerup', (e) => {
    if (!drag) return;
    if (drag.moved) {
      const side = e.clientX < innerWidth / 2 ? 'left' : 'right';
      if (side !== store.s.miniSide) store.update((s) => { s.settings.miniSide = side; }, 'settings');
      mini.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
    }
    drag = null;
  });
})();

// ------------------------------------------------------------ boot

initShell();
syncNative();
if (!store.state.onboarded) {
  openOnboarding(() => router.go({ view: store.s.startView }));
} else if (store.s.startView !== 'home') {
  router.replace({ view: store.s.startView });
}

if (store.s.checkUpdates) {
  window.native.checkUpdate().then(async (r) => {
    if (r && r.newer && await confirmBox('Update available', `Version ${r.latest} is available (you have ${r.current}).`, 'View release')) window.native.external(r.url);
  });
}
