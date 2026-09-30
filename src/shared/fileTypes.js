// Pure helpers shared by the main process and the renderer (no Node APIs).

export const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd'];
export const IMAGE_EXTENSIONS = ['png'];
export const INLINE_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];

export function extensionOf(filePath) {
  const name = String(filePath).split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function baseName(filePath) {
  return String(filePath).split(/[\\/]/).filter(Boolean).pop() ?? String(filePath);
}

export function fileKind(filePath) {
  const ext = extensionOf(filePath);
  if (MARKDOWN_EXTENSIONS.includes(ext)) return 'markdown';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  return null;
}

export function isInlineImage(filePath) {
  return INLINE_IMAGE_EXTENSIONS.includes(extensionOf(filePath));
}
