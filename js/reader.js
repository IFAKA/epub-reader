const state = {
  id: new URLSearchParams(location.search).get('id'),
  record: null,
  book: null,
  rendition: null,
  settings: { theme: 'light', fontSize: 18, lineHeight: 1.6, fontFamily: 'system', layoutMode: 'single' },
  currentCfi: null,
  saveTimer: 0,
  spineTotal: 0,
  isFixedLayout: false,
  navigationInFlight: false,
  resizeObserver: null,
  resizeTimer: 0,
  lastRenditionSize: ''
};

const shortcutDocuments = new WeakSet();

const els = {
  viewer: document.querySelector('#viewer'),
  loading: document.querySelector('#loading'),
  progress: document.querySelector('#progress-label'),
  tocPanel: document.querySelector('#toc-panel'),
  toc: document.querySelector('#toc'),
  tocButton: document.querySelector('#toc-button'),
  closeToc: document.querySelector('#close-toc'),
  bookmark: document.querySelector('#bookmark-button'),
  theme: document.querySelector('#theme-button'),
  layout: document.querySelector('#layout-button'),
  shortcuts: document.querySelector('#shortcut-button'),
  shortcutHelp: document.querySelector('#shortcut-help'),
  closeShortcuts: document.querySelector('#close-shortcuts'),
  fontDown: document.querySelector('#font-down'),
  fontUp: document.querySelector('#font-up'),
  prev: document.querySelector('#prev'),
  next: document.querySelector('#next')
};

init().catch(showFatal);

async function init() {
  if (!state.id) throw new Error('No book selected.');
  state.record = await ReaderDb.getBook(state.id);
  if (!state.record) throw new Error('Book not found in IndexedDB.');

  state.settings = { ...state.settings, ...(await ReaderDb.getSetting('readerSettings', {})), ...(state.record.settings || {}) };
  applySettings();
  document.title = `${state.record.title} — EPUB Reader`;

  const buffer = await state.record.blob.arrayBuffer();
  state.book = ePub(buffer);
  await state.book.ready;
  state.spineTotal = state.book.spine?.spineItems?.length || 0;
  state.isFixedLayout = detectFixedLayoutBook(state.book);
  syncFixedLayoutState();
  try { await state.book.locations.generate(1000); } catch (_) {}
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const { width, height } = renditionSize();
  state.lastRenditionSize = `${width}x${height}`;
  state.rendition = state.book.renderTo('viewer', {
    width,
    height,
    flow: 'paginated',
    manager: 'default',
    spread: 'none',
    // EPUB content is untrusted input, so scripts stay disabled inside the rendition iframe.
    allowScriptedContent: false
  });
  if (typeof state.rendition.spread === 'function') state.rendition.spread('none');
  applySettings();

  wireControls();
  state.rendition.on('relocated', relocated);
  state.rendition.hooks.content.register((contents) => {
    bindContentShortcuts(contents.document);
  });

  await renderToc();
  await state.rendition.display(state.record.location || undefined);
  els.loading.hidden = true;
  els.viewer.focus();

  updateBookmarkButton();
}


function renditionSize() {
  const rect = els.viewer?.getBoundingClientRect?.();
  const width = Math.floor(rect?.width || els.viewer?.clientWidth || window.innerWidth || 800);
  const height = Math.floor(rect?.height || els.viewer?.clientHeight || window.innerHeight || 600);
  return {
    width: Math.max(1, width),
    height: Math.max(1, height)
  };
}

function wireControls() {
  els.next.addEventListener('click', nextPage);
  els.prev.addEventListener('click', prevPage);
  els.tocButton.addEventListener('click', toggleToc);
  els.closeToc.addEventListener('click', closeToc);
  els.bookmark.addEventListener('click', toggleBookmark);
  els.theme.addEventListener('click', cycleTheme);
  els.layout.addEventListener('click', toggleLayoutMode);
  els.shortcuts.addEventListener('click', toggleShortcutHelp);
  els.closeShortcuts.addEventListener('click', closeShortcutHelp);
  els.fontDown.addEventListener('click', () => changeFont(-1));
  els.fontUp.addEventListener('click', () => changeFont(1));
  document.addEventListener('keydown', handleKeys);
  setupViewportResizeObserver();
}

async function renderToc() {
  const navigation = await state.book.loaded.navigation;
  els.toc.innerHTML = '';
  const items = navigation.toc || [];
  for (const item of items) els.toc.append(tocLink(item, 0));
}

function tocLink(item, depth) {
  const wrapper = document.createElement('div');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toc-item';
  button.style.paddingInlineStart = `${16 + depth * 16}px`;
  button.textContent = item.label || 'Untitled section';
  button.addEventListener('click', async () => {
    await state.rendition.display(item.href);
    closeToc();
  });
  wrapper.append(button);
  for (const child of item.subitems || []) wrapper.append(tocLink(child, depth + 1));
  return wrapper;
}

function relocated(location) {
  state.currentCfi = location.start.cfi;
  const progress = state.book.locations?.percentageFromCfi ? state.book.locations.percentageFromCfi(state.currentCfi) : (location.start.percentage || 0);
  const normalizedProgress = Number.isFinite(progress) ? progress : 0;
  els.progress.textContent = formatLocationLabel(location, normalizedProgress);
  updateBookmarkButton();
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => savePosition(normalizedProgress), 250);
}

function formatLocationLabel(location, progress) {
  const parts = [];
  const chapterIndex = Number.isFinite(location?.start?.index) ? location.start.index + 1 : null;
  if (chapterIndex && state.spineTotal) parts.push(`Section ${chapterIndex} of ${state.spineTotal}`);

  const page = location?.start?.displayed?.page;
  const total = location?.start?.displayed?.total;
  if (Number.isFinite(page) && Number.isFinite(total) && total > 0) {
    parts.push(`Page ${page} of ${total}`);
  }

  if (Number.isFinite(progress)) parts.push(`${Math.round(progress * 100)}%`);
  return parts.length ? parts.join(' · ') : 'Location unavailable';
}

async function savePosition(progress) {
  await ReaderDb.updateBook(state.id, {
    location: state.currentCfi,
    progress,
    settings: state.settings
  });
}

function handleKeys(event) {
  if (event.type !== 'keydown') return;
  if (isEditableTarget(event.target)) return;
  const key = event.key.toLowerCase();
  const actions = {
    j: nextPage,
    k: prevPage,
    h: prevChapter,
    l: nextChapter,
    r: toggleToc,
    s: toggleBookmark,
    w: toggleLayoutMode,
    t: cycleTheme,
    '+': () => changeFont(1),
    '=': () => changeFont(1),
    '-': () => changeFont(-1),
    q: () => { location.href = 'library.html'; },
    '?': toggleShortcutHelp,
    arrowright: nextPage,
    arrowdown: nextPage,
    arrowleft: prevPage,
    arrowup: prevPage,
    escape: closePanels
  };
  if (!actions[key]) return;
  event.preventDefault();
  actions[key]();
}

function bindContentShortcuts(doc) {
  if (!doc || shortcutDocuments.has(doc)) return;
  shortcutDocuments.add(doc);
  doc.addEventListener('keydown', handleKeys);
}

function isEditableTarget(target) {
  if (!target) return false;
  const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
  if (!element) return false;
  return Boolean(element.closest('input, textarea, select, [contenteditable="true"]')) || element.isContentEditable;
}

async function nextPage() { await movePage(1); }
async function prevPage() { await movePage(-1); }
async function nextChapter() { await runNavigation(() => stepChapter(1)); }
async function prevChapter() { await runNavigation(() => stepChapter(-1)); }

async function movePage(direction) {
  await runNavigation(async () => {
    const before = locationSignature(state.rendition.currentLocation());
    if (direction > 0) await state.rendition.next();
    else await state.rendition.prev();

    const after = locationSignature(state.rendition.currentLocation());
    if (before && after && before === after) await stepChapter(direction);
  });
}

async function runNavigation(task) {
  if (!state.rendition || state.navigationInFlight) return;
  state.navigationInFlight = true;
  try {
    await task();
  } finally {
    state.navigationInFlight = false;
  }
}

function locationSignature(location) {
  if (!location?.start) return '';
  const start = location.start;
  const end = location.end || {};
  return [start.index, start.cfi, end.cfi, start.displayed?.page, start.displayed?.total].join('|');
}

async function stepChapter(direction) {
  const spine = state.book.spine.spineItems;
  const current = state.rendition.currentLocation()?.start?.index ?? 0;
  const next = current + direction;
  if (next < 0 || next >= spine.length) return false;
  await state.rendition.display(spine[next].href);
  return true;
}

async function toggleBookmark() {
  if (!state.currentCfi) return;
  const bookmarks = [...(state.record.bookmarks || [])];
  const existing = bookmarks.findIndex((item) => item.cfi === state.currentCfi);
  if (existing >= 0) bookmarks.splice(existing, 1);
  else bookmarks.push({ cfi: state.currentCfi, label: `Bookmark ${bookmarks.length + 1}`, createdAt: Date.now() });
  state.record = await ReaderDb.updateBook(state.id, { bookmarks });
  updateBookmarkButton();
}

async function nextBookmark() {
  const bookmarks = state.record.bookmarks || [];
  if (!bookmarks.length) return;
  const index = bookmarks.findIndex((item) => item.cfi === state.currentCfi);
  const next = bookmarks[(index + 1) % bookmarks.length];
  await state.rendition.display(next.cfi);
}

function updateBookmarkButton() {
  const active = (state.record?.bookmarks || []).some((item) => item.cfi === state.currentCfi);
  const label = active ? 'Remove bookmark' : 'Add bookmark';
  els.bookmark.textContent = label;
  els.bookmark.setAttribute('aria-label', label);
  els.bookmark.setAttribute('aria-pressed', String(active));
}

async function toggleLayoutMode() {
  state.settings.layoutMode = state.settings.layoutMode === 'wide' ? 'single' : 'wide';
  applySettings();
  await refreshRenditionLayout();
  await persistSettings();
}

async function cycleTheme() {
  const themes = ['light', 'dark', 'sepia'];
  state.settings.theme = themes[(themes.indexOf(state.settings.theme) + 1) % themes.length];
  applySettings();
  await persistSettings();
}

async function changeFont(delta) {
  state.settings.fontSize = Math.max(14, Math.min(28, state.settings.fontSize + delta));
  applySettings();
  await refreshRenditionLayout();
  await persistSettings();
}

function applySettings() {
  state.settings.layoutMode = normalizeLayoutMode(state.settings.layoutMode);
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.dataset.layout = state.settings.layoutMode;
  syncFixedLayoutState();
  document.documentElement.style.setProperty('--reader-font-size', `${state.settings.fontSize}px`);
  document.documentElement.style.setProperty('--reader-line-height', state.settings.lineHeight);
  const family = state.settings.fontFamily === 'serif' ? 'Georgia, ui-serif, serif' : '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  document.documentElement.style.setProperty('--reader-font-family', family);
  updateLayoutButton();
  if (state.rendition) {
    const styles = getComputedStyle(document.documentElement);
    const sharedTheme = {
      body: {
        color: styles.getPropertyValue('--reader-text').trim(),
        background: styles.getPropertyValue('--reader-bg').trim()
      },
      a: { color: styles.getPropertyValue('--reader-accent').trim() }
    };

    if (state.isFixedLayout) {
      state.rendition.themes.default(fixedLayoutTheme(sharedTheme));
      return;
    }

    state.rendition.themes.default({
      body: {
        ...sharedTheme.body,
        'font-family': `${family} !important`,
        'font-size': `${state.settings.fontSize}px !important`,
        'line-height': `${state.settings.lineHeight} !important`,
        margin: '0 !important',
        padding: '0 !important',
        width: 'auto !important',
        'box-sizing': 'border-box !important'
      },
      'p, blockquote, ul, ol, dl, figure': {
        'overflow-wrap': 'break-word'
      },
      img: { 'max-width': '100% !important', height: 'auto !important' },
      svg: { 'max-width': '100% !important', height: 'auto !important' },
      table: { 'max-width': '100% !important', width: '100% !important', 'overflow-wrap': 'break-word' },
      pre: { 'white-space': 'pre-wrap', 'max-width': '100% !important', overflow: 'auto' },
      a: sharedTheme.a
    });
  }
}


async function refreshRenditionLayout() {
  if (!state.rendition) return;
  const current = state.currentCfi || state.record?.location || undefined;

  await new Promise((resolve) => requestAnimationFrame(resolve));
  const { width, height } = renditionSize();
  state.lastRenditionSize = `${width}x${height}`;
  if (typeof state.rendition.resize === 'function') {
    state.rendition.resize(width, height);
  }
  if (current) await state.rendition.display(current);
}

function setupViewportResizeObserver() {
  if (state.resizeObserver || !els.viewer) return;
  const schedule = () => {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => {
      const { width, height } = renditionSize();
      const nextSize = `${width}x${height}`;
      if (!state.rendition || nextSize === state.lastRenditionSize) return;
      refreshRenditionLayout().catch(showFatal);
    }, 120);
  };

  if ('ResizeObserver' in window) {
    state.resizeObserver = new ResizeObserver(schedule);
    state.resizeObserver.observe(els.viewer);
  }
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
}

function syncFixedLayoutState() {
  if (state.isFixedLayout) document.documentElement.dataset.fixedLayout = 'true';
  else delete document.documentElement.dataset.fixedLayout;
}

function normalizeLayoutMode(mode) {
  return mode === 'wide' ? 'wide' : 'single';
}


function updateLayoutButton() {
  if (!els.layout) return;
  const isWide = state.settings.layoutMode === 'wide';
  const label = isWide ? 'Wide column' : 'Single column';
  els.layout.textContent = label;
  els.layout.setAttribute('aria-label', `Toggle reading layout, current mode: ${label}`);
  els.layout.setAttribute('aria-pressed', String(isWide));
}

function fixedLayoutTheme(sharedTheme) {
  return {
    html: { background: sharedTheme.body.background },
    body: {
      color: sharedTheme.body.color,
      background: sharedTheme.body.background
    },
    a: sharedTheme.a
  };
}

function detectFixedLayoutBook(book) {
  const metadata = book?.package?.metadata || book?.packaging?.metadata || {};
  const layoutValues = collectLayoutValues(metadata);
  const packageLayout = book?.package?.layout || book?.packaging?.layout;
  if (packageLayout) layoutValues.push(packageLayout);

  const spineItems = book?.spine?.spineItems || [];
  for (const item of spineItems) {
    layoutValues.push(item?.properties, item?.renditionLayout, item?.layout);
  }

  return layoutValues.some((value) => {
    const normalized = String(value || '').toLowerCase();
    return normalized.includes('pre-paginated') || normalized.includes('fixed-layout');
  });
}

function collectLayoutValues(metadata) {
  const keys = ['rendition:layout', 'rendition_layout', 'layout'];
  const values = [];
  for (const key of keys) {
    if (metadata?.[key]) values.push(metadata[key]);
  }
  for (const [key, value] of Object.entries(metadata || {})) {
    if (key.toLowerCase().includes('layout')) values.push(value);
  }
  return values;
}

async function persistSettings() {
  await ReaderDb.setSetting('readerSettings', state.settings);
  if (state.record) state.record = await ReaderDb.updateBook(state.id, { settings: state.settings });
}

function toggleToc() {
  const open = els.tocPanel.hidden;
  els.tocPanel.hidden = !open;
  els.tocButton.setAttribute('aria-expanded', String(open));
  if (open) els.closeToc.focus();
}

function closeToc() {
  const wasOpen = !els.tocPanel.hidden;
  els.tocPanel.hidden = true;
  els.tocButton.setAttribute('aria-expanded', 'false');
  if (wasOpen) els.tocButton.focus();
}

function toggleShortcutHelp() {
  const open = els.shortcutHelp.hidden;
  els.shortcutHelp.hidden = !open;
  els.shortcuts.setAttribute('aria-expanded', String(open));
  els.shortcuts.setAttribute('aria-label', open ? 'Hide keyboard shortcuts' : 'Show keyboard shortcuts');
  if (open) els.closeShortcuts.focus();
}

function closeShortcutHelp() {
  const wasOpen = !els.shortcutHelp.hidden;
  els.shortcutHelp.hidden = true;
  els.shortcuts.setAttribute('aria-expanded', 'false');
  els.shortcuts.setAttribute('aria-label', 'Show keyboard shortcuts');
  if (wasOpen) els.shortcuts.focus();
}

function closePanels() {
  if (!els.shortcutHelp.hidden) closeShortcutHelp();
  else closeToc();
}

function showFatal(error) {
  console.error(error);
  els.loading.hidden = false;
  els.loading.textContent = '';

  const title = document.createElement('strong');
  title.textContent = 'Could not open this book.';
  const message = document.createElement('span');
  message.textContent = error.message || 'Something went wrong.';
  const link = document.createElement('a');
  link.href = 'library.html';
  link.textContent = 'Return to library';

  els.loading.append(title, document.createElement('br'), message, document.createElement('br'), link);
}
