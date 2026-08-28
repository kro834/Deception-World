import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const worldHomeUrl = new URL("../src/components/world/world-home.tsx", import.meta.url);
const baseStylesUrl = new URL("../src/styles-world/07.css", import.meta.url);
const mobileStylesUrl = new URL("../src/styles-world/09.css", import.meta.url);
const interactionStylesUrl = new URL("../src/styles-world/21.css", import.meta.url);
const worldHome = readFileSync(worldHomeUrl, "utf8");
const baseStyles = readFileSync(baseStylesUrl, "utf8");
const mobileStyles = readFileSync(mobileStylesUrl, "utf8");
const interactionStyles = readFileSync(interactionStylesUrl, "utf8");

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
  assert.match(ep2, /label: "仮面ライダーレルム\u3000アースフォーム"[\s\S]*?to: "\/characters\/terra"/);
  assert.match(ep2, /label: "仮面ライダーレルム\u3000ムーンフォーム"[\s\S]*?to: "\/characters\/luna"/);
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
  assert.match(worldHome, /openEpisodePickup[\s\S]*?goEpisode\(index\)/);
  assert.match(worldHome, /tabIndex=\{0\}[\s\S]*?event\.key === "ArrowRight"/);
  assert.match(worldHome, /<output aria-live="polite">/);
  assert.match(worldHome, /releaseProgrammaticScroll[\s\S]*?"pointerdown"[\s\S]*?"wheel"/);
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

test("the shared pointer light cannot displace episode or sticky dialog controls", () => {
  const sharedHost = interactionStyles.indexOf('[data-liquid-pointer]:not(.side-panel)');
  const episodeOverride = interactionStyles.indexOf('.episode-pickup-plus[data-liquid-pointer]');
  const nightmareOverride = interactionStyles.indexOf(
    '.rider-nightmare-dialog-close[data-liquid-pointer]',
  );

  assert.notEqual(sharedHost, -1);
  assert.ok(episodeOverride > sharedHost, "episode controls must override the shared relative host");
  assert.ok(nightmareOverride > sharedHost, "sticky close must override the shared relative host");
  assert.match(
    interactionStyles.slice(episodeOverride),
    /\.episode-pickup-plus\[data-liquid-pointer\],[\s\S]*?\.episode-pickup-close\[data-liquid-pointer\][\s\S]*?position: absolute/,
  );
  assert.match(
    interactionStyles.slice(nightmareOverride),
    /\.rider-nightmare-dialog-close\[data-liquid-pointer\][\s\S]*?position: sticky/,
  );
});

test("iPhone episode images stay inside their column and leave every title fully visible", () => {
  assert.match(
    mobileStyles,
    /--episode-mobile-card-height: clamp\(128px, 34vw, 140px\)/,
  );
  assert.match(
    mobileStyles,
    /\.episode-card \{[\s\S]*?height: var\(--episode-mobile-card-height\);[\s\S]*?align-self: start/,
  );
  assert.match(
    mobileStyles,
    /\.episode-card-surface \{[\s\S]*?min-height: var\(--episode-mobile-card-height\);[\s\S]*?height: var\(--episode-mobile-card-height\);[\s\S]*?grid-template-columns: minmax\(104px, 0\.86fr\) minmax\(0, 1\.14fr\)/,
  );
  assert.match(
    mobileStyles,
    /\.episode-thumbnail \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?height: var\(--episode-mobile-card-height\);[\s\S]*?min-height: 0;[\s\S]*?aspect-ratio: auto/,
  );
  assert.match(
    mobileStyles,
    /\.episode-card-copy \{[\s\S]*?z-index: 2;[\s\S]*?min-width: 0;[\s\S]*?height: var\(--episode-mobile-card-height\);[\s\S]*?min-height: 0/,
  );
  assert.match(
    mobileStyles,
    /\.episode-card-copy h4 \{[\s\S]*?max-width: 100%;[\s\S]*?overflow: visible/,
  );
  assert.match(baseStyles, /\.episode-pickup-item h3 \{[\s\S]*?word-break: keep-all/);
});

test("iPhone episode cards remain centered from EP1 through EP5", () => {
  assert.match(mobileStyles, /--episode-mobile-card-width: min\(84vw, 330px, 100%\)/);
  assert.match(mobileStyles, /grid-auto-columns: var\(--episode-mobile-card-width\)/);
  assert.match(
    mobileStyles,
    /padding-left: max\(1px, calc\(\(100% - var\(--episode-mobile-card-width\)\) \/ 2\)\)/,
  );
  assert.match(
    mobileStyles,
    /padding-right: max\(1px, calc\(\(100% - var\(--episode-mobile-card-width\)\) \/ 2\)\)/,
  );
  assert.match(
    mobileStyles,
    /scroll-padding-inline: max\(1px, calc\(\(100% - var\(--episode-mobile-card-width\)\) \/ 2\)\)/,
  );
});
