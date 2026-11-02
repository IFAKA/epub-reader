(() => {
  const DB_NAME = 'offline-epub-reader';
  const DB_VERSION = 1;
  const BOOKS = 'books';
  const SETTINGS = 'settings';

  let dbPromise;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(BOOKS)) {
          const books = db.createObjectStore(BOOKS, { keyPath: 'id' });
          books.createIndex('updatedAt', 'updatedAt');
          books.createIndex('title', 'title');
        }
        if (!db.objectStoreNames.contains(SETTINGS)) {
          db.createObjectStore(SETTINGS, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function tx(storeName, mode, callback) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let value;
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
      value = callback(store);
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function listBooks() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(BOOKS, 'readonly');
      const index = transaction.objectStore(BOOKS).index('updatedAt');
      const books = [];
      index.openCursor(null, 'prev').onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const { blob, arrayBuffer, ...summary } = cursor.value;
        books.push(summary);
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(books);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function getBook(id) {
    return tx(BOOKS, 'readonly', (store) => requestToPromise(store.get(id)));
  }

  async function saveBook(book) {
    const now = Date.now();
    const record = { bookmarks: [], location: null, progress: 0, settings: null, ...book, updatedAt: now, importedAt: book.importedAt || now };
    if (!record.id) record.id = uid();
    await tx(BOOKS, 'readwrite', (store) => store.put(record));
    return record;
  }

  async function updateBook(id, patch) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(BOOKS, 'readwrite');
      const store = transaction.objectStore(BOOKS);
      let next;

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) {
          transaction.abort();
          reject(new Error('Book not found'));
          return;
        }
        next = { ...existing, ...patch, updatedAt: Date.now() };
        store.put(next);
      };
      getRequest.onerror = () => reject(getRequest.error);
      transaction.oncomplete = () => resolve(next);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Transaction aborted'));
    });
  }

  async function deleteBook(id) {
    await tx(BOOKS, 'readwrite', (store) => store.delete(id));
  }

  async function getSetting(key, fallback = null) {
    const entry = await tx(SETTINGS, 'readonly', (store) => requestToPromise(store.get(key)));
    return entry ? entry.value : fallback;
  }

  async function setSetting(key, value) {
    await tx(SETTINGS, 'readwrite', (store) => store.put({ key, value }));
  }

  window.ReaderDb = { listBooks, getBook, saveBook, updateBook, deleteBook, getSetting, setSetting, uid };
})();
