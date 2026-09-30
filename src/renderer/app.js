import { baseName, fileKind } from '../shared/fileTypes.js';
import { Sidebar } from './sidebar.js';
import { ltr } from './dom.js';
import { ImageViewer } from './imageViewer.js';
import { TabManager } from './tabs.js';

const api = window.mdViewer;
const $ = (id) => document.getElementById(id);

const content = $('content');
const dropOverlay = $('drop-overlay');
const viewButtons = [...document.querySelectorAll('[data-view]')];

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  $('toasts').append(toast);
  setTimeout(() => toast.remove(), 5000);
}

const tabs = new TabManager({
  api,
  tabbar: $('tabbar'),
  content,
  emptyState: $('empty-state'),
  onChange: updateChrome,
  onError: ({ name, error }) => showToast(`Couldn’t open “${name}”: ${error}`),
});

const sidebar = new Sidebar({
  element: $('sidebar'),
  list: $('file-list'),
  title: $('sidebar-title'),
  onOpen: (filePath, options) => tabs.open(filePath, options),
});

let viewMode = localStorage.getItem('viewMode') === 'split' ? 'split' : 'preview';

async function openPaths(paths) {
  const unsupported = [];
  for (const filePath of paths) {
    if (fileKind(filePath)) {
      await tabs.open(filePath);
      continue;
    }
    const folder = await api.scanFolder(filePath);
    if (folder) sidebar.show(folder);
    else unsupported.push(baseName(filePath));
  }
  if (unsupported.length) {
    showToast(`Can’t open ${unsupported.join(', ')}. Only Markdown (.md, .markdown) and PNG files are supported.`);
  }
}

async function openFileDialog() {
  await openPaths(await api.openFileDialog());
}

async function openFolderDialog() {
  const folder = await api.openFolderDialog();
  if (folder) sidebar.show(folder);
}

async function reload() {
  await tabs.reload();
  if (sidebar.folder) {
    const folder = await api.scanFolder(sidebar.folder.root);
    if (folder) sidebar.update(folder);
  }
}

function setViewMode(mode) {
  viewMode = mode;
  localStorage.setItem('viewMode', mode);
  content.classList.toggle('split', mode === 'split');
  for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === mode));
}

function updateChrome() {
  const doc = tabs.activeDocument;
  $('toolbar-title').textContent = doc?.name ?? '';
  $('status-path').textContent = doc ? ltr(doc.path) : '';
  $('statusbar').hidden = !doc;
  $('btn-reload').disabled = !doc;
  for (const button of viewButtons) button.disabled = doc?.kind !== 'markdown';
  document.title = doc?.name ?? 'Markdown Viewer';
  api.setDocument({ title: doc?.name, path: doc?.path });
  sidebar.setActive(doc?.path);
}

const tabActions = {
  duplicate: (tabId) => tabs.duplicate(tabId),
  reveal: (tabId) => api.revealInFinder(tabs.getTab(tabId)?.path),
  close: (tabId) => tabs.close(tabId),
  'close-others': (tabId) => tabs.closeOthers(tabId),
};

const commands = {
  'open-file': openFileDialog,
  'open-folder': openFolderDialog,
  reload,
  'close-tab': () => (tabs.count ? tabs.close() : api.closeWindow()),
  'duplicate-tab': () => tabs.duplicate(),
  'next-tab': () => tabs.selectRelative(1),
  'prev-tab': () => tabs.selectRelative(-1),
  'select-tab': (index) => tabs.selectIndex(index),
  'toggle-source': () => setViewMode(viewMode === 'split' ? 'preview' : 'split'),
  'toggle-sidebar': () => sidebar.toggle(),
  'zoom-in': () => zoom(1),
  'zoom-out': () => zoom(-1),
  'zoom-reset': () => zoom(0),
  'tab-action': ({ action, tabId }) => tabActions[action]?.(tabId),
};

function showTheme(theme) {
  const button = $('btn-theme');
  button.dataset.theme = theme;
  button.title = `Appearance: ${theme.charAt(0).toUpperCase()}${theme.slice(1)}`;
}

api.onCommand((name, arg) => commands[name]?.(arg));
api.onThemeChanged(showTheme);
api.getTheme().then(showTheme);
api.onOpenPaths(openPaths);
api.onFileChanged((change) => tabs.markChanged(change));

// Toolbar
$('btn-sidebar').addEventListener('click', commands['toggle-sidebar']);
$('btn-open').addEventListener('click', openFileDialog);
$('btn-empty-open').addEventListener('click', openFileDialog);
$('btn-folder').addEventListener('click', openFolderDialog);
$('btn-reload').addEventListener('click', reload);
for (const button of viewButtons) button.addEventListener('click', () => setViewMode(button.dataset.view));
$('btn-theme').addEventListener('click', (event) => {
  const { left, bottom } = event.currentTarget.getBoundingClientRect();
  api.showThemeMenu({ x: left, y: bottom + 4 });
});
$('status-path').addEventListener('click', () => api.revealInFinder(tabs.activeDocument?.path));

// Lightbox for images inside rendered documents
const lightbox = $('lightbox');
let lightboxViewer = null;

function openLightbox(image) {
  lightboxViewer = new ImageViewer(image.currentSrc || image.src, image.alt);
  lightbox.querySelector('.image-viewer')?.remove();
  lightbox.prepend(lightboxViewer.element);
  lightbox.hidden = false;
}

function closeLightbox() {
  lightbox.hidden = true;
  lightbox.querySelector('.image-viewer')?.remove();
  lightboxViewer = null;
}

$('lightbox-close').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (event) => {
  const onBackdrop = event.target.matches('.zoom-stage, .zoom-canvas');
  if (onBackdrop && !lightboxViewer?.element.classList.contains('pannable')) closeLightbox();
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && lightboxViewer) closeLightbox();
});

function activeImageViewer() {
  return lightboxViewer ?? tabs.activeTab?.imageViewer ?? null;
}

function zoom(direction) {
  const viewer = activeImageViewer();
  if (!viewer) api.zoomPage(direction);
  else if (direction > 0) viewer.zoomIn();
  else if (direction < 0) viewer.zoomOut();
  else viewer.actualSize();
}

// Links and images inside rendered documents
content.addEventListener('click', (event) => {
  const image = event.target.closest('.markdown-body img');
  if (image && !image.closest('a')) {
    openLightbox(image);
    return;
  }

  const link = event.target.closest('a[href]');
  if (!link) return;
  event.preventDefault();
  const href = link.getAttribute('href');

  if (href.startsWith('#')) {
    const id = decodeURIComponent(href.slice(1));
    tabs.activeTab?.pane.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth' });
  } else if (link.dataset.localPath) {
    const { localPath } = link.dataset;
    if (fileKind(localPath)) tabs.open(localPath, { newTab: event.metaKey });
    else api.revealInFinder(localPath);
  } else {
    api.openExternal(link.href);
  }
});

// Images that fail to load (e.g. offline remote images) are replaced by a placeholder.
content.addEventListener(
  'error',
  (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.closest('.markdown-body')) return;
    const placeholder = document.createElement('span');
    placeholder.className = 'missing-image';
    placeholder.textContent = `Image failed to load: ${image.alt || image.getAttribute('src')}`;
    image.replaceWith(placeholder);
  },
  true,
);

// Drag & drop
let dragDepth = 0;
const hasFiles = (event) => event.dataTransfer?.types.includes('Files');

window.addEventListener('dragenter', (event) => {
  if (!hasFiles(event)) return;
  dragDepth += 1;
  dropOverlay.hidden = false;
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
});
window.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = hasFiles(event) ? 'copy' : 'none';
});
window.addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  const paths = [...(event.dataTransfer?.files ?? [])].map((file) => api.getPathForFile(file)).filter(Boolean);
  openPaths(paths);
});

setViewMode(viewMode);
updateChrome();
