const { contextBridge, ipcRenderer, webUtils } = require('electron');

const base = (process.argv.find((a) => a.startsWith('--mg-media=')) || '').slice('--mg-media='.length);
const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('native', {
  win: (action, value) => ipcRenderer.invoke('win:action', action, value),
  onWinState: (cb) => ipcRenderer.on('win:state', (_e, s) => cb(s)),
  onOpenFiles: (cb) => ipcRenderer.on('open-files', (_e, files) => cb(files)),
  info: invoke('app:info'),
  pickFolder: invoke('dialog:folder'),
  pickFiles: invoke('dialog:files'),
  list: invoke('fs:list'),
  listSubs: invoke('fs:listSubs'),
  saveRecording: invoke('fs:saveRecording'),
  setProxy: invoke('net:setProxy'),
  config: invoke('app:config'),
  relaunch: invoke('app:relaunch'),
  logPath: invoke('app:logPath'),
  saveDialog: invoke('dialog:save'),
  checkUpdate: invoke('app:checkUpdate'),
  expand: invoke('fs:expand'),
  siblings: invoke('fs:siblings'),
  readText: invoke('fs:readText'),
  meta: invoke('fs:meta'),
  saveImage: invoke('fs:saveImage'),
  show: invoke('shell:show'),
  external: invoke('shell:external'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  engine: invoke('media:engine'),
  probe: invoke('media:probe'),
  thumb: invoke('media:thumb'),
  embeddedSubtitle: invoke('media:subtitle'),
  streamUrl: (p, o = {}) => `${base}/transcode/${encodeURIComponent(p)}?start=${o.start || 0}&mode=${o.mode || 'transcode'}${o.audio !== undefined && o.audio !== null ? `&audio=${o.audio}` : ''}&q=${o.quality || 'balanced'}`,
  mediaUrl: (p) => `${base}/file/${encodeURIComponent(p)}`,
});
