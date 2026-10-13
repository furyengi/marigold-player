const { app, BrowserWindow, ipcMain, dialog, shell, protocol, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

const VIDEO_EXT = new Set(['mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'ogv', 'ts', 'mpg', 'mpeg', 'wmv', 'flv', '3gp']);
const AUDIO_EXT = new Set(['mp3', 'flac', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'wma', 'aif', 'aiff', 'mka']);
const SUB_EXT = new Set(['srt', 'vtt', 'ass', 'ssa']);

const MIME = {
  mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', ogv: 'video/ogg',
  ts: 'video/mp2t', mpg: 'video/mpeg', mpeg: 'video/mpeg', wmv: 'video/x-ms-wmv', flv: 'video/x-flv', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac',
  wma: 'audio/x-ms-wma', aif: 'audio/aiff', aiff: 'audio/aiff', mka: 'audio/x-matroska',
  srt: 'text/plain; charset=utf-8', vtt: 'text/vtt; charset=utf-8', ass: 'text/plain; charset=utf-8', ssa: 'text/plain; charset=utf-8',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};

const kindOf = (file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return null;
};

// The media scheme lets the renderer use CORS-enabled <video>/<audio> elements,
// which Web Audio needs for the equalizer (file:// media is tainted and plays silent).
protocol.registerSchemesAsPrivileged([
  { scheme: 'vlcmedia', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
]);

let win = null;
let pendingOpen = [];

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
}
function saveWindowState() {
  if (!win || win.isDestroyed() || win.isFullScreen()) return;
  const state = { maximized: win.isMaximized(), bounds: win.getNormalBounds() };
  try { fs.writeFileSync(stateFile(), JSON.stringify(state)); } catch {}
}

function mediaFromArgs(argv) {
  return argv.filter((a) => !a.startsWith('-') && fs.existsSync(a) && fs.statSync(a).isFile() && kindOf(a));
}

function createWindow() {
  const saved = loadWindowState();
  win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 900,
    minHeight: 560,
    ...(saved.bounds || {}),
    frame: false,
    show: false,
    backgroundColor: '#0e0e0e',
    title: 'VLC Redesign',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.removeMenu();
  if (saved.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  const sendState = (over = {}) => win && !win.isDestroyed() && win.webContents.send('win:state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen(), ...over });
  // isFullScreen() can still report the old value while these events fire on Windows, so pass the new value explicitly.
  win.on('maximize', () => sendState({ maximized: true }));
  win.on('unmaximize', () => sendState({ maximized: false }));
  win.on('enter-full-screen', () => sendState({ fullscreen: true }));
  win.on('leave-full-screen', () => sendState({ fullscreen: false }));
  win.on('close', saveWindowState);
  win.on('closed', () => { win = null; });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });

  win.webContents.once('did-finish-load', () => {
    if (pendingOpen.length) { win.webContents.send('open-files', pendingOpen); pendingOpen = []; }
    if (!app.isPackaged && process.env.VLCR_TEST) require(path.resolve(process.env.VLCR_TEST))(win);
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      const files = mediaFromArgs(argv.slice(1));
      if (files.length) win.webContents.send('open-files', files);
    }
  });
  app.on('open-file', (e, file) => {
    e.preventDefault();
    if (win && win.webContents && !win.webContents.isLoading()) win.webContents.send('open-files', [file]);
    else pendingOpen.push(file);
  });

  app.whenReady().then(() => {
    pendingOpen.push(...mediaFromArgs(process.argv.slice(app.isPackaged ? 1 : 2)));

    protocol.handle('vlcmedia', async (request) => {
      try {
        const u = new URL(request.url);
        const file = decodeURIComponent(u.pathname.slice(1));
        const ext = path.extname(file).slice(1).toLowerCase();
        if (!MIME[ext]) return new Response('Forbidden', { status: 403 });
        const st = await fs.promises.stat(file);
        const base = { 'Content-Type': MIME[ext], 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
        const m = /^bytes=(d*)-(d*)$/.exec(request.headers.get('range') || '');
        let start = 0;
        let end = st.size - 1;
        let status = 200;
        if (m && (m[1] || m[2])) {
          if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), end); }
          else { start = Math.max(0, st.size - Number(m[2])); }
          if (start > end || start >= st.size) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${st.size}` } });
          status = 206;
        }
        const headers = { ...base, 'Content-Length': String(end - start + 1) };
        if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
        if (request.method === 'HEAD' || st.size === 0) return new Response(null, { status, headers });
        const body = Readable.toWeb(fs.createReadStream(file, { start, end }));
        return new Response(body, { status, headers });
      } catch (err) {
        return new Response('Not found', { status: 404 });
      }
    });

    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

// ---------------------------------------------------------------- IPC

ipcMain.handle('win:action', (_e, action, value) => {
  if (!win) return;
  switch (action) {
    case 'minimize': win.minimize(); break;
    case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
    case 'close': win.close(); break;
    case 'fullscreen': win.setFullScreen(value === undefined ? !win.isFullScreen() : !!value); break;
    case 'title': win.setTitle(String(value || 'VLC Redesign')); break;
    case 'theme': nativeTheme.themeSource = ['light', 'dark', 'system'].includes(value) ? value : 'system'; break;
  }
  return { maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
});

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  videos: app.getPath('videos'),
  music: app.getPath('music'),
  home: app.getPath('home'),
  pictures: app.getPath('pictures'),
  systemDark: nativeTheme.shouldUseDarkColors,
}));

ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:files', async (_e, kind) => {
  const filters = kind === 'subtitles'
    ? [{ name: 'Subtitles', extensions: [...SUB_EXT] }]
    : [{ name: 'Media', extensions: [...VIDEO_EXT, ...AUDIO_EXT] }];
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters });
  return r.canceled ? [] : r.filePaths;
});

function entryFor(dir, name) {
  const full = path.join(dir, name);
  let st;
  try { st = fs.statSync(full); } catch { return null; }
  if (st.isDirectory()) return { type: 'dir', name, path: full, mtime: st.mtimeMs };
  const kind = kindOf(name);
  if (!kind) return null;
  return { type: 'file', kind, name, path: full, ext: path.extname(name).slice(1).toLowerCase(), size: st.size, mtime: st.mtimeMs };
}

ipcMain.handle('fs:list', async (_e, dir) => {
  try {
    const names = await fs.promises.readdir(dir);
    const entries = names.filter((n) => !n.startsWith('.') && n !== '$RECYCLE.BIN' && n !== 'System Volume Information').map((n) => entryFor(dir, n)).filter(Boolean);
    return { ok: true, dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), entries };
  } catch (err) {
    return { ok: false, dir, error: err.code || String(err), entries: [] };
  }
});

// Expand a mix of files and folders (e.g. from drag & drop) into a flat media list.
ipcMain.handle('fs:expand', async (_e, paths, limit = 2000) => {
  const out = [];
  const walk = async (p, depth) => {
    if (out.length >= limit) return;
    let st;
    try { st = await fs.promises.stat(p); } catch { return; }
    if (st.isFile()) {
      const kind = kindOf(p);
      if (kind) out.push({ type: 'file', kind, name: path.basename(p), path: p, ext: path.extname(p).slice(1).toLowerCase(), size: st.size, mtime: st.mtimeMs });
    } else if (st.isDirectory() && depth < 6) {
      const names = (await fs.promises.readdir(p)).filter((n) => !n.startsWith('.')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      for (const n of names) await walk(path.join(p, n), depth + 1);
    }
  };
  for (const p of paths) await walk(p, 0);
  return out;
});

ipcMain.handle('fs:siblings', async (_e, file) => {
  // Subtitle files that sit next to a media file and share its base name.
  try {
    const dir = path.dirname(file);
    const base = path.basename(file, path.extname(file)).toLowerCase();
    const names = await fs.promises.readdir(dir);
    return names
      .filter((n) => SUB_EXT.has(path.extname(n).slice(1).toLowerCase()) && n.toLowerCase().startsWith(base))
      .map((n) => path.join(dir, n));
  } catch { return []; }
});

ipcMain.handle('fs:readText', async (_e, file) => {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!SUB_EXT.has(ext)) return null;
  try {
    const st = await fs.promises.stat(file);
    if (st.size > 5 * 1024 * 1024) return null;
    return await fs.promises.readFile(file, 'utf8');
  } catch { return null; }
});

ipcMain.handle('fs:meta', async (_e, file) => {
  if (kindOf(file) !== 'audio') return null;
  try {
    const mm = await import('music-metadata');
    const m = await mm.parseFile(file, { skipPostHeaders: true });
    const pic = m.common.picture && m.common.picture[0];
    return {
      title: m.common.title || null,
      artist: m.common.artist || null,
      album: m.common.album || null,
      duration: m.format.duration || null,
      cover: pic ? `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}` : null,
    };
  } catch { return null; }
});

ipcMain.handle('fs:saveImage', async (_e, dataUrl, name) => {
  try {
    const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    const dir = path.join(app.getPath('pictures'), 'VLC Redesign');
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${String(name).replace(/[^\w .-]+/g, '_')}.png`);
    await fs.promises.writeFile(file, Buffer.from(m[1], 'base64'));
    return file;
  } catch { return null; }
});

ipcMain.handle('shell:show', (_e, p) => { if (typeof p === 'string') shell.showItemInFolder(p); });
ipcMain.handle('shell:external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
