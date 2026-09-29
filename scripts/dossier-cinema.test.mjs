import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* How a character file arrives (src/styles-dossier-cinema.css): the hero's
   entrance is keyed to the load gate's hand-over (html[data-loading] going
   away), finite, compositor-only, and off under reduced motion and economy
   rendering. The first scroll pushes the plate in on the root scroller. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
// A page class (.dante-page, .ciel-dossier-page) may sit between the two.
const SCOPE = /main\.manager-page(\.[\w-]+)*:not\(\.is-sovereign\)/;
const splitSelector = (selector) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    if (selector[i] === "(") depth += 1;
    else if (selector[i] === ")") depth -= 1;
    else if (selector[i] === "," && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, selector.slice(start)];
};
const rules = (css) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.replace(/^[\s\S]*?(?=[^\s{}][^{}]*$)/, "").trim(),
    body,
  }));

const sheet = stripComments(await read("src/styles-dossier-cinema.css"));
const motionStart = sheet.indexOf("@media (prefers-reduced-motion: no-preference)");
const keyframesStart = sheet.indexOf("@keyframes");

test("the dossier routes load the cinema sheet after the edition sheet, before page sheets", async () => {
  const head = await read("src/lib/world-head.ts");
  assert.match(head, /import dossierCinemaCssUrl from "@\/styles-dossier-cinema\.css\?url";/);
  const links = head.slice(head.indexOf("export const DOSSIER_STYLESHEET_LINKS"));
  const edition = links.indexOf("href: dossierEditionCssUrl");
  const cinema = links.indexOf("href: dossierCinemaCssUrl");
  assert.ok(edition > 0 && cinema > edition, `${edition} ${cinema}`);
  assert.ok(cinema < links.indexOf("];"));
  assert.doesNotMatch(head, /mirage/i);
  // Page sheets still come after every dossier sheet.
  assert.match(
    await read("src/routes/characters/ciel.tsx"),
    /\[\.\.\.DOSSIER_STYLESHEET_LINKS, \{ rel: "stylesheet", href: cielCssUrl \}\]/,
  );
});

test("the sheet is scoped, adds no text and leaves the sovereign file alone", () => {
  for (const { selector } of rules(sheet)) {
    if (/^(from|to|\d+%)$/.test(selector)) continue;
    for (const part of splitSelector(selector)) assert.match(part, SCOPE);
  }
  assert.doesNotMatch(sheet, /content:/);
  assert.doesNotMatch(sheet, /\.is-sovereign[^)]/);
});

test("the old mount-time entrance is off for every file this sheet serves", () => {
  const before = sheet.slice(0, motionStart);
  assert.match(
    before,
    /main\.manager-page:not\(\.is-sovereign\) :is\(\.manager-portrait-frame, \.manager-introduction\) \{\s*animation: none;/,
  );
  // Lejas's loops: the scan is hidden at rest and the cue calls twice.
  assert.match(before, /\.manager-scanline \{\s*animation: none;\s*opacity: 0;/);
  assert.match(before, /\.manager-scroll-cue i::after \{\s*animation-iteration-count: 2;/);
  // Economy shows the related records and Dante's plate at rest.
  assert.match(
    before,
    /html\[data-world-effects="economy"\]\s*main\.manager-page:not\(\.is-sovereign\)\s*:is\(\.rider-archive-civilian, \.rider-nightmare-card, \.dante-entry-glitch\) \{\s*animation: none;/,
  );
  // Nothing animates outside the gated blocks.
  assert.doesNotMatch(
    before.replace(/animation: none;|animation-iteration-count: 2;/g, ""),
    /animation/,
  );
});

test("the arrival waits for the hand-over and is finite, compositor-only and gated", () => {
  const block = sheet.slice(motionStart, sheet.indexOf("@supports (animation-timeline: scroll())"));
  const animated = rules(block).filter(({ body }) => /animation(-delay)?:/.test(body));
  assert.ok(animated.length >= 10, String(animated.length));
  for (const { selector, body } of animated) {
    for (const part of splitSelector(selector)) {
      assert.match(
        part,
        /^html:not\(\[data-world-effects="economy"\]\):not\(\[data-loading\]\)\s/,
        part,
      );
      // Not re-keyed to the side menu or dialogs: closing one must not replay it.
      assert.doesNotMatch(part, /data-side-menu-open|data-dialog-open/);
    }
    assert.doesNotMatch(body, /infinite|animation-timeline/);
  }
  // The plate outranks the reader sheet's still image (#dossier-profile).
  assert.match(
    block,
    /#dossier-profile\s*\.manager-portrait-frame\s*> img \{\s*animation: dm-arrive-plate/,
  );
  // Every beat is short; the longest delay stays under a second.
  for (const [, ms] of block.matchAll(/(\d+)ms/g)) assert.ok(Number(ms) <= 1100, ms);
  // The name is struck with a backwards fill, so its ghost is not clipped at rest.
  assert.match(block, /animation: dm-arrive-name [^;]*backwards;/);
});

test("keyframes use only opacity, transforms and clip-path", () => {
  const frames = sheet.slice(keyframesStart);
  const bodies = [...frames.matchAll(/@keyframes ([\w-]+) \{([\s\S]*?)\n\}/g)];
  assert.ok(bodies.length >= 10, String(bodies.length));
  for (const [, name, body] of bodies) {
    for (const [, property] of body.matchAll(/([a-z-]+):/g)) {
      assert.ok(
        ["opacity", "transform", "translate", "scale", "clip-path"].includes(property),
        `${name}: ${property}`,
      );
    }
  }
});

test("the scroll depth is on the root scroller and holds under the menu and covers", () => {
  const depth = sheet.slice(
    sheet.indexOf("@supports (animation-timeline: scroll())"),
    keyframesStart,
  );
  assert.match(depth, /^@supports[^{]*\{\s*@media \(prefers-reduced-motion: no-preference\)/);
  // The push alone while a cover is down: economy and dialogs stop it; the
  // side menu and the load gate do not, so the plate never snaps back.
  assert.match(
    depth,
    /html:not\(\[data-world-effects="economy"\]\):not\(\[data-dialog-open\]\)\s*main\.manager-page:not\(\.is-sovereign\)\s*#dossier-profile[^{]*\{[^}]*animation: dm-depth-push linear both;\s*animation-timeline: scroll\(root block\);/,
  );
  assert.doesNotMatch(depth, /data-side-menu-open/);
  // The arrival joins only after the hand-over, ahead of the push.
  assert.match(
    depth,
    /html:not\(\[data-world-effects="economy"\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\)\s*main\.manager-page:not\(\.is-sovereign\)\s*#dossier-profile/,
  );
  assert.match(depth, /animation:\s*dm-arrive-plate [^,]+,\s*dm-depth-push linear both;/);
  assert.match(depth, /animation-timeline: auto, scroll\(root block\);/);
  const arrivalRules = depth.split("dm-arrive-plate").length - 1;
  assert.equal(arrivalRules, 1, "only the post-hand-over rule carries the arrival");
  assert.match(
    sheet,
    /@keyframes dm-depth-push \{\s*from \{\s*scale: 1;\s*\}\s*to \{\s*scale: 1\.06;/,
  );
});

test("every portrait frame carries the text-free wipe edge", async () => {
  const files = [
    "rider-page",
    "manager-stub",
    "related-page",
    "dante-page",
    "ciel-page",
    "yoake-mamori-page",
    "lejas-page",
  ];
  for (const name of files) {
    const source = await read(`src/components/world/${name}.tsx`);
    assert.equal(
      source.match(/<i className="dossier-arrive-scan" aria-hidden="true" \/>/g)?.length,
      1,
      name,
    );
  }
  assert.match(sheet, /\.dossier-arrive-scan \{[^}]*opacity: 0;[^}]*pointer-events: none;/);
  // The sovereign frame (Zeus) takes none: no dossier sheet styles it there.
  const stub = await read("src/components/world/manager-stub.tsx");
  assert.match(
    stub,
    /\{profile\.sovereign \? null : <i className="dossier-arrive-scan" aria-hidden="true" \/>\}/,
  );
});
