# Feature Tour

This document exercises **every** supported Markdown feature, with *italic*, ***bold italic***, and ~~strikethrough~~ text.

## Images

A PNG next to this file (`./logo.png`):

![Logo](./logo.png)

Without the `./` prefix, and with spaces, parentheses and `#` in the path:

![Diagram](<images/diagram (v2) #1.png>)

The same image written with percent-encoding:

![Diagram encoded](images/diagram%20(v2)%20%231.png)

A missing image is shown as a placeholder instead of breaking the page:

![Missing](./does-not-exist.png)

## Lists

1. First item
2. Second item
   - Nested bullet
   - Another nested bullet
3. Third item

- Unordered
- List

## Table

| Feature        | Supported | Notes                      |
| -------------- | :-------: | -------------------------- |
| Tabs           |    Yes    | Duplicate tabs allowed     |
| Drag & drop    |    Yes    | `.md`, `.markdown`, `.png` |
| File watching  |    Yes    | Reload banner              |

## Quote

> Markdown is intended to be as easy-to-read and easy-to-write as is feasible.
>
> — John Gruber

## Code

Inline code: `const answer = 42;`

```javascript
import { readFile } from 'node:fs/promises';

export async function loadNote(path) {
  const text = await readFile(path, 'utf8');
  return text.split('\n').filter(Boolean);
}
```

```python
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

---

## Links

- External: [Electron](https://www.electronjs.org)
- Another document: [Meeting notes](<My Notes/Meeting Notes & Ideas.md>)
- Anchor: [Back to Images](#images)
- Safe raw HTML is rendered, like on GitHub: <kbd>⌘</kbd> + <kbd>O</kbd>
- Unsafe HTML is removed (nothing appears here): <script>alert('nope')</script>
