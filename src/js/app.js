import { store } from './store.js';
import { router } from './router.js';
import * as P from './player.js';
import { player } from './player.js';
import { applyVideoFx } from './audio.js';
import { applyMode, initShell, isPlayerView } from './shell.js';
import { renderView } from './views.js';
import { openFilesDialog, openMediaPaths } from './actions.js';
import { openSettings, openShortcuts, openNetwork, openOnboarding, openSubtitleMenu, closeEffects } from './dialogs.js';
import { hasModal, topModal, closeMenu, $ } from './ui.js';
import { snapshot } from './extras.js';

// ------------------------------------------------------------ appearance

const media = matchMedia('(prefers-color-scheme: dark)');
function applyAppearance() {
  const s = store.s;
  const theme = s.theme === 'system' ? (media.matches ? 'dark' : 'light') : s.theme;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.setProperty('--accent', s.accent);
  root.style.setProperty('--sub-size', s.subSize + 'px');
  root.style.setProperty('--sub-bg', String(s.subBg / 100));
  root.style.setProperty('--sub-color', s.subColor);
  window.vlc.win('theme', s.theme);
}
media.addEventListener('change', applyAppearance);
store.subscribe((key) => {
  if (key === 'settings' || key === '*') applyAppearance();
  if (key === 'folders' || key === 'playlists' || key === 'streams') { if (!isPlayerView()) renderView($('#viewRoot'), router.route); }
});
applyAppearance();
applyVideoFx(...document.querySelectorAll('#mediaSlot video'));

// ------------------------------------------------------------ keyboard

const step = () => store.s.skipStep;
const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range';

window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  const k = e.key;
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && !e.altKey) {
    if (k === 'o' || k === 'O') { e.preventDefault(); e.shiftKey ? window.vlc.pickFolder().then((d) => d && openMediaPaths([d])) : openFilesDialog(); return; }
    if (k === 'n' || k === 'N') { e.preventDefault(); openNetwork(); return; }
    if (k === ',') { e.preventDefault(); openSettings(); return; }
    return;
  }
  if (k === 'F1') { e.preventDefault(); openShortcuts(); return; }
  if (k === 'Escape') {
    if (hasModal()) { const m = topModal(); if (m.closable) m.close(); return; }
    closeMenu();
    closeEffects();
    if (document.fullscreenElement || $('#app').classList.contains('fullscreen')) { window.vlc.win('fullscreen', false); return; }
    if (isPlayerView()) router.back();
    return;
  }
  if (hasModal()) return;
  if (e.target.tagName === 'BUTTON' && (k === ' ' || k === 'Enter')) return; // let focused buttons activate

  switch (k) {
    case ' ': case 'k': e.preventDefault(); P.toggle(); break;
    case 'ArrowLeft': if (player.current) { e.preventDefault(); P.seekBy(e.shiftKey ? -60 : -step()); } break;
    case 'ArrowRight': if (player.current) { e.preventDefault(); P.seekBy(e.shiftKey ? 60 : step()); } break;
    case 'ArrowUp': e.preventDefault(); P.setVolume(player.volume + 0.05); break;
    case 'ArrowDown': e.preventDefault(); P.setVolume(player.volume - 0.05); break;
    case 'm': case 'M': P.toggleMute(); break;
    case 'f': case 'F': window.vlc.win('fullscreen'); break;
    case 'n': case 'N': P.next(); break;
    case 'p': case 'P': P.prev(); break;
    case 's': P.stop(); break;
    case 'S': snapshot(); break;
    case '[': P.setRate(Math.max(0.25, +(player.rate - 0.25).toFixed(2))); break;
    case ']': P.setRate(Math.min(3, +(player.rate + 0.25).toFixed(2))); break;
    case '=': P.setRate(1); break;
    case 'v': case 'V': if (player.subs.length) P.setSubtitle(player.subIndex >= 0 ? -1 : 0); break;
    case 'q': case 'Q': if (isPlayerView()) { store.update((s) => { s.player.sidebar = !s.player.sidebar; }, 'player'); applyMode(); } break;
    case 'MediaPlayPause': P.toggle(); break;
    default: break;
  }
});

// ------------------------------------------------------------ drag & drop

const hint = $('#dropHint');
let depth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; hint.hidden = false; } });
window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) hint.hidden = true; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  depth = 0;
  hint.hidden = true;
  const paths = [...e.dataTransfer.files].map((f) => window.vlc.pathForFile(f)).filter(Boolean);
  if (paths.length) openMediaPaths(paths, { enqueue: e.shiftKey });
});

window.vlc.onOpenFiles((files) => openMediaPaths(files));

// ------------------------------------------------------------ boot

initShell();
if (!store.state.onboarded) {
  openOnboarding(() => {
    const view = store.s.startView;
    router.go({ view });
  });
} else if (store.s.startView !== 'home') {
  router.replace({ view: store.s.startView });
}
