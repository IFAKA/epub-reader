# Task for gentle-ai-worker

Create CSS files for an EPUB reader browser extension.

Two files:

1. /Users/faka/code/projects/browser-extensions/epub-reader/css/reader.css
   - Three themes (light, dark, sepiá) via CSS custom properties on .theme-light, .theme-dark, .theme-sepia
   - Light: white bg, near-black text, subtle borders
   - Dark: #1a1a1a bg, #ddd text
   - Sepiá: #f5e6c8 bg, #5c4a33 text
   - Typography: Georgia serif default, font-size controlled via --font-size, line-height via --line-height
   - Page layout: center content max-width ~65ch, comfortable margins
   - Sidebar TOC panel: slides in from left, ~280px wide, with book title and chapter list
   - Bookmark indicator: subtle marker on TOC chapters that have bookmarks
   - Keyboard shortcut hints bar: fixed bottom, subtle, shows current key bindings
   - Smooth transitions between themes
   - Ensure EPUB content iframe doesn't break the theme
   - Font families to cycle: Georgia, Merriweather, Libre Baskerville, system-ui

2. /Users/faka/code/projects/browser-extensions/epub-reader/css/library.css
   - Clean grid layout for book cards
   - Book card: cover thumbnail, title, author, progress bar
   - Drag-drop zone: prominent when dragging, dashed border, subtle animation
   - Search/filter bar
   - "Drop or browse" empty state
   - Keyboard hints at bottom
   - Responsive grid: auto-fill minmax(160px, 1fr)

IMPORTANT: Production-ready CSS, not placeholders. Use CSS custom properties, modern layout (grid, flexbox), and smooth transitions.

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