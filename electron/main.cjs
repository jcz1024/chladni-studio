const { app, BrowserWindow, ipcMain, dialog, session, protocol, desktopCapturer, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { MediaLibrary } = require('./media.cjs');

if (process.env.CHLADNI_USER_DATA) app.setPath('userData', process.env.CHLADNI_USER_DATA);
app.setName('Chladni Studio');
protocol.registerSchemesAsPrivileged([{ scheme: 'chladni-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }]);
const library = new MediaLibrary();
const entry = path.join(__dirname, '../src/index.html');
let window;
let coversTaskbar = false;
let previousAlwaysOnTop = false;
let captureArmedUntil = 0;
const isTrusted = (sender) => window && sender === window.webContents && sender.getURL().split('?')[0] === pathToFileURL(entry).href;

function handle(name, fn) {
  ipcMain.handle(name, (event, ...args) => {
    if (!isTrusted(event.sender) || event.senderFrame !== window.webContents.mainFrame) throw new Error('Untrusted caller');
    return fn(...args);
  });
}

function releaseTaskbarCover() {
  if (!coversTaskbar) return;
  coversTaskbar = false;
  window.setAlwaysOnTop(previousAlwaysOnTop);
}

function publishFullscreen() {
  const fullscreen = window.isFullScreen();
  if (!fullscreen) releaseTaskbarCover();
  window.webContents.send('fullscreen-changed', fullscreen, fullscreen && coversTaskbar);
}

function setFullscreen(value, coverTaskbar = false) {
  const enabled = !!value, cover = enabled && coverTaskbar === true;
  if (cover && !coversTaskbar) previousAlwaysOnTop = window.isAlwaysOnTop();
  if (!cover) releaseTaskbarCover();
  coversTaskbar = cover;
  window.setFullScreen(enabled);
  if (enabled) {
    window.focus();
    if (coversTaskbar) window.setAlwaysOnTop(true, 'pop-up-menu');
  }
  publishFullscreen();
  return enabled;
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 1060, minHeight: 720,
    backgroundColor: '#101113', title: 'Chladni Studio · 克拉尼之盘',
    icon: path.join(__dirname, '../assets/icon.ico'),
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#101113', symbolColor: '#9b9c9f', height: 36 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== pathToFileURL(entry).href) event.preventDefault(); });
  window.on('enter-full-screen', publishFullscreen);
  window.on('leave-full-screen', publishFullscreen);
  window.on('focus', () => { if (coversTaskbar && window.isFullScreen()) window.setAlwaysOnTop(true, 'pop-up-menu'); });
  window.on('blur', () => { if (coversTaskbar) window.setAlwaysOnTop(previousAlwaysOnTop); });
  window.loadFile(entry);
}

app.whenReady().then(() => {
  protocol.handle('chladni-media', (request) => library.respond(request));
  session.defaultSession.setPermissionRequestHandler((sender, permission, callback) => callback(!!isTrusted(sender) && ['display-capture', 'fullscreen'].includes(permission)));
  session.defaultSession.setPermissionCheckHandler((sender, permission) => !!isTrusted(sender) && ['display-capture', 'fullscreen'].includes(permission));
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!window || request.frame !== window.webContents.mainFrame || Date.now() > captureArmedUntil) return callback(null);
    captureArmedUntil = 0;
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!sources.length) return callback(null);
      callback({ video: sources[0], audio: 'loopback' });
    } catch { callback(null); }
  });
  handle('capture:arm', () => { captureArmedUntil = Date.now() + 10000; return true; });
  handle('files:open', async () => {
    const result = await dialog.showOpenDialog(window, { title: '导入音乐', properties: ['openFile', 'multiSelections'], filters: [{ name: '音频文件', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'webm'] }] });
    return result.canceled ? [] : library.add(result.filePaths);
  });
  handle('files:add', (paths) => library.add(Array.isArray(paths) ? paths.filter(p => typeof p === 'string') : []));
  handle('window:fullscreen', setFullscreen);
  handle('image:save', async (dataURL) => {
    if (typeof dataURL !== 'string' || !dataURL.startsWith('data:image/png;base64,') || dataURL.length > 35e6) throw new Error('Invalid image');
    const result = await dialog.showSaveDialog(window, { title: '保存砂纹', defaultPath: `Chladni-${new Date().toISOString().replace(/[:.]/g, '-')}.png`, filters: [{ name: 'PNG 图片', extensions: ['png'] }] });
    if (result.canceled) return false;
    await fs.promises.writeFile(result.filePath, Buffer.from(dataURL.slice(22), 'base64'));
    return true;
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
