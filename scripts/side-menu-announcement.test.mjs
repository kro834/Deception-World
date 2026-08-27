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
  assert.match(chrome, /document\.body\.style\.overflow = "hidden"/);
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

test("the nested announcement does not take ownership of an existing body scroll lock", () => {
  assert.match(chrome, /const ownsBodyScrollLock = previousOverflow !== "hidden"/);
  assert.match(chrome, /if \(ownsBodyScrollLock\) document\.body\.style\.overflow = "hidden"/);
  assert.match(
    chrome,
    /return \(\) => \{[\s\S]*?if \(dialog\.open\) dialog\.close\(\);[\s\S]*?if \(ownsBodyScrollLock\) document\.body\.style\.overflow = previousOverflow/,
  );
});

test("the announcement archive opens an index before a selected transmission", () => {
  assert.match(chrome, /selectedAnnouncementId/);
  assert.match(chrome, /data-view=\{selectedAnnouncement \? "detail" : "index"\}/);
  assert.match(chrome, /<ul className="site-announcement-list">/);
  assert.match(chrome, /<li key=\{notice\.id\}>/);
  assert.match(chrome, /aria-label=\{`\$\{notice\.title\}を開く`\}/);
  assert.match(chrome, /onClick=\{\(\) => setSelectedAnnouncementId\(notice\.id\)\}/);
  assert.match(chrome, /className="site-announcement-back"/);
  assert.match(chrome, /onClick=\{\(\) => setSelectedAnnouncementId\(null\)\}/);
  assert.match(chrome, /一覧へ戻る/);
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
