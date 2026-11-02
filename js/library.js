const MAX_EPUB_BYTES = 150 * 1024 * 1024;
const EPUB_MIME_TYPES = new Set(['application/epub+zip', 'application/octet-stream', 'application/zip', 'binary/octet-stream', '']);
const CLEARLY_NON_EPUB_TYPES = [/^text\//i, /^image\//i, /^audio\//i, /^video\//i, /json/i, /xml/i, /html/i, /javascript/i, /pdf/i];

const els = {
  books: document.querySelector('#books'),
  empty: document.querySelector('#empty-state'),
  count: document.querySelector('#book-count'),
  status: document.querySelector('#status'),
  dropZone: document.querySelector('#drop-zone'),
  fileInput: document.querySelector('#file-input'),
  pickFile: document.querySelector('#pick-file'),
  urlForm: document.querySelector('#url-form'),
  urlInput: document.querySelector('#url-input'),
  themeToggle: document.querySelector('#theme-toggle')
};

let books = [];

init().catch(showError);

async function init() {
  document.documentElement.dataset.theme = await ReaderDb.getSetting('libraryTheme', preferredTheme());
  els.pickFile.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => importFiles([...els.fileInput.files]));
  els.urlForm.addEventListener('submit', importUrl);
  els.themeToggle.addEventListener('click', toggleTheme);
  wireDropZone();
  await renderBooks();
}

function wireDropZone() {
  ['dragenter', 'dragover'].forEach((type) => els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((type) => els.dropZone.addEventListener(type, () => els.dropZone.classList.remove('is-dragging')));
  els.dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    importFiles([...event.dataTransfer.files].filter((file) => file.name.toLowerCase().endsWith('.epub')));
  });
}

async function importFiles(files) {
  if (!files.length) return setStatus('Choose one or more .epub files.');
  for (const file of files) {
    try {
      validateLocalFile(file);
      await importBlob(file, file.name);
    } catch (error) {
      showError(error);
    }
  }
  els.fileInput.value = '';
  await renderBooks();
}

async function importUrl(event) {
  event.preventDefault();
  const url = els.urlInput.value.trim();
  if (!url) return;
  setStatus('Fetching EPUB…');
  try {
    validateUrl(url);
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    validateResponseHeaders(response);
    const blob = await response.blob();
    validateBlob(blob, filenameFromUrl(url), response.headers.get('content-type') || '');
    const name = filenameFromUrl(url) || 'download.epub';
    await importBlob(blob, name, url);
    els.urlInput.value = '';
    await renderBooks();
  } catch (error) {
    showError(new Error(`URL import failed. ${error.message}`));
  }
}

async function importBlob(blob, fallbackName, sourceUrl = '') {
  validateBlob(blob, fallbackName, blob.type);
  setStatus(`Importing ${fallbackName}…`);
  const buffer = await blob.arrayBuffer();
  await validateEpubSignature(buffer);
  const book = ePub(buffer.slice(0));
  await book.ready;
  const metadata = await book.loaded.metadata;
  let cover = '';
  try {
    const coverUrl = await book.coverUrl();
    if (coverUrl) cover = await objectUrlToDataUrl(coverUrl);
  } catch (_) {
    cover = '';
  }
  book.destroy?.();
  const title = metadata.title || fallbackName.replace(/\.epub$/i, '') || 'Untitled book';
  await ReaderDb.saveBook({
    id: ReaderDb.uid(),
    title,
    author: metadata.creator || metadata.author || 'Unknown author',
    description: metadata.description || '',
    language: metadata.language || '',
    sourceUrl,
    fileName: fallbackName,
    fileSize: blob.size,
    cover,
    blob: new Blob([buffer], { type: 'application/epub+zip' })
  });
  setStatus(`Imported “${title}”.`);
}

async function renderBooks() {
  books = await ReaderDb.listBooks();
  els.books.innerHTML = '';
  els.count.textContent = `${books.length} ${books.length === 1 ? 'book' : 'books'}`;
  els.empty.hidden = books.length > 0;
  for (const book of books) els.books.append(bookCard(book));
}

function bookCard(book) {
  const article = document.createElement('article');
  article.className = 'book-card';
  const progress = Math.max(0, Math.min(100, Math.round((book.progress || 0) * 100)));
  article.innerHTML = `
    <button class="cover-button" type="button" aria-label="Open ${escapeHtml(book.title)}">
      ${book.cover ? `<img src="${book.cover}" alt="Cover of ${escapeHtml(book.title)}">` : '<div class="cover-placeholder" aria-hidden="true">Read</div>'}
    </button>
    <div class="book-meta">
      <h3>${escapeHtml(book.title)}</h3>
      <p>${escapeHtml(book.author || 'Unknown author')}</p>
      <div class="progress-track" aria-label="${progress}% read"><span style="width:${progress}%"></span></div>
      <div class="book-actions">
        <button class="open-book" type="button">${progress > 0 ? 'Continue' : 'Start'}</button>
        <button class="delete-book" type="button">Delete</button>
      </div>
    </div>`;
  article.querySelector('.cover-button').addEventListener('click', () => openBook(book.id));
  article.querySelector('.open-book').addEventListener('click', () => openBook(book.id));
  article.querySelector('.delete-book').addEventListener('click', async () => {
    if (!confirm(`Delete “${book.title}” from this device?`)) return;
    await ReaderDb.deleteBook(book.id);
    setStatus(`Deleted “${book.title}”.`);
    await renderBooks();
  });
  return article;
}

function openBook(id) {
  const readerPath = `pages/reader.html?id=${encodeURIComponent(id)}`;
  if (globalThis.chrome?.tabs?.create && globalThis.chrome?.runtime?.getURL) {
    chrome.tabs.create({ url: chrome.runtime.getURL(readerPath) });
    return;
  }
  location.href = `reader.html?id=${encodeURIComponent(id)}`;
}

async function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  await ReaderDb.setSetting('libraryTheme', next);
}

function preferredTheme() {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function filenameFromUrl(url) {
  try { return new URL(url).pathname.split('/').pop() || ''; } catch (_) { return ''; }
}

async function objectUrlToDataUrl(url) {
  try {
    const blob = await fetch(url).then((response) => response.blob());
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } finally {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}


function validateLocalFile(file) {
  validateBlob(file, file.name, file.type);
  if (!file.name.toLowerCase().endsWith('.epub') && file.type !== 'application/epub+zip') {
    throw new Error('Choose an EPUB file.');
  }
}

function validateUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    throw new Error('Enter a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Use an http or https URL.');
}

function validateResponseHeaders(response) {
  const length = Number(response.headers.get('content-length') || 0);
  if (length > MAX_EPUB_BYTES) throw new Error('EPUB is too large.');
  const type = response.headers.get('content-type') || '';
  if (isClearlyNonEpubType(type)) throw new Error('URL did not return an EPUB.');
}

function validateBlob(blob, name = '', type = '') {
  if (blob.size > MAX_EPUB_BYTES) throw new Error('EPUB is too large.');
  const normalizedType = type.split(';')[0].trim().toLowerCase();
  if (normalizedType && !EPUB_MIME_TYPES.has(normalizedType) && isClearlyNonEpubType(normalizedType)) {
    throw new Error('File is not an EPUB.');
  }
  if (name && !name.toLowerCase().endsWith('.epub') && normalizedType && normalizedType !== 'application/epub+zip') {
    throw new Error('File is not an EPUB.');
  }
}

async function validateEpubSignature(buffer) {
  const bytes = new Uint8Array(buffer.slice(0, 58));
  const startsWithZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!startsWithZip) throw new Error('File is not an EPUB.');
  const mimetype = new TextDecoder().decode(bytes.slice(30, 58));
  if (mimetype && mimetype !== 'application/epub+zip') return;
}

function isClearlyNonEpubType(type) {
  const normalized = type.split(';')[0].trim().toLowerCase();
  return CLEARLY_NON_EPUB_TYPES.some((pattern) => pattern.test(normalized));
}

function setStatus(message) { els.status.textContent = message; }
function showError(error) { console.error(error); setStatus(error.message || 'Something went wrong.'); }
function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}
