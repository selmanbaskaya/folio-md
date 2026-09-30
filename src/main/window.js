import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unwatchAll } from './watcher.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Messages sent before the renderer has loaded are queued until `did-finish-load`.
const queuedMessages = new WeakMap();

export function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 560,
    minHeight: 360,
    title: app.name,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  const { webContents } = win;
  const webContentsId = webContents.id;
  queuedMessages.set(win, []);

  win.once('ready-to-show', () => win.show());
  webContents.on('will-navigate', (event) => event.preventDefault());
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('did-finish-load', () => {
    const queue = queuedMessages.get(win) ?? [];
    queuedMessages.delete(win);
    for (const [channel, args] of queue) webContents.send(channel, ...args);
  });
  win.on('closed', () => unwatchAll(webContentsId));

  win.loadFile(path.join(dirname, '../renderer/index.html'));
  return win;
}

export function sendToWindow(win, channel, ...args) {
  const queue = queuedMessages.get(win);
  if (queue) queue.push([channel, args]);
  else win.webContents.send(channel, ...args);
}

export function getTargetWindow() {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? createWindow();
}
