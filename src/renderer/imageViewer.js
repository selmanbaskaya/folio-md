import { element } from './dom.js';

const MIN_SCALE = 0.05;
const MAX_SCALE = 16;
const STEP = 1.25;
const PADDING = 24;

// Zoomable, pannable image. `scale === null` means "fit to window", which is re-evaluated on resize.
export class ImageViewer {
  #stage;
  #canvas;
  #image;
  #label;
  #scale = null;
  #drag = null;

  constructor(src, alt = '') {
    this.#image = element('img', 'zoom-image');
    this.#image.alt = alt;
    this.#image.draggable = false;
    this.#image.addEventListener('load', () => this.#layout());
    this.#image.src = src;

    this.#canvas = element('div', 'zoom-canvas');
    this.#canvas.append(this.#image);
    this.#stage = element('div', 'zoom-stage');
    this.#stage.append(this.#canvas);

    this.#label = element('button', 'zoom-label', 'Fit');
    this.#label.title = 'Zoom to Fit';
    const button = (text, title, onClick) => {
      const node = element('button', 'zoom-button', text);
      node.title = title;
      node.addEventListener('click', onClick);
      return node;
    };
    const controls = element('div', 'zoom-controls');
    controls.append(
      button('−', 'Zoom Out (⌘−)', () => this.zoomOut()),
      this.#label,
      button('+', 'Zoom In (⌘+)', () => this.zoomIn()),
      button('1:1', 'Actual Size (⌘0)', () => this.actualSize()),
    );
    this.#label.addEventListener('click', () => this.fit());

    this.element = element('div', 'image-viewer');
    this.element.append(this.#stage, controls);

    this.#stage.addEventListener('wheel', (event) => this.#onWheel(event), { passive: false });
    this.#stage.addEventListener('dblclick', (event) => this.#onDoubleClick(event));
    this.#stage.addEventListener('pointerdown', (event) => this.#onPointerDown(event));
    this.#stage.addEventListener('pointermove', (event) => this.#onPointerMove(event));
    this.#stage.addEventListener('pointerup', () => this.#endDrag());
    this.#stage.addEventListener('pointercancel', () => this.#endDrag());
    new ResizeObserver(() => this.#scale === null && this.#layout()).observe(this.#stage);
  }

  get scrollElement() {
    return this.#stage;
  }

  zoomIn(anchor) {
    this.#setScale(this.#currentScale() * STEP, anchor);
  }

  zoomOut(anchor) {
    this.#setScale(this.#currentScale() / STEP, anchor);
  }

  actualSize() {
    this.#setScale(1);
  }

  fit() {
    this.#scale = null;
    this.#layout();
  }

  #fitScale() {
    const { naturalWidth, naturalHeight } = this.#image;
    const width = this.#stage.clientWidth - PADDING * 2;
    const height = this.#stage.clientHeight - PADDING * 2;
    if (!naturalWidth || width <= 0 || height <= 0) return 1;
    return Math.min(width / naturalWidth, height / naturalHeight, 1);
  }

  #currentScale() {
    return this.#scale ?? this.#fitScale();
  }

  // Keeps the image point under `anchor` (stage coordinates; defaults to the centre) fixed while zooming.
  #setScale(scale, anchor) {
    if (!this.#image.naturalWidth) return;
    const previous = this.#currentScale();
    const next = Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE);
    const { x, y } = anchor ?? { x: this.#stage.clientWidth / 2, y: this.#stage.clientHeight / 2 };
    const imageX = (this.#stage.scrollLeft + x - this.#image.offsetLeft) / previous;
    const imageY = (this.#stage.scrollTop + y - this.#image.offsetTop) / previous;

    this.#scale = next;
    this.#layout();
    this.#stage.scrollLeft = this.#image.offsetLeft + imageX * next - x;
    this.#stage.scrollTop = this.#image.offsetTop + imageY * next - y;
  }

  #layout() {
    const { naturalWidth, naturalHeight } = this.#image;
    if (!naturalWidth) return;
    const scale = this.#currentScale();
    this.#image.style.width = `${Math.round(naturalWidth * scale)}px`;
    this.#image.style.height = `${Math.round(naturalHeight * scale)}px`;
    this.#label.textContent = `${Math.round(scale * 100)}%`;
    this.element.classList.toggle('fitted', this.#scale === null);
    const pannable = this.#stage.scrollWidth > this.#stage.clientWidth || this.#stage.scrollHeight > this.#stage.clientHeight;
    this.element.classList.toggle('pannable', pannable);
  }

  #anchorFrom(event) {
    const rect = this.#stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  // Trackpad pinch arrives as a wheel event with `ctrlKey`; ⌘-scroll zooms too.
  #onWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
    this.#setScale(this.#currentScale() * factor, this.#anchorFrom(event));
  }

  #onDoubleClick(event) {
    if (this.#scale === null) {
      const fitScale = this.#fitScale();
      this.#setScale(fitScale < 1 ? 1 : 2, this.#anchorFrom(event));
    } else {
      this.fit();
    }
  }

  #onPointerDown(event) {
    if (event.button !== 0 || !this.element.classList.contains('pannable')) return;
    this.#drag = { x: event.clientX, y: event.clientY, left: this.#stage.scrollLeft, top: this.#stage.scrollTop };
    this.#stage.setPointerCapture(event.pointerId);
    this.element.classList.add('panning');
  }

  #onPointerMove(event) {
    if (!this.#drag) return;
    this.#stage.scrollLeft = this.#drag.left - (event.clientX - this.#drag.x);
    this.#stage.scrollTop = this.#drag.top - (event.clientY - this.#drag.y);
  }

  #endDrag() {
    this.#drag = null;
    this.element.classList.remove('panning');
  }
}
