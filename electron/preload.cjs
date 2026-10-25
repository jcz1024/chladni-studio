const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  openAudio: () => ipcRenderer.invoke('files:open'),
  addDroppedFiles: (files) => ipcRenderer.invoke('files:add', Array.from(files, file => webUtils.getPathForFile(file)).filter(Boolean)),
  armCapture: () => ipcRenderer.invoke('capture:arm'),
  fullscreen: (value, coverTaskbar = false) => ipcRenderer.invoke('window:fullscreen', value, coverTaskbar),
  saveImage: (data) => ipcRenderer.invoke('image:save', data),
  onFullscreen: (callback) => ipcRenderer.on('fullscreen-changed', (_event, value, coversTaskbar) => callback(value, coversTaskbar))
});
