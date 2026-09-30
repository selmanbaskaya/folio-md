import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { IMAGE_EXTENSIONS, MARKDOWN_EXTENSIONS } from '../shared/fileTypes.js';
import { loadDocument, scanFolder } from './files.js';
import { getTheme, themeMenuItems } from './theme.js';
import { unwatchFile, watchFile } from './watcher.js';

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

const isString = (value) => typeof value === 'string' && value.length > 0;
const windowFor = (event) => BrowserWindow.fromWebContents(event.sender);

export function registerIpc() {
  ipcMain.handle('dialog:open-files', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(windowFor(event), {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Markdown & Images', extensions: [...MARKDOWN_EXTENSIONS, ...IMAGE_EXTENSIONS] },
        { name: 'Markdown', extensions: MARKDOWN_EXTENSIONS },
        { name: 'PNG Images', extensions: IMAGE_EXTENSIONS },
      ],
    });
    return canceled ? [] : filePaths;
  });

  ipcMain.handle('dialog:open-folder', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(windowFor(event), {
      properties: ['openDirectory'],
    });
    return canceled ? null : scanFolder(filePaths[0]);
  });

  ipcMain.handle('folder:scan', (_event, folderPath) => (isString(folderPath) ? scanFolder(folderPath) : null));

  ipcMain.handle('file:load', async (_event, filePath) => {
    if (!isString(filePath)) return { path: String(filePath), name: '', error: 'Invalid path.' };
    const result = await loadDocument(filePath);
    if (!result.error) app.addRecentDocument(result.path);
    return result;
  });

  ipcMain.on('file:watch', (event, filePath) => {
    if (isString(filePath)) watchFile(event.sender, filePath);
  });
  ipcMain.on('file:unwatch', (event, filePath) => {
    if (isString(filePath)) unwatchFile(event.sender.id, filePath);
  });

  ipcMain.on('shell:open-external', (_event, url) => {
    try {
      if (EXTERNAL_PROTOCOLS.has(new URL(url).protocol)) shell.openExternal(url);
    } catch {
      // Ignore malformed URLs.
    }
  });
  ipcMain.on('shell:reveal', (_event, filePath) => {
    if (isString(filePath)) shell.showItemInFolder(filePath);
  });

  ipcMain.on('window:close', (event) => windowFor(event)?.close());
  ipcMain.on('window:set-document', (event, { title, path } = {}) => {
    const win = windowFor(event);
    if (!win) return;
    win.setTitle(isString(title) ? title : app.name);
    win.setRepresentedFilename(isString(path) ? path : '');
  });

  ipcMain.handle('theme:get', () => getTheme());
  ipcMain.on('theme:menu', (event, { x, y } = {}) => {
    Menu.buildFromTemplate(themeMenuItems()).popup({ window: windowFor(event), x: Math.round(x), y: Math.round(y) });
  });

  ipcMain.on('tab:context-menu', (event, tabId) => {
    const send = (action) => () => event.sender.send('command', 'tab-action', { action, tabId });
    Menu.buildFromTemplate([
      { label: 'Open in New Tab', click: send('duplicate') },
      { label: 'Reveal in Finder', click: send('reveal') },
      { type: 'separator' },
      { label: 'Close Tab', click: send('close') },
      { label: 'Close Other Tabs', click: send('close-others') },
    ]).popup({ window: windowFor(event) });
  });
}
