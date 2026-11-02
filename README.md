# Offline EPUB Reader

A keyboard-first Chromium MV3 extension for reading EPUB files offline. Books are imported once, stored in IndexedDB, and opened from the local extension pages without a build step or runtime CDN.

## Load the Extension

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open the extension action to import books.

## Import Sources

- Drag and drop `.epub` files on the library page.
- Use **Choose EPUB** for one or more local files.
- Paste a direct `http` or `https` EPUB URL. This is best-effort: some servers block extension fetches with CORS.

The extension does not attempt arbitrary local path reads. Chromium extensions cannot safely read desktop paths by string; local imports go through the browser file picker or drag/drop.

## Reader Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `O` / `→` | Next page |
| `A` / `←` | Previous page |
| `V` | Next chapter |
| `C` | Previous chapter |
| `R` | Toggle contents |
| `S` | Toggle bookmark |
| `B` | Go to next bookmark |
| `T` | Cycle light, dark, sepia |
| `D` | Increase font size |
| `F` | Decrease font size |
| `Q` | Return to library |
| `Esc` | Close contents |

All reader actions are also exposed as buttons with keyboard focus states and 44px targets.

## Architecture

- `manifest.json` uses MV3 extension pages and removes the unsupported `open_with` field.
- `pages/library.html` imports and lists books.
- `pages/reader.html` renders the selected book with local `epub.js`.
- `js/db.js` wraps IndexedDB. EPUB blobs, metadata, covers, reading location, bookmarks, and settings live there.
- `vendor/` contains local copies of `epub.js` and `JSZip`; no remote CDN is used at runtime.

## Verification

Run:

```bash
node scripts/sanity-check.mjs
```

This validates required files, MV3 manifest basics, local script references, and JavaScript parseability.

## Support

If this project is useful to you, you can support my work:

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/zfaka)
