import { element, ltr } from './dom.js';

export class Sidebar {
  #element;
  #list;
  #title;
  #folder = null;
  #activePath = null;

  constructor({ element: root, list, title, onOpen }) {
    this.#element = root;
    this.#list = list;
    this.#title = title;
    list.addEventListener('click', (event) => {
      const item = event.target.closest('[data-path]');
      if (item) onOpen(item.dataset.path, { newTab: event.metaKey });
    });
  }

  get visible() {
    return !this.#element.hidden;
  }

  get folder() {
    return this.#folder;
  }

  show(folder) {
    this.#folder = folder;
    this.#render();
    this.#element.hidden = false;
  }

  toggle() {
    this.#element.hidden = !this.#element.hidden;
    if (this.visible) this.#render();
  }

  update(folder) {
    this.#folder = folder;
    this.#render();
  }

  setActive(path) {
    this.#activePath = path ?? null;
    for (const item of this.#list.querySelectorAll('[data-path]')) {
      item.classList.toggle('active', item.dataset.path === this.#activePath);
    }
  }

  #render() {
    this.#title.textContent = this.#folder?.name ?? 'No Folder';
    this.#title.title = this.#folder?.root ?? '';

    if (!this.#folder) {
      this.#list.replaceChildren(element('li', 'sidebar-empty', 'Open a folder (⇧⌘O) to browse its Markdown files.'));
      return;
    }
    if (!this.#folder.files.length) {
      this.#list.replaceChildren(element('li', 'sidebar-empty', 'No Markdown files in this folder.'));
      return;
    }

    const items = [];
    let currentDirectory = '';
    for (const file of this.#folder.files) {
      if (file.directory !== currentDirectory) {
        currentDirectory = file.directory;
        items.push(element('li', 'sidebar-group', ltr(currentDirectory)));
      }
      const item = element('li', 'sidebar-item', file.name);
      item.dataset.path = file.path;
      item.title = file.path;
      item.classList.toggle('active', file.path === this.#activePath);
      items.push(item);
    }
    if (this.#folder.truncated) items.push(element('li', 'sidebar-empty', 'Showing the first 2000 files.'));
    this.#list.replaceChildren(...items);
  }
}
