import { app, BrowserWindow, Menu } from 'electron';
import { themeMenuItems } from './theme.js';
import { createWindow, getTargetWindow, sendToWindow } from './window.js';

function command(name, arg) {
  return () => {
    const win = getTargetWindow();
    win.show();
    sendToWindow(win, 'command', name, arg);
  };
}

function hiddenShortcut(accelerator, click) {
  return { label: accelerator, accelerator, click, visible: false, acceleratorWorksWhenHidden: true };
}

export function buildMenu() {
  const separator = { type: 'separator' };
  const template = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'New Window', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: command('open-file') },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: command('open-folder') },
        { role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] },
        separator,
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: command('reload') },
        { label: 'Open in New Tab', accelerator: 'CmdOrCtrl+Shift+T', click: command('duplicate-tab') },
        separator,
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: command('close-tab') },
        { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', click: () => BrowserWindow.getFocusedWindow()?.close() },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'Ctrl+Cmd+S', click: command('toggle-sidebar') },
        { label: 'Toggle Source', accelerator: 'Alt+Cmd+U', click: command('toggle-source') },
        separator,
        { label: 'Appearance', submenu: themeMenuItems({ withIds: true }) },
        separator,
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: command('zoom-reset') },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', click: command('zoom-in') },
        hiddenShortcut('CmdOrCtrl+=', command('zoom-in')),
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: command('zoom-out') },
        separator,
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [separator, { role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Window',
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        separator,
        { label: 'Show Next Tab', accelerator: 'Cmd+Shift+]', click: command('next-tab') },
        { label: 'Show Previous Tab', accelerator: 'Cmd+Shift+[', click: command('prev-tab') },
        hiddenShortcut('Ctrl+Tab', command('next-tab')),
        hiddenShortcut('Ctrl+Shift+Tab', command('prev-tab')),
        ...Array.from({ length: 9 }, (_, i) => hiddenShortcut(`Cmd+${i + 1}`, command('select-tab', i))),
        separator,
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
