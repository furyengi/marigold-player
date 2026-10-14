// In-app updates. Windows (installed, not portable) and Linux AppImage builds download and install the new
// version themselves with electron-updater. Everything else (macOS builds without a signing certificate,
// .deb packages, the portable exe) can still see that an update exists and is sent to the release page.
const { app, ipcMain, net, shell } = require('electron');

let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch { autoUpdater = null; }

const REPO = 'furyengi/marigold-player';
const RELEASES = `https://github.com/${REPO}/releases/latest`;

const state = {
  status: 'idle', // idle | checking | none | available | downloading | ready | error
  current: app.getVersion(),
  latest: null,
  notes: '',
  url: RELEASES,
  percent: 0,
  speed: 0,
  mode: 'manual', // auto = downloads and installs in the app, manual = opens the release page
  reason: '',
  error: '',
  checkedAt: 0,
};

function manualReason() {
  if (!app.isPackaged) return 'This is a development build.';
  if (process.platform === 'darwin') return 'macOS builds are not code-signed, so updates are installed by downloading the new version.';
  if (process.platform === 'win32') return process.env.PORTABLE_EXECUTABLE_DIR ? 'The portable version cannot update itself.' : '';
  if (process.platform === 'linux') return process.env.APPIMAGE ? '' : 'Packages installed with apt or dpkg are updated by downloading the new package.';
  return '';
}

const fake = !app.isPackaged && !!process.env.MGP_FAKE_UPDATE;
const canAuto = () => !!autoUpdater && app.isPackaged && (
  (process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_DIR) ||
  (process.platform === 'linux' && !!process.env.APPIMAGE)
);

let getWin = () => null;
const emit = () => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('update:state', { ...state }); };
const set = (patch) => { Object.assign(state, patch); emit(); };

/** Release notes arrive as HTML (electron-updater) or Markdown (GitHub API); show them as plain text. */
function plain(text) {
  if (Array.isArray(text)) text = text.map((n) => n.note || '').join('\n\n');
  return String(text || '')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*\/?(p|div|br|h\d|ul|ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const isNewer = (a, b) => {
  const n = (v) => String(v).replace(/^v/, '').split('-')[0].split('.').map((x) => parseInt(x, 10) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
};

async function checkViaGitHub() {
  const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'marigold-player', Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(res.status === 404 ? 'No releases found' : `GitHub answered ${res.status}`);
  const j = await res.json();
  const latest = String(j.tag_name || '').replace(/^v/, '');
  if (isNewer(latest, state.current)) set({ status: 'available', latest, notes: plain(j.body), url: j.html_url || RELEASES, mode: 'manual', checkedAt: Date.now(), error: '' });
  else set({ status: 'none', latest, checkedAt: Date.now(), error: '' });
}

async function check() {
  if (['checking', 'downloading'].includes(state.status)) return { ...state };
  set({ status: 'checking', error: '', percent: 0 });
  try {
    if (fake) {
      await new Promise((r) => setTimeout(r, 700));
      set({ status: 'available', latest: '9.9.9', mode: 'auto', checkedAt: Date.now(), notes: 'New in 9.9.9\n• A simulated update so the update window can be tested.\n• Faster library scanning.\n• Fixes for subtitle timing after seeking.' });
    } else if (canAuto()) {
      await autoUpdater.checkForUpdates();
    } else {
      await checkViaGitHub();
    }
  } catch (err) {
    set({ status: 'error', error: friendly(err) });
  }
  return { ...state };
}

function friendly(err) {
  const m = String((err && err.message) || err || 'Unknown error');
  if (/net::|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|fetch failed/i.test(m)) return "Couldn't reach the update server. Check your internet connection and try again.";
  return m.split('\n')[0].slice(0, 200);
}

let fakeTimer = 0;
async function download() {
  if (state.status !== 'available') return { ...state };
  if (state.mode !== 'auto') { shell.openExternal(state.url); return { ...state }; }
  set({ status: 'downloading', percent: 0, speed: 0, error: '' });
  if (fake) {
    let p = 0;
    clearInterval(fakeTimer);
    fakeTimer = setInterval(() => {
      p += 7;
      if (p >= 100) { clearInterval(fakeTimer); set({ status: 'ready', percent: 100, speed: 0 }); } else set({ percent: p, speed: 2.4 * 1024 * 1024 });
    }, 250);
    return { ...state };
  }
  try { await autoUpdater.downloadUpdate(); } catch (err) { set({ status: 'error', error: friendly(err) }); }
  return { ...state };
}

function install() {
  if (state.status !== 'ready') return false;
  if (fake) { set({ status: 'error', error: 'This is a simulated update, so there is nothing to install.' }); return false; }
  // Flush the window first so settings are saved, then let the installer take over.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
}

function init(windowGetter) {
  getWin = windowGetter;
  if (autoUpdater && !fake) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;
    autoUpdater.on('update-available', (info) => set({ status: 'available', latest: info.version, notes: plain(info.releaseNotes), url: RELEASES, mode: 'auto', checkedAt: Date.now(), error: '' }));
    autoUpdater.on('update-not-available', (info) => set({ status: 'none', latest: info.version, checkedAt: Date.now(), error: '' }));
    autoUpdater.on('download-progress', (p) => set({ status: 'downloading', percent: Math.round(p.percent), speed: p.bytesPerSecond }));
    autoUpdater.on('update-downloaded', () => set({ status: 'ready', percent: 100, speed: 0 }));
    autoUpdater.on('error', (err) => { if (state.status === 'checking' || state.status === 'downloading') set({ status: 'error', error: friendly(err) }); });
  }
  state.mode = fake || canAuto() ? 'auto' : 'manual';
  state.reason = state.mode === 'manual' ? manualReason() : '';
  ipcMain.handle('update:state', () => ({ ...state }));
  ipcMain.handle('update:check', () => check());
  ipcMain.handle('update:download', () => download());
  ipcMain.handle('update:install', () => install());
  ipcMain.handle('update:page', () => { shell.openExternal(state.url || RELEASES); });
}

module.exports = { init };
