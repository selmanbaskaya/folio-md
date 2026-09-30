import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import sanitizeHtml from 'sanitize-html';
import { toAssetUrl } from './protocol.js';

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Raw HTML is enabled here; `renderMarkdown` sanitizes the complete output.
const md = new MarkdownIt({ html: true, linkify: true, highlight: highlightCode });
const { escapeHtml } = md.utils;

const defaultValidateLink = md.validateLink.bind(md);
md.validateLink = (url) => /^file:/i.test(url.trim()) || defaultValidateLink(url);

function highlightCode(code, lang) {
  if (lang && hljs.getLanguage(lang)) {
    try {
      const { value } = hljs.highlight(code, { language: lang, ignoreIllegals: true });
      return `<pre class="hljs"><code class="language-${escapeHtml(lang)}">${value}</code></pre>`;
    } catch {
      // Fall through to plain rendering.
    }
  }
  return `<pre class="hljs"><code>${escapeHtml(code)}</code></pre>`;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function statFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

// Resolves a link/image target to an absolute local path, or null for remote URLs.
// markdown-it percent-encodes targets, so `<my image.png>` arrives as `my%20image.png`.
function resolveLocalPath(target, baseDir) {
  if (!target || target.startsWith('#')) return null;
  if (URL_SCHEME.test(target)) {
    if (!/^file:/i.test(target)) return null;
    try {
      return fileURLToPath(target);
    } catch {
      return null;
    }
  }
  const withoutSuffix = target.replace(/[?#].*$/, '');
  const candidates = [safeDecode(target), target, safeDecode(withoutSuffix)];
  const existing = candidates.map((c) => path.resolve(baseDir, c)).find((p) => statFile(p));
  return existing ?? path.resolve(baseDir, safeDecode(withoutSuffix));
}

// Applied to every <img>, whether it came from Markdown syntax or raw HTML.
function resolveImage(attribs, baseDir) {
  const src = attribs.src ?? '';
  const localPath = resolveLocalPath(src, baseDir);
  if (!localPath) return { tagName: 'img', attribs };
  const stat = statFile(localPath);
  if (!stat) {
    const label = attribs.alt ? `${attribs.alt} — ${safeDecode(src)}` : safeDecode(src);
    return { tagName: 'span', attribs: { class: 'missing-image', title: localPath }, text: `Image not found: ${label}` };
  }
  return { tagName: 'img', attribs: { ...attribs, src: toAssetUrl(localPath, stat.mtimeMs) } };
}

function resolveLink(attribs, baseDir) {
  const { 'data-local-path': _ignored, ...rest } = attribs;
  const localPath = resolveLocalPath(rest.href ?? '', baseDir);
  return { tagName: 'a', attribs: localPath ? { ...rest, 'data-local-path': localPath } : rest };
}

// Raw HTML is allowed (like on GitHub) but reduced to a safe allowlist: no scripts,
// event handlers, iframes, forms or inline styles.
function sanitizeOptions(baseDir) {
  const headingIds = Object.fromEntries(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((tag) => [tag, ['id']]));
  return {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'del', 'ins', 'details', 'summary'],
    allowedAttributes: {
      '*': ['align', 'title', 'lang', 'dir'],
      ...headingIds,
      a: ['href', 'name', 'data-local-path'],
      img: ['src', 'alt', 'width', 'height'],
      pre: ['class'],
      code: ['class'],
      span: ['class'],
      table: ['width'],
      th: ['class', 'colspan', 'rowspan', 'width'],
      td: ['class', 'colspan', 'rowspan', 'width'],
      ol: ['start', 'type'],
      details: ['open'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'file'],
    allowedSchemesByTag: { img: ['http', 'https', 'data', 'md-asset'] },
    transformTags: {
      img: (_tagName, attribs) => resolveImage(attribs, baseDir),
      a: (_tagName, attribs) => resolveLink(attribs, baseDir),
    },
  };
}

// The renderer's CSP forbids inline styles, so table alignment is expressed as classes.
for (const type of ['th_open', 'td_open']) {
  md.renderer.rules[type] = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const align = token.attrGet('style')?.match(/text-align:\s*(left|center|right)/)?.[1];
    if (align) {
      token.attrs = token.attrs.filter(([name]) => name !== 'style');
      token.attrJoin('class', `align-${align}`);
    }
    return self.renderToken(tokens, idx, options);
  };
}

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

// GitHub-style heading ids so `[link](#some-heading)` anchors work.
md.core.ruler.push('heading_ids', (state) => {
  const seen = new Map();
  state.tokens.forEach((token, i) => {
    if (token.type !== 'heading_open') return;
    const text = (state.tokens[i + 1]?.children ?? [])
      .filter((child) => child.type === 'text' || child.type === 'code_inline')
      .map((child) => child.content)
      .join('');
    const slug = slugify(text) || 'section';
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    token.attrSet('id', count ? `${slug}-${count}` : slug);
  });
});

export function renderMarkdown(source, filePath) {
  try {
    const baseDir = path.dirname(filePath);
    return sanitizeHtml(md.render(source), sanitizeOptions(baseDir));
  } catch (error) {
    return `<div class="render-error">Could not render this document: ${escapeHtml(error.message)}</div>
<pre class="hljs"><code>${escapeHtml(source)}</code></pre>`;
  }
}

export function highlightSource(source) {
  try {
    return hljs.highlight(source, { language: 'markdown', ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(source);
  }
}
