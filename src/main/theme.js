import { app, BrowserWindow, Menu, nativeTheme } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// `nativeTheme.themeSource` drives `prefers-color-scheme` in the renderer as well as
// native menus, dialogs and window vibrancy, so the CSS needs no theme-specific classes.
const THEMES = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
}

export function initTheme() {
  const { theme } = readSettings();
  nativeTheme.themeSource = THEMES.some((t) => t.id === theme) ? theme : 'system';
}

export function getTheme() {
  return nativeTheme.themeSource;
}

export function setTheme(theme) {
  if (!THEMES.some((t) => t.id === theme)) return;
  nativeTheme.themeSource = theme;
  try {
    fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify({ ...readSettings(), theme }, null, 2));
  } catch {
    // The theme still applies for this session.
  }
  const menuItem = Menu.getApplicationMenu()?.getMenuItemById(`theme-${theme}`);
  if (menuItem) menuItem.checked = true;
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('theme:changed', theme);
}

export function themeMenuItems({ withIds = false } = {}) {
  return THEMES.map(({ id, label }) => ({
    ...(withIds && { id: `theme-${id}` }),
    label,
    type: 'radio',
    checked: getTheme() === id,
    click: () => setTheme(id),
  }));
}
