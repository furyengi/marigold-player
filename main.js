const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, session, net } = require('electron');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const engine = require('./engine');
const updater = require('./updater');

const VIDEO_EXT = new Set(['mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'ogv', 'ts', 'mpg', 'mpeg', 'wmv', 'flv', '3gp', 'vob', 'm2ts', 'mts', 'divx', 'rm', 'rmvb', 'asf', 'f4v', 'ogm', 'm2v', 'mxf', 'wtv', 'mpe', 'dv', 'qt', 'xvid']);
const AUDIO_EXT = new Set(['mp3', 'flac', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'wma', 'aif', 'aiff', 'mka', 'ac3', 'eac3', 'dts', 'ape', 'wv', 'amr', 'mpc', 'caf', 'au', 'm4b', 'tta']);
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


// ---------------------------------------------------------------- local media server
// Media is served over HTTP on 127.0.0.1 so Chromium's own network stack handles byte ranges, which video
// containers with an index at the end (many MP4s) need. A random token in the path keeps other programs out.

let mediaBase = '';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
};

function startMediaServer() {
  const token = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const done = (code, msg) => { res.writeHead(code, { ...CORS, 'Content-Type': 'text/plain' }); res.end(msg || ''); };
      let u;
      try { u = new URL(req.url, 'http://local'); } catch { return done(400); }
      const port = server.address().port;
      if (req.headers.host !== `127.0.0.1:${port}`) return done(403, 'Forbidden');
      const parts = u.pathname.split('/');
      if (parts[1] !== token) return done(403, 'Forbidden');
      if (req.method === 'OPTIONS') { res.writeHead(204, { ...CORS, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' }); return res.end(); }
      if (req.method !== 'GET' && req.method !== 'HEAD') return done(405);
      let file;
      try { file = decodeURIComponent(parts.slice(3).join('/')); } catch { return done(400); }
      if (parts[2] === 'transcode') {
        if (!kindOf(file)) return done(403, 'Forbidden');
        return engine.serveStream(req, res, file, u.searchParams, CORS);
      }
      if (parts[2] !== 'file') return done(404);
      const ext = path.extname(file).slice(1).toLowerCase();
      if (!MIME[ext] && !kindOf(file) && !SUB_EXT.has(ext)) return done(403, 'Forbidden');
      fs.promises.stat(file).then((st) => {
        const base = { ...CORS, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        let start = 0;
        let end = st.size - 1;
        let status = 200;
        if (m && (m[1] || m[2])) {
          if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), end); }
          else start = Math.max(0, st.size - Number(m[2]));
          if (start > end || start >= st.size) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${st.size}` }); return res.end(); }
          status = 206;
        }
        const headers = { ...base, 'Content-Length': String(st.size === 0 ? 0 : end - start + 1) };
        if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
        res.writeHead(status, headers);
        if (req.method === 'HEAD' || st.size === 0) return res.end();
        const rs = fs.createReadStream(file, { start, end });
        rs.on('error', () => res.destroy());
        res.on('close', () => rs.destroy());
        rs.pipe(res);
      }).catch(() => done(404, 'Not found'));
    });
    server.listen(0, '127.0.0.1', () => { mediaBase = `http://127.0.0.1:${server.address().port}/${token}`; resolve(); });
  });
}

let win = null;

const configFile = () => path.join(app.getPath('userData'), 'config.json');
let config = { hwAccel: true, devMode: false, saveLog: false, logLevel: 'errors', logFile: '' };
try { config = { ...config, ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) }; } catch {}
if (config.hwAccel === false) app.disableHardwareAcceleration();

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
    title: 'Marigold Player',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: [`--mg-media=${mediaBase}`],
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
  win.webContents.on('before-input-event', (e, input) => {
    if (!config.devMode || input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) { win.webContents.toggleDevTools(); e.preventDefault(); }
    else if (input.control && input.key.toLowerCase() === 'r') { win.webContents.reload(); e.preventDefault(); }
  });
  win.webContents.on('console-message', (e) => writeLog(e.level, e.message, e.sourceId, e.lineNumber));
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });

  win.webContents.once('did-finish-load', () => {
    if (pendingOpen.length) { win.webContents.send('open-files', pendingOpen); pendingOpen = []; }
    if (!app.isPackaged && process.env.MGP_TEST) require(path.resolve(process.env.MGP_TEST))(win);
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

  app.whenReady().then(async () => {
    pendingOpen.push(...mediaFromArgs(process.argv.slice(app.isPackaged ? 1 : 2)));

    await startMediaServer();
    updater.init(() => win);
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

const LEVELS = { debug: 0, info: 1, warning: 2, error: 3 };
function writeLog(level, message, source, line) {
  if (!config.saveLog) return;
  const min = config.logLevel === 'all' ? 0 : config.logLevel === 'warnings' ? 2 : 3;
  if ((LEVELS[level] ?? 1) < min) return;
  const file = config.logFile || path.join(app.getPath('userData'), 'marigold.log');
  try { fs.appendFileSync(file, `${new Date().toISOString()} [${level}] ${message} (${path.basename(String(source))}:${line})
`); } catch {}
}

// ---------------------------------------------------------------- IPC

ipcMain.handle('win:action', (_e, action, value) => {
  if (!win) return;
  switch (action) {
    case 'minimize': win.minimize(); break;
    case 'maximize': win.isMaximized() ? win.unmaximize() : win.maximize(); break;
    case 'close': win.close(); break;
    case 'fullscreen': win.setFullScreen(value === undefined ? !win.isFullScreen() : !!value); break;
    case 'title': win.setTitle(String(value || 'Marigold Player')); break;
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

ipcMain.handle('fs:list', async (_e, dir, showHidden = false) => {
  try {
    const names = await fs.promises.readdir(dir);
    const entries = names.filter((n) => (showHidden || !n.startsWith('.')) && n !== '$RECYCLE.BIN' && n !== 'System Volume Information').map((n) => entryFor(dir, n)).filter(Boolean);
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

ipcMain.handle('fs:meta', async (_e, file, chaptersOnly = false) => {
  const kind = kindOf(file);
  if (!kind || (kind === 'video' && !chaptersOnly)) return null;
  try {
    const mm = await import('music-metadata');
    const m = await mm.parseFile(file, { skipPostHeaders: true });
    const pic = m.common.picture && m.common.picture[0];
    const chapters = (m.format.chapters || []).map((c) => ({ title: c.title || '', start: (c.start || 0) / (c.timeScale ? c.timeScale : 1000) })).filter((c) => Number.isFinite(c.start));
    return {
      title: m.common.title || null,
      artist: m.common.artist || null,
      album: m.common.album || null,
      duration: m.format.duration || null,
      chapters,
      cover: kind === 'audio' && pic ? `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}` : null,
    };
  } catch { return null; }
});

ipcMain.handle('fs:saveImage', async (_e, dataUrl, name) => {
  try {
    const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    const dir = path.join(app.getPath('pictures'), 'Marigold Player');
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${String(name).replace(/[^\w .-]+/g, '_')}.png`);
    await fs.promises.writeFile(file, Buffer.from(m[1], 'base64'));
    return file;
  } catch { return null; }
});

ipcMain.handle('shell:show', (_e, p) => { if (typeof p === 'string') shell.showItemInFolder(p); });
ipcMain.handle('shell:external', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

// ---------------------------------------------------------------- compatibility engine

app.on('before-quit', () => engine.killAll());
ipcMain.handle('media:engine', () => engine.available());
ipcMain.handle('media:probe', async (_e, file) => (kindOf(file) ? engine.probe(file) : null));
ipcMain.handle('media:thumb', async (_e, file, t) => (kindOf(file) ? engine.thumbnail(file, t) : null));
ipcMain.handle('media:subtitle', async (_e, file, index) => (kindOf(file) ? engine.subtitleText(file, Number(index)) : null));

// ---------------------------------------------------------------- more IPC

ipcMain.handle('fs:listSubs', async (_e, dir) => {
  try {
    const names = await fs.promises.readdir(dir);
    return names.filter((n) => SUB_EXT.has(path.extname(n).slice(1).toLowerCase())).map((n) => path.join(dir, n));
  } catch { return []; }
});

ipcMain.handle('fs:saveRecording', async (_e, buffer, name, dir) => {
  try {
    const target = dir && dir.trim() ? dir : path.join(app.getPath('videos'), 'Marigold Recordings');
    await fs.promises.mkdir(target, { recursive: true });
    const file = path.join(target, String(name).replace(/[^\w .()-]+/g, '_'));
    await fs.promises.writeFile(file, Buffer.from(buffer));
    return file;
  } catch { return null; }
});

ipcMain.handle('net:setProxy', async (_e, mode, url) => {
  const cfg = mode === 'direct' ? { mode: 'direct' } : mode === 'custom' && url ? { mode: 'fixed_servers', proxyRules: String(url) } : { mode: 'system' };
  try { await session.defaultSession.setProxy(cfg); return true; } catch { return false; }
});

ipcMain.handle('app:config', (_e, patch) => {
  if (patch) {
    config = { ...config, ...patch };
    try { fs.writeFileSync(configFile(), JSON.stringify(config)); } catch {}
  }
  return config;
});
ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('app:logPath', () => config.logFile || path.join(app.getPath('userData'), 'marigold.log'));
ipcMain.handle('dialog:save', async (_e, defaultPath) => {
  const r = await dialog.showSaveDialog(win, { defaultPath, filters: [{ name: 'Log', extensions: ['log', 'txt'] }] });
  return r.canceled ? null : r.filePath;
});

