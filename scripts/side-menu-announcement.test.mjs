import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const chrome = readFileSync(
  new URL("../src/components/world/world-chrome.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../src/styles-world/23.css", import.meta.url), "utf8");
const menuStyles = readFileSync(new URL("../src/styles-world/19.css", import.meta.url), "utf8");
const styleIndex = readFileSync(new URL("../src/styles-world.css", import.meta.url), "utf8");
const announcementImages = [
  new URL("../public/rider-saga-rexonance-thumbnail-20260827.jpeg", import.meta.url),
  new URL("../public/announcement-not-even-close.jpeg", import.meta.url),
  new URL("../public/announcement-who-supreme.jpeg", import.meta.url),
];

test("the world and archive side menu expose the shared announcement", () => {
  assert.match(chrome, /<p>INFORMATION<\/p>/);
  assert.match(chrome, /className="side-panel-link-button side-panel-announcement-trigger"/);
  assert.match(chrome, /<span>お知らせ<\/span>/);
  assert.match(chrome, /aria-controls="site-announcement-dialog"/);
  assert.match(chrome, /const SITE_ANNOUNCEMENTS = \[/);
  assert.match(chrome, /title: "比較にならない最強の姿、レクソナンスサーガを発表。"/);
  assert.match(chrome, /sequence: "PRODUCT BRIEFING 03"/);
  assert.match(chrome, /image: "\/rider-saga-rexonance-thumbnail-20260827\.jpeg"/);
  assert.match(chrome, /value: "\+61\.6%"/);
  assert.match(chrome, /value: "\+55\.6%"/);
  assert.match(chrome, /value: "\+480\.6%"/);
  assert.match(chrome, /value: "−89\.5%"/);
  assert.match(chrome, /ヴィンクルムサーガと比較して650%以上の反応速度/);
  assert.match(chrome, /エクスプリームサーガと比較して最大900%高い機動力/);
  assert.match(chrome, /サーガシステムのウルトラハイエンドモデルに相応しい性能を備えています。/);
  assert.doesNotMatch(chrome, /ウルトラハイエンドモデルに相応しい性能を発揮します。/);
  assert.match(chrome, /title: "Not Even Close\."/);
  assert.match(chrome, /image: "\/announcement-not-even-close\.jpeg"/);
  assert.match(chrome, /title: "Who Supreme\?"/);
  assert.match(chrome, /image: "\/announcement-who-supreme\.jpeg"/);
  assert.match(chrome, /aria-label=\{`お知らせ\$\{SITE_ANNOUNCEMENTS\.length\}件`\}/);
  assert.match(menuStyles, /\.side-panel-links :is\(a, button\.side-panel-link-button\)/);
});

test("announcement interaction preserves the side menu and supports every modal exit", () => {
  const opener = chrome.match(/const openAnnouncements[\s\S]*?\n {2}};/)?.[0] ?? "";
  assert.ok(opener.length > 0, "announcement opener should exist");
  assert.doesNotMatch(opener, /\bclose\(\)/);
  assert.match(chrome, /dialog\.showModal\(\)/);
  assert.match(chrome, /dialog\.focus\(\{ preventScroll: true \}\)/);
  assert.match(chrome, /announcementOpenedByKeyboardRef\.current = openedByKeyboard/);
  assert.match(chrome, /if \(announcementOpenedByKeyboardRef\.current\)/);
  assert.match(chrome, /dialog\.contains\(document\.activeElement\)/);
  assert.match(
    chrome,
    /onCancel=\{\(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?closeAnnouncement\(true\)/,
  );
  assert.match(chrome, /onClick=\{onAnnouncementBackdrop\}/);
  assert.match(chrome, /aria-label="お知らせを閉じる"/);
  assert.match(
    chrome,
    /event\.stopPropagation\(\);[\s\S]*?const restoreFocus = event\.detail === 0;[\s\S]*?closeAnnouncement\(restoreFocus\)/,
  );
  assert.match(chrome, /const releaseViewportScrollLock = acquireViewportScrollLock\(\)/);
});

test("side-menu focus restoration follows the input modality on iPad", () => {
  assert.match(chrome, /const SIDE_MENU_OPEN_INPUT_EVENT/);
  assert.match(chrome, /const openedByKeyboard = event\.detail === 0/);
  assert.match(chrome, /detail: \{ keyboard: openedByKeyboard \}/);
  assert.match(chrome, /if \(!openedByKeyboard\) event\.currentTarget\.blur\(\)/);
  assert.match(chrome, /sideMenuRestoreFocusRef\.current = detail\?\.keyboard === true/);
  assert.match(
    chrome,
    /const focusTarget = sideMenuRestoreFocusRef\.current[\s\S]*?side-panel-close[\s\S]*?: panel/,
  );
  assert.match(chrome, /if \(sideMenuRestoreFocusRef\.current\)[\s\S]*?previousFocus\?\.focus/);
  assert.match(chrome, /panel\.contains\(document\.activeElement\)[\s\S]*?\.blur\(\)/);
  assert.match(
    chrome,
    /onPointerDown=\{\(\) => \{[\s\S]*?sideMenuRestoreFocusRef\.current = false/,
  );
});

test("the side menu contains stray focus without blocking its nested announcement", () => {
  assert.match(chrome, /const containBackgroundFocus = \(event: FocusEvent\) => \{/);
  assert.match(chrome, /panel\.contains\(event\.target\)/);
  assert.match(
    chrome,
    /announcementDialog\?\.open && announcementDialog\.contains\(event\.target\)/,
  );
  assert.match(chrome, /document\.addEventListener\("focusin", containBackgroundFocus, true\)/);
  assert.match(chrome, /document\.removeEventListener\("focusin", containBackgroundFocus, true\)/);
  assert.match(
    chrome,
    /const focusTarget = sideMenuRestoreFocusRef\.current[\s\S]*?side-panel-close[\s\S]*?: panel;[\s\S]*?focusTarget\?\.focus\(\{ preventScroll: true \}\)/,
  );
});

test("the nested announcement participates in the shared viewport scroll lock", () => {
  assert.match(chrome, /acquireViewportScrollLock/);
  assert.match(chrome, /const releaseViewportScrollLock = acquireViewportScrollLock\(\)/);
  assert.match(
    chrome,
    /return \(\) => \{[\s\S]*?if \(dialog\.open\) dialog\.close\(\);[\s\S]*?releaseViewportScrollLock\(\)/,
  );
});

test("the side-menu scroll guard lets the announcement stage handle touch and wheel input", () => {
  assert.match(
    chrome,
    /const announcementDialog = announcementRef\.current;[\s\S]*?announcementDialog\?\.open && announcementDialog\.contains\(event\.target\)[\s\S]*?return;/,
  );
  assert.match(
    styles,
    /\.site-announcement-stage \{[\s\S]*?overflow-y: auto;[\s\S]*?touch-action: pan-y;[\s\S]*?-webkit-overflow-scrolling: touch;/,
  );
});

test("the announcement archive opens an index before a selected transmission", () => {
  assert.match(chrome, /selectedAnnouncementId/);
  assert.match(chrome, /data-view=\{selectedAnnouncement \? "detail" : "index"\}/);
  assert.match(chrome, /<ul className="site-announcement-list">/);
  assert.match(chrome, /<li key=\{notice\.id\}>/);
  assert.match(chrome, /aria-label=\{`\$\{notice\.title\}を開く`\}/);
  assert.match(chrome, /onClick=\{\(event\) => openAnnouncementDetail\(event, notice\.id\)\}/);
  assert.match(chrome, /className="site-announcement-back"/);
  assert.match(chrome, /onClick=\{returnToAnnouncementIndex\}/);
  assert.match(chrome, /一覧へ戻る/);
});

test("announcement index and detail transitions restore scroll and keyboard focus", () => {
  assert.match(chrome, /useLayoutEffect\(\(\) => \{/);
  assert.match(chrome, /announcementStageRef\.current\.scrollTop = 0/);
  assert.match(chrome, /announcementBackRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(chrome, /announcementReturnIdRef\.current = selectedAnnouncementId/);
  assert.match(chrome, /item\.dataset\.announcementId === returnId/);
  assert.match(chrome, /returnTarget\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(chrome, /const openedByKeyboard = event\.detail === 0/);
  assert.match(chrome, /if \(!openedByKeyboard\) event\.currentTarget\.blur\(\)/);
  assert.match(chrome, /data-announcement-id=\{notice\.id\}/);
});

test("announcement glass is safe-area aware, internally scrollable, and responsive", () => {
  assert.match(styleIndex, /@import "\.\/styles-world\/23\.css"/);
  assert.match(
    styles,
    /\.site-announcement-dialog \{[\s\S]*?height: 100dvh;[\s\S]*?safe-area-inset-top[\s\S]*?overflow: hidden;[\s\S]*?overscroll-behavior: contain/,
  );
  assert.match(
    styles,
    /\.site-announcement-stage \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;[\s\S]*?-webkit-overflow-scrolling: touch/,
  );
  assert.match(styles, /\.site-announcement-dialog::backdrop \{[\s\S]*?backdrop-filter: blur/);
  assert.match(
    styles,
    /\.site-announcement-hub \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\)/,
  );
  assert.match(styles, /linear-gradient\(rgba\(116, 184, 255, 0\.025\) 1px/);
  assert.match(
    styles,
    /@media \(min-width: 1180px\)[\s\S]*?\.site-announcement-list \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    styles,
    /@media \(min-width: 1180px\)[\s\S]*?\.site-announcement-list-item \{\s*height: 100%;\s*grid-template-columns: 88px minmax\(0, 1fr\) 44px;\s*gap: 12px;/,
  );
  assert.match(
    styles,
    /\.site-announcement-list-copy small,[\s\S]*?\.site-announcement-list-copy time,[\s\S]*?font-size: 11px;[\s\S]*?line-height: 1\.45;/,
  );
  assert.match(
    styles,
    /\.site-announcement-list-copy b \{[\s\S]*?font-size: clamp\(16px, 1\.7vw, 22px\);[\s\S]*?line-height: 1\.5;[\s\S]*?overflow-wrap: anywhere;[\s\S]*?text-overflow: clip;[\s\S]*?white-space: normal;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 360px\)[\s\S]*?\.site-announcement-list-copy time \{[\s\S]*?flex-basis: 100%;/,
  );
  assert.doesNotMatch(styles, /\.site-announcement-list-copy time \{\s*display: none;/);
  assert.match(
    styles,
    /\.site-announcement-list-visual \{[^}]*align-self: center;[^}]*width: 100%;[^}]*min-width: 0;/,
  );
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /\.site-announcement-hub \{[\s\S]*?width: 100%;[\s\S]*?height: 100%/);
  assert.match(styles, /@media \(orientation: landscape\) and \(max-height: 600px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(styles, /\.site-announcement-detail\.is-product-release/);
  assert.match(styles, /\.site-announcement-metrics/);
  assert.match(styles, /\.site-announcement-metric/);
  assert.match(styles, /\.site-announcement-lede/);
  assert.match(
    styles,
    /@media \(max-width: 700px\)[\s\S]*?\.site-announcement-copy h3 \{[\s\S]*?max-width: 100%;[\s\S]*?overflow-wrap: anywhere;[\s\S]*?word-break: normal;/,
  );
});

test("the supplied announcement image is shipped as an optimized local asset", () => {
  for (const image of announcementImages) {
    assert.equal(existsSync(image), true);
    const bytes = readFileSync(image);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
    assert.ok(statSync(image).size < 200_000, "announcement image should remain below 200 KB");
  }
  assert.match(chrome, /width: 900,[\s\S]*?height: 1125/);
  assert.match(chrome, /width: 960,[\s\S]*?height: 1441/);
  assert.match(chrome, /width: 680,[\s\S]*?height: 906/);
  assert.match(chrome, /width=\{selectedAnnouncement\.width\}/);
  assert.match(chrome, /height=\{selectedAnnouncement\.height\}/);
  assert.match(chrome, /decoding="async"/);
});
