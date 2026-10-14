import { store } from './store.js';
import { h, clear, modal, toast, ico, fmtSize } from './ui.js';

/** Mirror of the main-process updater state, plus the update window. */
export const update = { state: { status: 'idle', current: '', latest: null, notes: '', percent: 0, speed: 0, mode: 'manual', error: '', reason: '', checkedAt: 0 } };
const listeners = new Set();
export const onUpdate = (fn) => listeners.add(fn);

let dialog = null;
let announcedFor = null;

function apply(s) {
  update.state = s;
  // The menu button shows a dot while there is something to install (see app.css).
  document.documentElement.dataset.update = ['available', 'ready', 'downloading'].includes(s.status) ? s.status : '';
  listeners.forEach((f) => f(s));
  if (dialog) dialog.render();
}

export async function initUpdates() {
  apply(await window.native.update.state());
  window.native.update.onState(apply);
  if (store.s.checkUpdates) setTimeout(() => checkNow({ silent: true }), 4000);
}

export async function checkNow({ silent = false } = {}) {
  const s = await window.native.update.check();
  apply(s);
  if (silent) {
    if (s.status === 'available' && announcedFor !== s.latest) {
      announcedFor = s.latest;
      toast(`Version ${s.latest} is available`, 9000, { label: 'View', onClick: openUpdateDialog });
    }
  } else if (s.status === 'none') toast(`You're up to date (${s.current})`);
  return s;
}

const ago = (ts) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/** Dialog that follows the update through checking, downloading and ready-to-install. */
export function openUpdateDialog() {
  if (dialog) return dialog;
  const body = h('div.dlg-body.upd');
  const foot = h('div.dlg-foot');
  const m = modal({ title: 'Software update', width: 520, body, footer: foot, onClose: () => { dialog = null; } });
  const s = () => update.state;

  const hero = (title, sub, spin = false) => h('div.upd-hero', null,
    h('div.upd-logo' + (spin ? '.spin' : ''), null, h('img', { src: '../assets/logo.svg', alt: '' })),
    h('div', null, h('div.upd-title', null, title), sub && h('div.upd-sub', null, sub)));
  const btn = (label, fn, cls = '') => h('button.btn' + (cls ? '.' + cls : ''), { onclick: fn }, label);

  function render() {
    const st = s();
    clear(body);
    clear(foot);
    const close = btn('Close', () => m.close(), 'ghost');
    switch (st.status) {
      case 'checking':
        body.append(hero('Checking for updates…', `You have version ${st.current}`, true));
        foot.append(close);
        break;
      case 'available': {
        body.append(hero(`Version ${st.latest} is available`, `You have version ${st.current}`));
        if (st.notes) body.append(h('div.upd-label', null, 'What’s new'), h('div.upd-notes', null, st.notes));
        if (st.mode !== 'auto') body.append(h('p.dlg-note', { style: { marginTop: '14px' } }, `${st.reason || 'This version cannot install updates by itself.'} The download page will open.`));
        foot.append(btn('Later', () => m.close(), 'ghost'), st.mode === 'auto'
          ? btn('Update now', () => window.native.update.download(), 'primary')
          : h('button.btn.primary', { onclick: () => window.native.update.download() }, ico('external', 16), 'Download'));
        break;
      }
      case 'downloading':
        body.append(hero(`Downloading version ${st.latest}`, 'You can keep using the app while this finishes.'),
          h('div.upd-bar', null, h('i', { style: { width: `${st.percent}%` } })),
          h('div.upd-meta', null, h('span', null, `${st.percent}%`), h('span', null, st.speed ? `${fmtSize(st.speed)}/s` : '')));
        foot.append(btn('Hide', () => m.close(), 'ghost'));
        break;
      case 'ready':
        body.append(hero('Ready to install', `Version ${st.latest} has been downloaded. Marigold Player will restart to finish the update.`),
          h('div.upd-bar', null, h('i', { style: { width: '100%' } })));
        foot.append(btn('Later', () => m.close(), 'ghost'), btn('Restart and install', () => window.native.update.install(), 'primary'));
        break;
      case 'error':
        body.append(hero('Update failed', st.error || 'Something went wrong.'));
        foot.append(close, btn('Open download page', () => window.native.update.page(), 'ghost'), btn('Try again', () => checkNow(), 'primary'));
        break;
      case 'none':
        body.append(hero('You’re up to date', `Marigold Player ${st.current}${st.checkedAt ? ` · checked ${ago(st.checkedAt)}` : ''}`));
        foot.append(close, btn('Check again', () => checkNow()));
        break;
      default:
        body.append(hero('Software update', `You have version ${st.current}`));
        foot.append(close, btn('Check for updates', () => checkNow(), 'primary'));
    }
  }
  dialog = { render, close: () => m.close() };
  render();
  return dialog;
}

/** Opens the window and, unless an update is already known, starts a check. */
export function openUpdates() {
  const st = update.state.status;
  openUpdateDialog();
  if (['idle', 'none', 'error'].includes(st)) checkNow();
}

