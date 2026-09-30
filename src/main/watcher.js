import fs from 'node:fs';

// Stat polling survives the atomic "write temp file + rename" saves most editors use,
// which break inode-based `fs.watch` watchers.
const POLL_INTERVAL_MS = 1000;

const watchers = new Map(); // filePath -> { listener, subscribers: Map<webContentsId, WebContents> }

export function watchFile(webContents, filePath) {
  let watcher = watchers.get(filePath);
  if (!watcher) {
    const subscribers = new Map();
    const listener = (current, previous) => {
      if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) return;
      const payload = { path: filePath, exists: current.mtimeMs !== 0 };
      for (const [id, contents] of subscribers) {
        if (contents.isDestroyed()) subscribers.delete(id);
        else contents.send('file:changed', payload);
      }
    };
    fs.watchFile(filePath, { interval: POLL_INTERVAL_MS }, listener);
    watcher = { listener, subscribers };
    watchers.set(filePath, watcher);
  }
  watcher.subscribers.set(webContents.id, webContents);
}

export function unwatchFile(webContentsId, filePath) {
  const watcher = watchers.get(filePath);
  if (!watcher) return;
  watcher.subscribers.delete(webContentsId);
  if (watcher.subscribers.size === 0) {
    fs.unwatchFile(filePath, watcher.listener);
    watchers.delete(filePath);
  }
}

export function unwatchAll(webContentsId) {
  for (const filePath of [...watchers.keys()]) unwatchFile(webContentsId, filePath);
}
