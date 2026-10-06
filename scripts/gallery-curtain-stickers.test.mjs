import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

/* 2026-10-07: the cast's stickers on the gallery curtain (the owner's
   request). Nine cut-out stickers ride the cloth, are decorative, warm from
   the menu's gallery link, survive the calm tier and leave forced colours. */
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const curtain = read("src/components/gallery/gallery-curtain.tsx");
const css = read("src/styles-route-transitions.css");
const chrome = read("src/components/world/world-chrome.tsx");

test("nine stickers, five on the left panel and four on the right, all shipped", () => {
  const entries = [...curtain.matchAll(/\{ src: "(sticker-\d\d)", side: "(left|right)"/g)];
  assert.equal(entries.length, 9);
  assert.equal(entries.filter(([, , side]) => side === "left").length, 5);
  for (const [, name] of entries) {
    assert.ok(
      existsSync(new URL(`../public/gallery/stickers/${name}.webp`, import.meta.url)),
      name,
    );
  }
});

test("the stickers ride the cloth and are decorative", () => {
  const cloth = curtain.slice(curtain.indexOf('className="gallery-curtain-cloth"'));
  assert.ok(
    cloth.indexOf('className="gallery-curtain-stickers"') <
      cloth.indexOf('className="gallery-curtain-hem"'),
  );
  assert.match(curtain, /alt=""/);
  assert.match(curtain, /className=\{`gallery-curtain-panel is-\$\{side\}`\} aria-hidden="true"/);
});

test("placed by translate/rotate, so the calm tier's transform reset keeps them; hidden in forced colours", () => {
  const rule = css.match(/\.gallery-curtain-stickers > img \{[\s\S]*?\n\}/)[0];
  assert.match(rule, /translate: -50% -50%/);
  assert.match(rule, /rotate: var\(--sticker-r/);
  assert.doesNotMatch(rule, /(?<![\w-])transform\s*:/);
  assert.match(
    css,
    /@media \(forced-colors: active\) \{\s*\.gallery-curtain-stickers \{\s*display: none;/,
  );
});

test("the menu's gallery link warms the stickers before the curtain closes", () => {
  assert.match(curtain, /export const GALLERY_CURTAIN_STICKERS/);
  assert.match(chrome, /to="\/gallery"\s+assets=\{GALLERY_CURTAIN_STICKERS\}/);
});

test("every page warms the stickers on idle; the curtain paints them decoded; /gallery preloads them", () => {
  const root = read("src/routes/__root.tsx");
  const warm = read("src/lib/gallery-sticker-warmup.ts");
  const route = read("src/routes/gallery.tsx");
  assert.match(root, /scheduleGalleryStickerWarmup\(GALLERY_CURTAIN_STICKERS\)/);
  assert.match(root, /<GalleryStickerWarmup \/>/);
  // After load, on idle, low priority, decoded and held; never under Save-Data or 2G.
  assert.match(warm, /requestIdleCallback/);
  assert.match(warm, /addEventListener\("load"/);
  assert.match(warm, /fetchPriority = "low"/);
  assert.match(warm, /held\.push\(image\)/);
  assert.match(warm, /image\.decode\(\)/);
  assert.match(warm, /saveData/);
  assert.match(curtain, /decoding="sync"/);
  assert.match(
    route,
    /GALLERY_CURTAIN_STICKERS\.map\(\(href\) => \(\{\s*rel: "preload",\s*as: "image"/,
  );
});
