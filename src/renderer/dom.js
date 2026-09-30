export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Paths are shown in `direction: rtl` containers so they truncate from the left;
// left-to-right marks keep leading/trailing slashes in place.
export function ltr(text) {
  return `\u200E${text}\u200E`;
}
