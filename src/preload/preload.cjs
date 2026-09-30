// Sandboxed preload scripts must be CommonJS; everything else in the app is ESM.
const { contextBridge, ipcRenderer, webFrame, webUtils } = require('electron');

function subscribe(channel) {
  return (callback) => {
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('mdViewer', {
  openFileDialog: () => ipcRenderer.invoke('dialog:open-files'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('folder:scan', folderPath),
  loadFile: (filePath) => ipcRenderer.invoke('file:load', filePath),
  watchFile: (filePath) => ipcRenderer.send('file:watch', filePath),
  unwatchFile: (filePath) => ipcRenderer.send('file:unwatch', filePath),
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
  revealInFinder: (filePath) => ipcRenderer.send('shell:reveal', filePath),
  closeWindow: () => ipcRenderer.send('window:close'),
  setDocument: (info) => ipcRenderer.send('window:set-document', info),
  showTabContextMenu: (tabId) => ipcRenderer.send('tab:context-menu', tabId),
  zoomPage: (direction) => {
    const level = direction === 0 ? 0 : Math.min(Math.max(webFrame.getZoomLevel() + direction * 0.5, -3), 5);
    webFrame.setZoomLevel(level);
  },
  getTheme: () => ipcRenderer.invoke('theme:get'),
  showThemeMenu: (position) => ipcRenderer.send('theme:menu', position),
  onThemeChanged: subscribe('theme:changed'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onCommand: subscribe('command'),
  onOpenPaths: subscribe('open-paths'),
  onFileChanged: subscribe('file:changed'),
});
