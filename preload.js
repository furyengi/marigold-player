const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('vlc', {
  win: (action, value) => ipcRenderer.invoke('win:action', action, value),
  onWinState: (cb) => ipcRenderer.on('win:state', (_e, s) => cb(s)),
  onOpenFiles: (cb) => ipcRenderer.on('open-files', (_e, files) => cb(files)),
  info: invoke('app:info'),
  pickFolder: invoke('dialog:folder'),
  pickFiles: invoke('dialog:files'),
  list: invoke('fs:list'),
  expand: invoke('fs:expand'),
  siblings: invoke('fs:siblings'),
  readText: invoke('fs:readText'),
  meta: invoke('fs:meta'),
  saveImage: invoke('fs:saveImage'),
  show: invoke('shell:show'),
  external: invoke('shell:external'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  mediaUrl: (p) => 'vlcmedia://local/' + encodeURIComponent(p),
});
