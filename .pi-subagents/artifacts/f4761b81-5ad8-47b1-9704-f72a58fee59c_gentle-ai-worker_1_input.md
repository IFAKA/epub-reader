# Task for gentle-ai-worker

Create the IndexedDB storage layer for an EPUB reader browser extension.
File: /Users/faka/code/projects/browser-extensions/epub-reader/lib/storage.js

Requirements:
- Database version 1, named "epub-reader-db"
- Object stores:
  - "books": ID auto-increment, stores {id (auto), name, data (ArrayBuffer), cover (base64 or null), addedAt, lastRead, readProgress (0-1), currentChapterIndex}
  - "bookmarks": {bookId, chapterIndex, pageIndex, title, timestamp}
  - "settings": key-value {key, value} - stores theme, fontSize, fontFamily, lineHeight

Methods:
- initDB() - open/create the database
- addBook(name, arrayBuffer, coverData) - store a new EPUB, return book object
- getBooks() - list all books (without binary data)
- getBookData(bookId) - return full book data including binary
- deleteBook(bookId) - remove book and its bookmarks
- updateReadProgress(bookId, progress, chapterIndex) - update last read position
- addBookmark(bookId, chapterIndex, pageIndex, chapterTitle)
- getBookmarks(bookId) - list bookmarks for a book
- deleteBookmark(bookmarkId)
- getSetting(key, defaultValue)
- setSetting(key, value)
- extractCover(epubArrayBuffer) - use JSZip to extract the cover image from the EPUB (look in OPF <cover> metadata or try OEBPS/images/*). Returns base64 or null.

Keep it vanilla JS, no dependencies. Use JSZip only for cover extraction (imported from lib/epub.js). All methods return Promises.

Default settings if not set:
- theme: 'light'
- fontSize: '16' (px rem)
- fontFamily: 'Georgia'
- lineHeight: '1.6'

IMPORTANT: This file must be a complete, working module. Export a "storage" object with all methods.

## Acceptance Contract
Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
`criteriaSatisfied[].status` must be exactly one of: satisfied, not-satisfied, not-applicable.
`commandsRun[].result` must be exactly one of: passed, failed, not-run.
`manualNotes` and `notes` are optional strings; an empty string means no note and does not satisfy `manual-notes` evidence.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```