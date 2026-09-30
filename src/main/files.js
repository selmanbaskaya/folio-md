import fs from 'node:fs/promises';
import path from 'node:path';
import { fileKind } from '../shared/fileTypes.js';
import { highlightSource, renderMarkdown } from './markdown.js';
import { toAssetUrl } from './protocol.js';

const MAX_MARKDOWN_BYTES = 20 * 1024 * 1024;
const MAX_FOLDER_FILES = 2000;
const MAX_FOLDER_DEPTH = 6;
const IGNORED_DIRECTORIES = new Set(['node_modules']);

// Returns a plain object for IPC; failures are reported via `error` instead of throwing.
export async function loadDocument(requestedPath) {
  const name = path.basename(requestedPath);
  try {
    const kind = fileKind(requestedPath);
    if (!kind) throw new Error('Unsupported file type.');
    const filePath = await fs.realpath(requestedPath);
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Not a file.');

    const base = { path: filePath, name: path.basename(filePath), kind, mtimeMs: stat.mtimeMs };
    if (kind === 'image') return { ...base, url: toAssetUrl(filePath, stat.mtimeMs) };

    if (stat.size > MAX_MARKDOWN_BYTES) throw new Error('File is too large to preview.');
    const source = (await fs.readFile(filePath, 'utf8')).replace(/^\uFEFF/, '');
    return { ...base, source, html: renderMarkdown(source, filePath), sourceHtml: highlightSource(source) };
  } catch (error) {
    const message = error.code === 'ENOENT' ? 'File not found.' : error.code === 'EACCES' ? 'Permission denied.' : error.message;
    return { path: requestedPath, name, error: message };
  }
}

// Lists Markdown files below `root`; returns null when `root` is not a directory.
export async function scanFolder(root) {
  try {
    if (!(await fs.stat(root)).isDirectory()) return null;
  } catch {
    return null;
  }

  const files = [];
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length && files.length < MAX_FOLDER_FILES) {
    const { dir, depth } = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_FOLDER_DEPTH && !IGNORED_DIRECTORIES.has(entry.name)) queue.push({ dir: fullPath, depth: depth + 1 });
      } else if (entry.isFile() && fileKind(entry.name) === 'markdown') {
        files.push({ path: fullPath, name: entry.name, directory: path.relative(root, dir) });
      }
    }
  }

  files.sort((a, b) => a.directory.localeCompare(b.directory) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { root, name: path.basename(root), files, truncated: files.length >= MAX_FOLDER_FILES };
}
