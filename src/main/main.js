import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { loadAppIcon } from './appIcon.js';
import { registerIpc } from './ipc.js';
import { buildMenu } from './menu.js';
import { handleAssetProtocol, registerAssetScheme } from './protocol.js';
import { initTheme } from './theme.js';
import { createWindow, getTargetWindow, sendToWindow } from './window.js';

app.setName('Markdown Viewer');
registerAssetScheme();

function pathsFromArgv(argv) {
  return argv
    .slice(app.isPackaged ? 1 : 2)
    .filter((arg) => !arg.startsWith('-'))
    .map((arg) => path.resolve(process.cwd(), arg))
    .filter((filePath) => fs.existsSync(filePath));
}

function openPaths(paths) {
  if (!paths.length) return;
  const win = getTargetWindow();
  win.show();
  sendToWindow(win, 'open-paths', paths);
}

// Finder "Open With", Dock icon drops and File > Open Recent all arrive here, possibly before `ready`.
const pendingPaths = pathsFromArgv(process.argv);
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) openPaths([filePath]);
  else pendingPaths.push(filePath);
});

app.whenReady().then(() => {
  const icon = loadAppIcon();
  if (icon) app.dock?.setIcon(icon);
  initTheme();
  handleAssetProtocol();
  registerIpc();
  buildMenu();
  const win = createWindow();
  if (pendingPaths.length) sendToWindow(win, 'open-paths', pendingPaths.splice(0));
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
