import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const worldHomeUrl = new URL("../src/components/world/world-home.tsx", import.meta.url);
const baseStylesUrl = new URL("../src/styles-world/07.css", import.meta.url);
const mobileStylesUrl = new URL("../src/styles-world/09.css", import.meta.url);
const worldHome = readFileSync(worldHomeUrl, "utf8");
const baseStyles = readFileSync(baseStylesUrl, "utf8");
const mobileStyles = readFileSync(mobileStylesUrl, "utf8");

const expectedPickups = [
  ["リームー/仮面ライダーフリート", "/manager-reemu-rider.jpeg", "/managers/reemu"],
  ["紅城真守/仮面ライダーアルゲノム", "/rider-profile-argenome.jpeg", "/riders/argenome"],
  ["仮面ライダーレルムレジェンズ", "/rider-profile-realm.jpeg", "/riders/realm"],
  ["仮面ライダーレルム　アースフォーム", "/rider-realm-earth.jpeg", "/characters/terra"],
  ["仮面ライダーレルム　ムーンフォーム", "/rider-realm-moon.jpeg", "/characters/luna"],
];

test("EP1 and EP2 expose the five requested thumbnail pickup records", () => {
  for (const [label, src, to] of expectedPickups) {
    assert.match(worldHome, new RegExp(`label: "${label}"`));
    assert.match(worldHome, new RegExp(`src: "${src}"`));
    assert.match(worldHome, new RegExp(`to: "${to}"`));
    assert.ok(
      existsSync(new URL(`../public${src}`, import.meta.url)),
      `${src} must exist in public`,
    );
  }

  const episodeData = worldHome.slice(worldHome.indexOf("const EPISODES"));
  const ep1 = episodeData.slice(episodeData.indexOf('no: "01"'), episodeData.indexOf('no: "02"'));
  const ep2 = episodeData.slice(episodeData.indexOf('no: "02"'), episodeData.indexOf('no: "03"'));
  assert.equal((ep1.match(/label: "/g) ?? []).length, 2);
  assert.equal((ep2.match(/label: "/g) ?? []).length, 3);
  assert.match(ep2, /displayLines: \["仮面ライダーレルム", "レジェンズ"\]/);
  assert.match(ep2, /label: "仮面ライダーレルム　アースフォーム"[\s\S]*?to: "\/characters\/terra"/);
  assert.match(ep2, /label: "仮面ライダーレルム　ムーンフォーム"[\s\S]*?to: "\/characters\/luna"/);
});

test("episode selection and the single-tap plus remain sibling controls", () => {
  assert.match(worldHome, /className="episode-card-select"/);
  assert.match(worldHome, /ep\.pickups\?\.length \? " has-pickup"/);
  assert.match(worldHome, /className="episode-pickup-plus ios26-glass"/);
  assert.match(worldHome, /data-liquid-pointer="true"/);
  assert.match(worldHome, /<UiVectorIcon kind="plus" size=\{23\} \/>/);
  assert.match(worldHome, /aria-controls="episode-pickup-dialog"/);
  assert.doesNotMatch(
    worldHome,
    /<article\s+[\s\S]{0,220}?role="button"[\s\S]{0,500}?episode-pickup-plus/,
  );
});

test("the pickup dialog is modal, dismissible, and scroll-reset on every open", () => {
  assert.match(worldHome, /ref=\{episodePickupDialogRef\}/);
  assert.match(worldHome, /id="episode-pickup-dialog"/);
  assert.match(worldHome, /dialog\.showModal\(\)/);
  assert.match(worldHome, /settlePickupScroll\(dialog, \["\.episode-pickup-panel"\]/);
  assert.match(worldHome, /cancelEpisodePickupScrollReset\.current\?\.\(\)/);
  assert.match(worldHome, /resetPickupScroll\(dialog, \["\.episode-pickup-panel"\]\)/);
  assert.match(worldHome, /episodePickupOpenedByKeyboard\.current/);
  assert.match(worldHome, /\.episode-pickup-close"\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(worldHome, /dialog\.focus\(\{ preventScroll: true \}\)/);
  assert.match(worldHome, /openEpisodePickup\(i, event\.currentTarget, event\.detail === 0\)/);
  assert.match(worldHome, /window\.requestAnimationFrame\(\(\) => trigger\?\.blur\(\)\)/);
  assert.doesNotMatch(worldHome, /bootLiquidGlass\(dialog\)/);
  assert.match(worldHome, /onCancel=\{\(event\) => \{[\s\S]*?closeEpisodePickup\(\)/);
  assert.match(worldHome, /event\.target === episodePickupDialogRef\.current/);
  assert.match(worldHome, /className="episode-pickup-name-line"/);
});

test("every pickup opens its matching dossier without leaving the dialog behind", () => {
  assert.match(worldHome, /<GuardedLink[\s\S]*?className="episode-pickup-item"/);
  assert.match(worldHome, /to=\{item\.to\}/);
  assert.match(worldHome, /assets=\{item\.assets\}/);
  assert.match(worldHome, /beforeNavigate=\{closeEpisodePickup\}/);
  assert.match(worldHome, /OPEN DOSSIER <UiVectorIcon kind="arrow-right" size=\{15\} \/>/);
});

test("the plus and dialog include desktop and iPhone-specific Liquid Glass layout", () => {
  assert.match(baseStyles, /\.episode-pickup-plus \{/);
  assert.match(
    baseStyles,
    /\.episode-pickup-plus\[data-liquid-pointer\],[\s\S]*?\.episode-pickup-close\[data-liquid-pointer\][\s\S]*?position: absolute/,
  );
  assert.match(baseStyles, /backdrop-filter: blur\(18px\) saturate\(170%\)/);
  assert.match(baseStyles, /\.episode-pickup-dialog::backdrop/);
  assert.match(
    baseStyles,
    /\.episode-pickup-dialog:focus,[\s\S]*?\.episode-pickup-dialog:focus-visible \{[\s\S]*?outline: none !important/,
  );
  assert.match(baseStyles, /html:has\(\.episode-pickup-dialog\[open\]\)/);
  assert.match(
    baseStyles,
    /\.episode-pickup-grid \{[\s\S]*?repeat\(auto-fit, minmax\(210px, 1fr\)\)/,
  );
  assert.match(baseStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(mobileStyles, /@media \(max-width: 560px\)/);
  assert.match(mobileStyles, /\.episode-pickup-dialog \{[\s\S]*?width: calc\(100vw - 16px\)/);
  assert.match(mobileStyles, /\.episode-pickup-grid \{[\s\S]*?scroll-snap-type: x mandatory/);
  assert.match(mobileStyles, /\.episode-pickup-item \{[\s\S]*?flex: 0 0 min\(76vw, 270px\)/);
  assert.match(mobileStyles, /\.episode-pickup-dialog::backdrop \{[\s\S]*?blur\(6px\)/);
});

test("iPhone episode images stay inside their column and leave every title fully visible", () => {
  assert.match(
    mobileStyles,
    /\.episode-card-surface \{[\s\S]*?min-height: 124px;[\s\S]*?height: auto;[\s\S]*?grid-template-columns: minmax\(104px, 0\.86fr\) minmax\(0, 1\.14fr\)/,
  );
  assert.match(
    mobileStyles,
    /\.episode-thumbnail \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?aspect-ratio: auto/,
  );
  assert.match(
    mobileStyles,
    /\.episode-card-copy \{[\s\S]*?z-index: 2;[\s\S]*?min-width: 0;[\s\S]*?min-height: 124px/,
  );
  assert.match(
    mobileStyles,
    /\.episode-card-copy h4 \{[\s\S]*?max-width: 100%;[\s\S]*?overflow: visible/,
  );
});
