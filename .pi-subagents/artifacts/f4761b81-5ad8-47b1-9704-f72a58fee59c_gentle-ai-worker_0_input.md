# Task for gentle-ai-worker

Scaffold the epub-reader browser extension project structure in /Users/faka/code/projects/browser-extensions/epub-reader

Create:
1. `manifest.json` - Chrome MV3:
    - name: "EPUB Reader", version: "1.0", manifest_version: 3
    - action with default_popup: "pages/library.html"
    - open_with: {file_extensions: ["epub"]}
    - icons: {128: "icons/icon-128.png"}

2. Directory structure: pages/, lib/ (epub.js, storage.js, keyboard.js), css/ (reader.css, library.css), icons/

3. `.gitignore` - node_modules, dist, *.log

4. `README.md` - brief overview with keyboard shortcuts

5. `icons/icon-128.png` - can be a minimal generated placeholder (create via a tiny script or just note in README that they need to provide a real icon)

IMPORTANT: Create actual files, not placeholders. Must be valid MV3 manifest.

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