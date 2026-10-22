// The chrome's Japanese names and titles wrap only between their phrases in
// every engine (WebKit has no `word-break: auto-phrase`), the notice posters
// crop at each poster's own focus, and the launcher keeps SPECIAL and STORIES
// in their own rows wherever four STORIES tiles would be narrow (2026-10-22).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const chrome = source("src/components/world/world-chrome.tsx");
const cinema = source("src/components/world/external-cinema-link.tsx");
const shell = source("src/styles-stage-shell.css");
const elevation = source("src/styles-chrome-elevation.css");
const viewport = source("src/styles-viewport-chrome.css");
const text = (markup) => markup.replace(/<[^>]*>/g, "").replace(/\s+/g, "");

test("the films' and the site's names are marked up in their phrases, text unchanged", () => {
  const stories = chrome.slice(chrome.indexOf("<p>STORIES</p>"), chrome.indexOf("<p>RIDERS</p>"));
  const spans = [
    ...stories.matchAll(
      /<span>\s*<span className="side-panel-phrase">[\s\S]*?<\/span>\s*<\/span>\s*<i>/g,
    ),
  ];
  assert.deepEqual(
    spans.map(([markup]) => text(markup)),
    [
      "映画第一作「ドリームチャプター」",
      "ディセプションワールド",
      "映画第一作「ドリームチャプター」",
      "ディセプションワールド",
    ],
  );
  for (const [markup] of spans)
    assert.match(markup, /<\/span>\s*<wbr \/>\s*<span className="side-panel-phrase">/);
  const cinemaName = cinema.slice(cinema.indexOf("<span>"), cinema.indexOf("<i>本編リメイク"));
  assert.equal(text(cinemaName), "映画四部作「仮面ライダーサーガ」");
  // Each phrase is whole on its line (WebKit's keep-all breaks after 「), inline so the
  // accessible names keep no inserted space.
  assert.match(
    shell,
    /> span\s*> \.side-panel-phrase \{\s*display: inline;\s*white-space: nowrap;\s*\}/,
  );
  assert.doesNotMatch(shell, /word-break: auto-phrase/);
});

test("notice titles break only where a particle meets the next word", () => {
  const literal = chrome.match(/const TITLE_PHRASE_SEAM =\s*(\/.+\/gu);/)?.[1];
  assert.ok(literal, "the seam is one regular expression");
  const seam = new Function(`return ${literal};`)();
  const phrases = (title) => title.replace(seam, "$1​").split("​");
  assert.deepEqual(phrases("レクソナンスサーガの性能と三つの形態を紹介。"), [
    "レクソナンスサーガの",
    "性能と",
    "三つの",
    "形態を",
    "紹介。",
  ]);
  assert.deepEqual(phrases("Not Even Close."), ["Not Even Close."]);
  assert.deepEqual(phrases("らーめん"), ["らーめん"], "no line starts on ー");
  assert.match(chrome, /<b>\s*<PhrasedTitle text=\{notice\.title\} \/>\s*<\/b>/);
  assert.match(
    elevation,
    /\.site-announcement-list-copy b \{\s*color: var\(--dwc-text\);[\s\S]*?word-break: keep-all;\s*line-break: strict;\s*\}/,
  );
});

test("each notice poster crops at its own focus in every frame", () => {
  assert.match(chrome, /posterY: \{ square: "50%" \}/);
  assert.match(chrome, /posterY: \{ tall: "0%", square: "48%", thumb: "100%" \}/);
  assert.match(chrome, /style=\{announcementPosterStyle\(notice\)\}/);
  assert.match(elevation, /object-position: 50% var\(--poster-y-tall, 18%\);/);
  assert.match(elevation, /object-position: 50% var\(--poster-y-square, 18%\);/);
  assert.match(elevation, /object-position: 50% var\(--poster-y-thumb, 50%\);/);
});

test("SPECIAL and STORIES keep their own rows until three STORIES tiles are wide", () => {
  assert.match(shell, /@media \(min-width: 1180px\) and \(max-width: 1799px\) \{/);
  assert.doesNotMatch(
    shell,
    /@media \(min-width: 1440px\) \{\s*html\[data-family\] body #site-side-panel/,
  );
  // The shared row is only for three STORIES tiles, and never outweighs the file menu's areas.
  assert.match(
    shell,
    /#site-side-panel\.side-panel\[data-liquid-pointer\]:where\(\s*:not\(\s*:has\([\s\S]*?> a:nth-of-type\(4\)\s*\)\s*\)\s*\) \{\s*grid-template-areas:[\s\S]*?"sec {2}spe {2}spe {2}sto {2}sto {2}sto"/,
  );
});

test("file tiles: names whole, numbers under them in narrow tiles, a real scrim", () => {
  assert.equal(chrome.match(/<span>\{file\.name\}<\/span>/g)?.length, 2);
  assert.match(shell, /container: dw-file-tile \/ inline-size;/);
  assert.match(shell, /@container dw-file-tile \(max-width: 139px\) \{[\s\S]*?flex-basis: 100%;/);
  assert.match(
    shell,
    /\.side-panel-files a::before \{[\s\S]*?height: auto;\s*border-radius: 0;\s*scale: none;\s*translate: none;\s*box-shadow: none;/,
  );
  assert.match(
    shell,
    /@media \(orientation: landscape\) and \(max-height: 600px\) and \(min-width: 761px\) \{\s*html\[data-family\] body #site-side-panel\.side-panel > \.side-panel-rikuei > \.side-panel-links \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  );
});

test("the close plate reads the sheet's tokens; small labels keep the 12px floor", () => {
  assert.match(
    elevation,
    /\.site-announcement-close\.ios26-glass \{[\s\S]*?border: 1px solid rgb\(var\(--dwc-ice-rgb\) \/ 36%\);[\s\S]*?background: rgb\(var\(--dwc-ink-rgb\) \/ 92%\) !important;/,
  );
  assert.match(elevation, /--dwc-ink-rgb: var\(--sh-ink-rgb, 19 12 23\);/);
  assert.match(viewport, /\.ipad-menu-description \{[^}]*font-size: 12px;[^}]*opacity: 0\.9;/);
  assert.match(chrome, /<span className="site-announcement-kicker-tail">\{" \/ ARCHIVE"\}<\/span>/);
  assert.match(
    elevation,
    /@media \(max-width: 359px\) \{[\s\S]*?\.site-announcement-kicker-tail \{\s*display: none;/,
  );
});

// Round 2 (2026-10-22): the notice's own headline breaks as its poster does,
// a short tail (紹介。) never stands alone, and SPECIAL's names carry no
// inserted space in their accessible names.
test("the detail headline breaks at the poster's phrases; a short tail rides along", () => {
  assert.match(chrome, /<h3>\s*<PhrasedTitle text=\{selectedAnnouncement\.title\} \/>\s*<\/h3>/);
  assert.match(chrome, /const TITLE_TAIL_MAX = 3;/);
  assert.match(
    chrome,
    /phrases\.length > 1 && phrases\[phrases\.length - 1\]\.length <= TITLE_TAIL_MAX/,
  );
  assert.match(
    elevation,
    /\.site-announcement-copy h3 \{[\s\S]*?text-wrap: balance;[\s\S]*?word-break: keep-all;\s*line-break: strict;/,
  );
  assert.match(
    shell,
    /> span\s*> \.name-word--protected \{\s*display: inline !important;\s*white-space: nowrap;\s*\}/,
  );
});

test("the launcher opens with no words seen through the head's fade; the first kicker clears it", () => {
  assert.match(
    chrome,
    /function settleClearOfHeadFade\(panel: HTMLElement, keep: HTMLElement \| null, clearance: number\)/,
  );
  assert.match(chrome, /const SIDE_MENU_HEAD_INK_PX = 12;/);
  assert.match(chrome, /const SIDE_MENU_HEAD_FADE_PX = 29;/);
  // Only ever back up, and never past the reader's own row.
  assert.match(chrome, /shift > 0 && shift <= panel\.scrollTop && shift <= room/);
  assert.match(
    shell,
    /> \.side-panel-head \+ \.side-panel-group \{\s*grid-area: find;\s*margin-top: 14px;\s*\}/,
  );
});

test("Saga Cinema's bar type keeps the 12px floor", () => {
  const bar = shell.slice(shell.indexOf("/* Saga Cinema's bar type at the site's 12px floor"));
  assert.match(bar, /:is\(\.brand-name, \.brand-sub\) \{\s*font-size: 12px;/);
  assert.match(bar, /\.desktop-nav a \{\s*font-size: 12px;/);
  assert.match(bar, /\.world-return-link > span:first-child \{\s*font-size: 12px;/);
  assert.match(bar, /@media \(max-width: 539px\) \{[\s\S]*?\.brand-sub \{\s*display: none;/);
});
