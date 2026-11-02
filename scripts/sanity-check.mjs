import { readFileSync, existsSync } from 'node:fs';
import { relative } from 'node:path';

const required = [
  'manifest.json',
  'pages/library.html',
  'pages/reader.html',
  'js/db.js',
  'js/library.js',
  'js/reader.js',
  'css/library.css',
  'css/reader.css',
  'vendor/jszip.min.js',
  'vendor/epub.min.js',
  'icons/icon-128.png'
];

const failures = [];
for (const file of required) {
  if (!existsSync(file)) failures.push(`Missing ${file}`);
}

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) failures.push('Manifest must be MV3');
if (manifest.open_with) failures.push('Manifest must not use unsupported open_with');
if (manifest.action?.default_popup !== 'pages/library.html') failures.push('Library popup is not configured');
const broadHostPermissions = new Set(['http://*/*', 'https://*/*', '*://*/*', '<all_urls>']);
if ((manifest.host_permissions || []).some((permission) => broadHostPermissions.has(permission))) {
  failures.push('Manifest must not request broad host permissions');
}
if ((manifest.permissions || []).includes('storage')) failures.push('Manifest must not request unused storage permission');
if ((manifest.permissions || []).includes('tabs')) failures.push('Manifest must not request tabs permission just to open the reader tab');

let readerHtml = '';
for (const htmlFile of ['pages/library.html', 'pages/reader.html']) {
  const html = readFileSync(htmlFile, 'utf8');
  if (htmlFile === 'pages/reader.html') readerHtml = html;
  for (const src of [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1])) {
    if (/^https?:\/\//.test(src)) failures.push(`${htmlFile} uses remote script ${src}`);
    const local = new URL(src, `file://${process.cwd()}/${htmlFile}`).pathname;
    if (!existsSync(local)) failures.push(`${htmlFile} references missing ${relative(process.cwd(), local)}`);
  }
}

for (const jsFile of ['js/db.js', 'js/library.js', 'js/reader.js']) {
  new Function(readFileSync(jsFile, 'utf8'));
}


if (!/id="shortcut-button"/.test(readerHtml) || !/aria-controls="shortcut-help"/.test(readerHtml)) {
  failures.push('Reader must expose an accessible shortcut help button');
}
if (!/id="shortcut-help"[\s\S]*hidden/.test(readerHtml)) {
  failures.push('Shortcut help must be hidden until requested, not permanently over content');
}
if (!/id="progress-label"/.test(readerHtml)) failures.push('Reader must include a location/progress label');

const libraryJs = readFileSync('js/library.js', 'utf8');
const openBookMatch = libraryJs.match(/function\s+openBook\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/);
if (!openBookMatch) {
  failures.push('Library must define openBook');
} else {
  const openBookBody = openBookMatch[1];
  if (!/chrome\.tabs\.create/.test(openBookBody)) failures.push('openBook must open reader.html in a browser tab');
  if (!/chrome\.runtime\.getURL/.test(openBookBody)) failures.push('openBook must build an extension reader URL');
}

const readerJs = readFileSync('js/reader.js', 'utf8');
const readerCss = readFileSync('css/reader.css', 'utf8');

if (!/layoutMode\s*:\s*['"]single['"]/.test(readerJs)) failures.push('Reader settings must default layoutMode to single');
if (!/id="layout-button"/.test(readerHtml) || !/aria-pressed="false"/.test(readerHtml) || !/aria-label="Toggle reading layout/.test(readerHtml)) {
  failures.push('Reader must expose an accessible layout mode button with state');
}
if (!/w\s*:\s*toggleLayoutMode/.test(readerJs)) failures.push('Reader shortcut w must toggle layout mode');
if (!/w<\/kbd> layout/.test(readerHtml)) failures.push('Shortcut help text must document w layout toggle');
if (!/800px/.test(readerCss) || !/1140px/.test(readerCss)) {
  failures.push('Reader layout mode must define single/wide outer page widths');
}
if (!/updateLayoutButton\(\)/.test(readerJs) || !/Wide column/.test(readerJs) || !/Single column/.test(readerJs)) failures.push('Reader must show the active layout mode in the layout button');
if (!/ReaderDb\.setSetting\(['"]readerSettings['"], state\.settings\)/.test(readerJs) || !/settings:\s*state\.settings/.test(readerJs)) {
  failures.push('Reader layoutMode must persist through existing readerSettings and per-book settings');
}
if (!/document\.documentElement\.dataset\.layout\s*=\s*state\.settings\.layoutMode/.test(readerJs)) {
  failures.push('Reader must set data-layout from the normalized setting before display');
}
if (!/function\s+renditionSize\s*\(\)/.test(readerJs) || !/state\.book\.renderTo\(['"]viewer['"][\s\S]*width\s*,[\s\S]*height/.test(readerJs)) {
  failures.push('Reader must compute explicit numeric rendition width/height from the viewer before renderTo');
}
if (!/state\.rendition\.resize\(width, height\)/.test(readerJs) || !/refreshRenditionLayout/.test(readerJs) || !/await state\.rendition\.display\(current\)/.test(readerJs)) {
  failures.push('Reader must resize(width, height) and redisplay the rendition after layout/font changes so epub.js recalculates columns');
}
if (!/setupViewportResizeObserver/.test(readerJs) || !/ResizeObserver/.test(readerJs) || !/window\.addEventListener\(['"]resize['"]/.test(readerJs) || !/orientationchange/.test(readerJs)) {
  failures.push('Reader must observe viewer/window resize and refresh epub.js explicit pixel pagination');
}
if (!/lastRenditionSize/.test(readerJs)) {
  failures.push('Reader resize observer must avoid redundant epub.js redisplays with a size signature');
}
if (!/state\.rendition\.spread\(['"]none['"]\)/.test(readerJs)) {
  failures.push("Reader must explicitly call spread('none') after rendition creation when available");
}
if (!/dataset\.fixedLayout\s*=\s*['"]true['"]/.test(readerJs) || !/delete document\.documentElement\.dataset\.fixedLayout/.test(readerJs)) {
  failures.push('Reader must keep fixed-layout data state synced for full-stage safety');
}

if (!/formatLocationLabel/.test(readerJs) || !/Section \${chapterIndex} of \${state\.spineTotal}/.test(readerJs) || !/Page \${page} of \${total}/.test(readerJs)) {
  failures.push('Reader must format a compact section/page/progress location label');
}
if (!/closeToc\(\)/.test(readerJs) || !/rendition\.display\(item\.href\)[\s\S]*closeToc\(\)/.test(readerJs)) {
  failures.push('TOC item clicks must close the contents panel after navigation');
}
if (!/allowScriptedContent\s*:\s*false/.test(readerJs)) {
  failures.push('Reader must explicitly disable scripted EPUB content');
}
if (!/spread\s*:\s*['"]none['"]/.test(readerJs)) {
  failures.push('Reader rendition must keep epub.js spread disabled with spread: none');
}
const bodyTheme = readerJs.match(/body:\s*\{([\s\S]*?)\n\s*\},\n\s*['"]p, blockquote, ul, ol, dl, figure['"]/)?.[1] || '';
if (/max-width/.test(bodyTheme) || /body > div, body > section, body > article, body > main/.test(readerJs)) {
  failures.push('EPUB iframe theme must avoid internal prose max-width constraints that confuse paginated columns');
}

if (!/function\s+detectFixedLayoutBook\s*\(/.test(readerJs)) failures.push('Reader must define fixed-layout EPUB detection');
if (!/pre-paginated|fixed-layout|rendition:layout|rendition_layout|layout/.test(readerJs)) failures.push('Reader fixed-layout detection must inspect EPUB rendition layout metadata with fallbacks');
if (!/isFixedLayout/.test(readerJs)) failures.push('Reader state must track fixed-layout EPUBs');
if (!/if\s*\(state\.isFixedLayout\)/.test(readerJs)) failures.push('Reader iframe theme must branch for fixed-layout EPUB safety');
if (!/delete\s+body\[['"]font-family['"]\]/.test(readerJs) && !/fixedLayoutTheme/.test(readerJs)) failures.push('Fixed-layout theme must avoid prose font, line-height, max-width, margin, and padding constraints');
if (!/img\s*:\s*\{[\s\S]*max-width['"]?\s*:\s*['"]?100%/.test(readerJs) && !/img[^}]*max-width\s*:\s*100%/.test(readerJs)) {
  failures.push('EPUB iframe theme must keep images responsive');
}
for (const [key, action] of [
  ['j', 'nextPage'],
  ['k', 'prevPage'],
  ['h', 'prevChapter'],
  ['l', 'nextChapter'],
  ['r', 'toggleToc'],
  ['s', 'toggleBookmark'],
  ['t', 'cycleTheme']
]) {
  if (!new RegExp(`${key}\\s*:\\s*${action}`).test(readerJs)) failures.push(`Reader shortcut ${key} must map to ${action}`);
}
for (const [key, action] of [
  ['arrowright', 'nextPage'],
  ['arrowdown', 'nextPage'],
  ['arrowleft', 'prevPage'],
  ['arrowup', 'prevPage']
]) {
  if (!new RegExp(`${key}\\s*:\\s*${action}`).test(readerJs)) failures.push(`Reader shortcut ${key} must map to ${action}`);
}
if (!/['"]?\+['"]?\s*:\s*\(\)\s*=>\s*changeFont\(1\)/.test(readerJs) && !/['"]?=['"]?\s*:\s*\(\)\s*=>\s*changeFont\(1\)/.test(readerJs)) failures.push('Reader shortcut + must increase font size');
if (!/['"]?-['"]?\s*:\s*\(\)\s*=>\s*changeFont\(-1\)/.test(readerJs)) failures.push('Reader shortcut - must decrease font size');
if (!/q\s*:\s*\(\)\s*=>\s*\{\s*location\.href\s*=\s*['"]library\.html['"]/.test(readerJs)) failures.push('Reader shortcut q must return to library');
if (!/\?['"]?\s*:\s*toggleShortcutHelp/.test(readerJs)) failures.push('Reader must use ? to toggle shortcut help');
if (!/escape\s*:\s*closePanels/.test(readerJs) || !/function\s+closePanels\s*\(\)/.test(readerJs) || !/closeShortcutHelp\(\)/.test(readerJs) || !/closeToc\(\)/.test(readerJs)) {
  failures.push('Reader Escape shortcut must close help/contents panels through closePanels');
}
if (!/isEditableTarget/.test(readerJs) || !/isContentEditable/.test(readerJs)) failures.push('Reader shortcuts must avoid editable targets');
if (/rendition\.on\(['"]keyup['"]\s*,\s*handleKeys\)/.test(readerJs)) failures.push('Reader must not bind rendition keyup to handleKeys because iframe keydown already handles shortcuts');
if (!/event\.type\s*!==\s*['"]keydown['"]/.test(readerJs)) failures.push('Reader keyboard handler must ignore non-keydown events to avoid double-fire');
if (!/document\.addEventListener\(['"]keydown['"]\s*,\s*handleKeys/.test(readerJs)) failures.push('Reader shortcuts must work from the host document');
if (!/bindContentShortcuts\(contents\.document\)/.test(readerJs) || !/doc\.addEventListener\(['"]keydown['"]\s*,\s*handleKeys/.test(readerJs)) failures.push('Reader shortcuts must work from the EPUB iframe document');
if (!/WeakSet/.test(readerJs) || !/shortcutDocuments/.test(readerJs)) failures.push('Reader must guard iframe shortcut binding against duplicate content hook registration');

if (!/async function\s+nextPage\s*\(\)\s*\{\s*await movePage\(1\)/.test(readerJs) || !/async function\s+prevPage\s*\(\)\s*\{\s*await movePage\(-1\)/.test(readerJs)) {
  failures.push('Reader nextPage/prevPage must use awaited linear page movement helpers');
}
if (!/state\.navigationInFlight/.test(readerJs) || !/finally\s*\{\s*state\.navigationInFlight\s*=\s*false/.test(readerJs)) {
  failures.push('Reader navigation must guard against double navigation races with an in-flight flag');
}
if (!/await state\.rendition\.next\(\)/.test(readerJs) || !/await state\.rendition\.prev\(\)/.test(readerJs) || !/locationSignature/.test(readerJs) || !/before\s*&&\s*after\s*&&\s*before\s*===\s*after[\s\S]*stepChapter\(direction\)/.test(readerJs)) {
  failures.push('Reader page movement must await rendition next/prev, detect unchanged location, and step adjacent spine');
}
if (!/Remove bookmark/.test(readerJs) || !/Add bookmark/.test(readerJs) || !/setAttribute\(['"]aria-label['"], label\)/.test(readerJs)) {
  failures.push('Bookmark button must expose clear Add bookmark/Remove bookmark labels and aria-labels');
}
if (!/j<\/kbd>\/<kbd>k<\/kbd> page/.test(readerHtml) || !/h<\/kbd>\/<kbd>l<\/kbd> section/.test(readerHtml) || !/Esc<\/kbd> close panels/.test(readerHtml)) {
  failures.push('Shortcut help text must document j/k page movement, h/l section movement, and Escape panel closing');
}
if (!/class=\"keyboard-hint\"[\s\S]*Keyboard:[\s\S]*j<\/kbd>\/<kbd>k<\/kbd> page[\s\S]*h<\/kbd>\/<kbd>l<\/kbd> section[\s\S]*\?<\/kbd> all shortcuts/.test(readerHtml)) {
  failures.push('Reader must expose a compact persistent keyboard hint without relying only on the requested help panel');
}
for (const requiredHelp of [
  /Tab<\/kbd> moves through controls/,
  /Enter<\/kbd>\/<kbd>Space<\/kbd> activate controls/,
  /j<\/kbd>\/<kbd>k<\/kbd> page/,
  /h<\/kbd>\/<kbd>l<\/kbd> section/,
  /r<\/kbd> contents/,
  /s<\/kbd> bookmark/,
  /w<\/kbd> layout/,
  /t<\/kbd> theme/,
  /\+<\/kbd>\/<kbd>-<\/kbd> font/,
  /q<\/kbd> library/,
  /Esc<\/kbd> close panels/
]) {
  if (!requiredHelp.test(readerHtml)) failures.push('Shortcut help text must document the complete keyboard workflow');
}

const cssRuleBody = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return readerCss.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || '';
};
const hasDeclaration = (body, property, valuePattern) =>
  new RegExp(`${property}\\s*:\\s*${valuePattern}\\s*(?:;|$)`).test(body);

const htmlBodyRule = cssRuleBody('html, body');
if (
  !hasDeclaration(htmlBodyRule, 'width', '100%') ||
  !hasDeclaration(htmlBodyRule, 'height', '100%') ||
  !hasDeclaration(htmlBodyRule, 'overflow', 'hidden')
) {
  failures.push('Reader html/body must occupy the viewport and hide document overflow');
}

const readerShellRule = cssRuleBody('.reader-shell');
if (
  !hasDeclaration(readerShellRule, 'height', '100dvh') ||
  !/height\s*:\s*100vh\s*;[\s\S]*?height\s*:\s*100dvh\s*;/.test(readerShellRule)
) {
  failures.push('Reader shell must use exact viewport height with a 100dvh override');
}
if (hasDeclaration(readerShellRule, 'min-height', '100vh')) {
  failures.push('Reader shell must not rely on min-height for viewport sizing');
}

const readerMainRule = cssRuleBody('.reader-main');
if (
  !hasDeclaration(readerMainRule, 'min-height', '0') ||
  !hasDeclaration(readerMainRule, 'overflow', 'hidden') ||
  !hasDeclaration(readerMainRule, 'justify-content', 'center')
) {
  failures.push('Reader main must allow grid shrinkage, center the bounded stage, and clip staged EPUB overflow');
}

const viewerRule = cssRuleBody('.viewer');
if (/padding(?:-inline)?\s*:/.test(viewerRule)) {
  failures.push('Viewer must not have padding; page gutter belongs on .reader-main only');
}
if (
  !hasDeclaration(viewerRule, 'height', '100%') ||
  !hasDeclaration(viewerRule, 'overflow', 'hidden') ||
  !hasDeclaration(viewerRule, 'min-width', '0') ||
  !hasDeclaration(viewerRule, 'width', 'min\\(100%, var\\(--reader-page-width\\)\\)') ||
  !hasDeclaration(viewerRule, 'max-width', 'min\\(100%, var\\(--reader-page-width\\)\\)') ||
  !hasDeclaration(viewerRule, 'margin-inline', 'auto')
) {
  failures.push('Viewer must use bounded reader-page width, stay centered, and clip EPUB stage overflow safely');
}
if (/height\s*:\s*calc\(100vh\s*-/.test(viewerRule)) {
  failures.push('Viewer must not use fixed viewport subtraction for height');
}
if (!/:root\[data-layout=['"]single['"]\]\s*\{[\s\S]*--reader-page-width\s*:\s*(7[6-9]\d|8[01]\d|820)px/.test(readerCss)) {
  failures.push('Single-column layout must set --reader-page-width around 760–820px');
}
if (!/:root\[data-layout=['"]wide['"]\]\s*\{[\s\S]*--reader-page-width\s*:\s*(11[0-7]\d|1180)px/.test(readerCss)) {
  failures.push('Wide layout must set --reader-page-width around 1100–1180px');
}
if (!/:root\[data-fixed-layout=['"]true['"]\] \.viewer\s*\{[\s\S]*width\s*:\s*100%/.test(readerCss)) {
  failures.push('Fixed-layout EPUBs must be able to use the full stage width');
}
for (const selector of ['.viewer .epub-container', '.viewer .epub-view', '.viewer iframe']) {
  const body = cssRuleBody(selector);
  if (
    !hasDeclaration(body, 'width', '100%') ||
    !hasDeclaration(body, 'max-width', '100%') ||
    !hasDeclaration(body, 'height', '100%') ||
    !hasDeclaration(body, 'max-height', '100%') ||
    !hasDeclaration(body, 'overflow', 'hidden')
  ) {
    failures.push(`${selector} must be constrained to the outer viewer and clip overflow`);
  }
}

const shortcutRule = cssRuleBody('.shortcut-help');
if (
  !hasDeclaration(shortcutRule, 'box-sizing', 'border-box') ||
  !hasDeclaration(shortcutRule, 'overflow-wrap', 'anywhere') ||
  /border-radius\s*:\s*999px/.test(shortcutRule)
) {
  failures.push('Shortcut help must be a requested panel, not a permanent overflowing pill');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Sanity checks passed.');
