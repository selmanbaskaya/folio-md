import { baseName } from '../shared/fileTypes.js';
import { element } from './dom.js';
import { ImageViewer } from './imageViewer.js';

let nextTabId = 1;

// Each tab owns a DOM pane (kept alive while hidden) and references a shared document,
// so several tabs showing the same file load and watch it only once.
export class TabManager {
  #api;
  #tabbar;
  #content;
  #emptyState;
  #onChange;
  #onError;
  #documents = new Map(); // canonical path -> document
  #aliases = new Map(); // requested path -> canonical path
  #pending = new Map(); // requested path -> in-flight load
  #tabs = [];
  #activeId = null;

  constructor({ api, tabbar, content, emptyState, onChange, onError }) {
    this.#api = api;
    this.#tabbar = tabbar;
    this.#content = content;
    this.#emptyState = emptyState;
    this.#onChange = onChange;
    this.#onError = onError;

    tabbar.addEventListener('click', (event) => {
      const tabElement = event.target.closest('.tab');
      if (!tabElement) return;
      const id = Number(tabElement.dataset.tabId);
      if (event.target.closest('.tab-close')) this.close(id);
      else this.activate(id);
    });
    tabbar.addEventListener('auxclick', (event) => {
      const tabElement = event.target.closest('.tab');
      if (tabElement && event.button === 1) this.close(Number(tabElement.dataset.tabId));
    });
    tabbar.addEventListener('contextmenu', (event) => {
      const tabElement = event.target.closest('.tab');
      if (!tabElement) return;
      event.preventDefault();
      api.showTabContextMenu(Number(tabElement.dataset.tabId));
    });
  }

  get count() {
    return this.#tabs.length;
  }

  get activeTab() {
    return this.#tabs.find((tab) => tab.id === this.#activeId) ?? null;
  }

  get activeDocument() {
    const tab = this.activeTab;
    return tab ? this.#documents.get(tab.path) : null;
  }

  getTab(id) {
    return this.#tabs.find((tab) => tab.id === id) ?? null;
  }

  async open(filePath, { newTab = false } = {}) {
    if (!newTab) {
      const existing = this.#findTab(this.#aliases.get(filePath) ?? filePath);
      if (existing) return this.activate(existing.id);
    }
    const doc = await this.#ensureDocument(filePath);
    if (!doc) return null;
    if (!newTab) {
      const existing = this.#findTab(doc.path);
      if (existing) return this.activate(existing.id);
    }
    const tab = this.#createTab(doc, newTab ? this.#activeId : null);
    return this.activate(tab.id);
  }

  duplicate(tabId = this.#activeId) {
    const source = this.getTab(tabId);
    if (!source) return null;
    this.#saveScroll(source);
    const tab = this.#createTab(this.#documents.get(source.path), source.id);
    tab.scroll = { ...source.scroll };
    return this.activate(tab.id);
  }

  close(tabId = this.#activeId) {
    const index = this.#tabs.findIndex((tab) => tab.id === tabId);
    if (index === -1) return;
    const [tab] = this.#tabs.splice(index, 1);
    tab.pane.remove();
    this.#releaseDocument(tab.path);

    if (this.#activeId === tabId) {
      const next = this.#tabs[index] ?? this.#tabs[index - 1];
      this.#activeId = null;
      if (next) this.activate(next.id);
    }
    this.#refresh();
  }

  closeOthers(tabId = this.#activeId) {
    for (const tab of [...this.#tabs]) if (tab.id !== tabId) this.close(tab.id);
    this.activate(tabId);
  }

  activate(tabId) {
    const next = this.getTab(tabId);
    if (!next) return null;
    const previous = this.activeTab;
    if (previous && previous !== next) this.#saveScroll(previous);
    this.#activeId = tabId;
    for (const tab of this.#tabs) tab.pane.hidden = tab !== next;
    this.#restoreScroll(next);
    this.#refresh();
    this.#tabbar.querySelector('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return next;
  }

  selectIndex(index) {
    // macOS convention: Cmd+9 always selects the last tab.
    const tab = index >= 8 ? this.#tabs.at(-1) : this.#tabs[index];
    if (tab) this.activate(tab.id);
  }

  selectRelative(delta) {
    if (this.#tabs.length < 2) return;
    const index = this.#tabs.findIndex((tab) => tab.id === this.#activeId);
    const next = this.#tabs[(index + delta + this.#tabs.length) % this.#tabs.length];
    this.activate(next.id);
  }

  async reload(tabId = this.#activeId) {
    const tab = this.getTab(tabId);
    const doc = tab && this.#documents.get(tab.path);
    if (!doc) return;

    const result = await this.#api.loadFile(doc.path);
    if (result.error) {
      Object.assign(doc, { stale: true, deleted: true });
      this.#onError(result);
    } else {
      Object.assign(doc, result, { stale: false, deleted: false });
      const active = this.activeTab;
      if (active?.path === doc.path) this.#saveScroll(active);
      for (const other of this.#tabsFor(doc.path)) this.#renderContent(other, doc);
      if (active?.path === doc.path) this.#restoreScroll(active);
    }
    this.#refresh();
  }

  markChanged({ path, exists }) {
    const doc = this.#documents.get(path);
    if (!doc) return;
    Object.assign(doc, { stale: true, deleted: !exists });
    this.#refresh();
  }

  #findTab(path) {
    return this.#tabs.find((tab) => tab.path === path);
  }

  #tabsFor(path) {
    return this.#tabs.filter((tab) => tab.path === path);
  }

  async #ensureDocument(requestedPath) {
    const known = this.#documents.get(this.#aliases.get(requestedPath) ?? requestedPath);
    if (known) return known;

    if (!this.#pending.has(requestedPath)) {
      const load = this.#api.loadFile(requestedPath).finally(() => this.#pending.delete(requestedPath));
      this.#pending.set(requestedPath, load);
    }
    const result = await this.#pending.get(requestedPath);
    if (result.error) {
      this.#onError(result);
      return null;
    }

    this.#aliases.set(requestedPath, result.path);
    let doc = this.#documents.get(result.path);
    if (!doc) {
      doc = { ...result, stale: false, deleted: false };
      this.#documents.set(doc.path, doc);
      this.#api.watchFile(doc.path);
    }
    return doc;
  }

  #releaseDocument(path) {
    if (this.#findTab(path)) return;
    this.#documents.delete(path);
    this.#api.unwatchFile(path);
    for (const [alias, target] of this.#aliases) if (target === path) this.#aliases.delete(alias);
  }

  #createTab(doc, afterId) {
    const pane = element('section', `pane pane-${doc.kind}`);
    pane.hidden = true;
    const banner = element('div', 'banner');
    banner.hidden = true;
    const bannerText = element('span', 'banner-text');
    const bannerButton = element('button', 'banner-button', 'Reload');
    banner.append(bannerText, bannerButton);
    const body = element('div', 'pane-body');
    pane.append(banner, body);

    const tab = { id: nextTabId++, path: doc.path, pane, body, banner, bannerText, scroll: { preview: 0, source: 0 } };
    bannerButton.addEventListener('click', () => this.reload(tab.id));
    this.#renderContent(tab, doc);

    const afterIndex = this.#tabs.findIndex((t) => t.id === afterId);
    if (afterIndex === -1) this.#tabs.push(tab);
    else this.#tabs.splice(afterIndex + 1, 0, tab);
    this.#content.append(pane);
    return tab;
  }

  #renderContent(tab, doc) {
    if (doc.kind === 'image') {
      const viewer = new ImageViewer(doc.url, doc.name);
      tab.imageViewer = viewer;
      tab.previewScroll = viewer.scrollElement;
      tab.sourceScroll = null;
      tab.body.replaceChildren(viewer.element);
      return;
    }

    const preview = element('div', 'preview-scroll');
    const article = element('article', 'markdown-body');
    article.innerHTML = doc.html;
    preview.append(article);

    const source = element('div', 'source-scroll');
    const pre = element('pre', 'source hljs');
    const code = element('code');
    code.innerHTML = doc.sourceHtml;
    pre.append(code);
    source.append(pre);

    tab.previewScroll = preview;
    tab.sourceScroll = source;
    tab.body.replaceChildren(preview, source);
  }

  // Hidden panes are `display: none`, which drops scroll offsets, so they are kept manually.
  #saveScroll(tab) {
    tab.scroll.preview = tab.previewScroll?.scrollTop ?? 0;
    tab.scroll.source = tab.sourceScroll?.scrollTop ?? 0;
  }

  #restoreScroll(tab) {
    if (tab.previewScroll) tab.previewScroll.scrollTop = tab.scroll.preview;
    if (tab.sourceScroll) tab.sourceScroll.scrollTop = tab.scroll.source;
  }

  #refresh() {
    for (const tab of this.#tabs) {
      const doc = this.#documents.get(tab.path);
      tab.banner.hidden = !doc.stale;
      tab.bannerText.textContent = doc.deleted
        ? 'This file was moved or deleted.'
        : 'This file has changed on disk.';
    }
    this.#renderTabbar();
    this.#emptyState.hidden = this.#tabs.length > 0;
    this.#onChange();
  }

  #renderTabbar() {
    const pathsByName = new Map();
    for (const tab of this.#tabs) {
      const name = baseName(tab.path);
      pathsByName.set(name, (pathsByName.get(name) ?? new Set()).add(tab.path));
    }

    const elements = this.#tabs.map((tab) => {
      const doc = this.#documents.get(tab.path);
      const isActive = tab.id === this.#activeId;
      const node = element('div', `tab${isActive ? ' active' : ''}${doc.stale ? ' stale' : ''}`);
      node.dataset.tabId = tab.id;
      node.setAttribute('role', 'tab');
      node.setAttribute('aria-selected', String(isActive));
      node.title = tab.path;

      const close = element('button', 'tab-close', '×');
      close.setAttribute('aria-label', `Close ${doc.name}`);
      close.tabIndex = -1;
      const label = element('span', 'tab-label', doc.name);
      if (pathsByName.get(doc.name).size > 1) {
        const parent = tab.path.split('/').slice(-2, -1)[0];
        label.append(element('span', 'tab-hint', ` — ${parent}`));
      }
      node.append(close, element('span', `tab-icon tab-icon-${doc.kind}`), label, element('span', 'tab-dot'));
      return node;
    });
    this.#tabbar.replaceChildren(...elements);
    this.#tabbar.hidden = this.#tabs.length === 0;
  }
}
