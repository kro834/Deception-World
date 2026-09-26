import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MIRAGE_BOOT_GATE_SCRIPT } from "../src/lib/mirage-boot-gate.js";
import { withWordBreaks } from "../src/lib/name-breaks.ts";

// The leftovers of the 2026-09-26 polish: the Zeus button on titles, names
// broken mid-word on narrow phones, the skip link's silent landing and the
// cold deep link to /world#manager-archive.

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");

const zeus = read("src/components/zeus-button.tsx");
const skip = read("src/components/skip-link.tsx");
const loadGate = read("src/components/load-gate.tsx");
const transitions = read("src/styles-route-transitions.css");

test("the Zeus button steps off titles and control labels, measured by their glyphs", () => {
  const list = zeus.slice(
    zeus.indexOf("const ZEUS_AVOID_TEXT_SELECTOR = ["),
    zeus.indexOf('].join(",");', zeus.indexOf("const ZEUS_AVOID_TEXT_SELECTOR")),
  );
  for (const selector of ['"h1"', '"h2"', '"h3"', '"h4"', '"a[href]"', '"button"', '"summary"']) {
    assert.ok(list.includes(selector), selector);
  }
  assert.ok(list.includes(`'[role="tab"]'`));
  // Glyph boxes, not element boxes: a wide heading or a card link moves it
  // only when it would cover the words.
  assert.match(
    zeus,
    /range\.selectNodeContents\(node\);\s*for \(const rect of Array\.from\(range\.getClientRects\(\)\)\)/,
  );
  // Display figures count as titles; at the end of the page every word does.
  assert.match(zeus, /const ZEUS_DISPLAY_TEXT_MIN_PX = 24;/);
  assert.match(zeus, /if \(pageEnd && root === document\) collect\(ZEUS_END_TEXT_SELECTOR\);/);
  // Words kept for screen readers only (a clipped 1px box) do not count.
  assert.match(zeus, /if \(holder && \(holder\.width < 2 \|\| holder\.height < 2\)\) continue;/);
  // A spot the reader has just dropped it on is theirs until the page scrolls.
  assert.match(zeus, /const words = droppedHere\.current\s*\?\s*\[\]\s*:\s*readAvoidText\(/);
  assert.match(
    zeus,
    /if \(wasHeld && !cancelled\) \{\s*droppedHere\.current = true;\s*moveToPointer\(event\.clientX, event\.clientY\);/,
  );
  assert.match(
    zeus,
    /const onScroll = \(\) => \{\s*if \(activePointer\.current != null\) return;\s*droppedHere\.current = false;/,
  );
  // Inside a dialog only the dialog's own words count.
  assert.match(zeus, /const root: ParentNode = button\.closest\("dialog"\) \?\? document;/);
  // The read happens once scrolling settles, never on each scroll frame.
  assert.match(zeus, /placementTimer\.current = window\.setTimeout\(\(\) => \{/);
});

test("the Zeus button tries the near spots first and stays home when controls fill them", () => {
  const order = [
    "{ x: preferred.x, y: preferred.y - lift * 2 },",
    "{ x: preferred.x, y: preferred.y + lift },",
    "{ x: preferred.x, y: preferred.y - lift * 3 },",
    "{ x: preferred.x, y: mirrorY },",
  ].map((candidate) => zeus.indexOf(candidate));
  assert.ok(
    order.every((index) => index > 0),
    String(order),
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
  assert.match(
    zeus,
    /if \(obstructed\) continue;\s*const covered = coveredWords\(candidateRect\);\s*if \(covered === 0\) return candidate;/,
  );
  assert.match(zeus, /return fallback\?\.candidate \?\? candidates\[0\] \?\? preferred;/);
});

test("the skip link marks where reading starts, for keyboard use only", () => {
  // Enter reaches the link as a click with no pointer detail.
  assert.match(skip, /const mark = event\.detail === 0 \? skipMark\(target\) : null;/);
  assert.match(skip, /if \(mark\) mark\.dataset\.skipMark = "true";/);
  assert.match(skip, /mark\?\.removeAttribute\("data-skip-mark"\);\s*\},\s*\{ once: true \},/);
  // A heading kept for screen readers only is marked by its drawn block.
  assert.match(
    skip,
    /function skipMark\(target: HTMLElement\)[\s\S]*?box\.width > 8 && box\.height > 8/,
  );
  // A page without a heading reads in its embedded document, whose frame is
  // shown briefly while focus stays inside it.
  assert.match(
    skip,
    /querySelectorAll<HTMLElement>\("main iframe\[title\]"\)\)\.find\(shown\) \?\?\s*document\.querySelector<HTMLElement>\("main"\);/,
  );
  assert.match(skip, /target instanceof HTMLIFrameElement/);
  // Route arrivals keep their unmarked reading position.
  assert.match(transitions, /\[data-route-focus="true"\]:focus \{\s*outline: none;\s*\}/);
  assert.match(
    transitions,
    /html \[data-skip-mark="true"\]\[data-skip-mark\] \{\s*outline: 2px solid rgb\(255 240 181 \/ 80%\);\s*outline-offset: 8px;\s*\}/,
  );
  assert.match(
    transitions,
    /html :is\(main, iframe\)\[data-skip-mark="true"\]\[data-skip-mark\] \{\s*outline-offset: -4px;/,
  );
});

test("a cold deep link to /world lands in one jump under the header", () => {
  const runGate = (hash, readyState = "loading") => {
    const attributes = new Map();
    new Function("document", "navigator", "window", MIRAGE_BOOT_GATE_SCRIPT)(
      {
        readyState,
        documentElement: { setAttribute: (key, value) => attributes.set(key, value) },
      },
      { userAgent: "Mozilla/5.0 (Macintosh) Chrome/140.0.0.0", maxTouchPoints: 0 },
      { sessionStorage: { getItem: () => null }, location: { hash } },
    );
    return attributes;
  };
  assert.equal(runGate("#manager-archive").get("data-route-scroll-settling"), "true");
  assert.equal(runGate("").has("data-route-scroll-settling"), false);
  // A client-side arrival at /world re-runs the script: no hold nobody releases.
  assert.equal(runGate("#manager-archive", "complete").has("data-route-scroll-settling"), false);
  assert.match(
    transitions,
    /html\[data-route-scroll-settling="true"\] \{\s*scroll-behavior: auto !important;/,
  );
  // The provider takes the hold over before the router lands, aligns the
  // landing while the page settles, and lets it go.
  const cold = loadGate.slice(loadGate.indexOf("// A deep link opened from outside the site"));
  assert.match(
    cold,
    /useLayoutEffect\(\(\) => \{\s*if \(!window\.location\.hash\) return;\s*const releaseScrollMotion = holdRouteScrollMotion\(\);/,
  );
  assert.match(
    cold,
    /if \(!hash \|\| hash === "top" \|\| !document\.getElementById\(hash\)\) \{\s*releaseScrollMotion\(\);/,
  );
  assert.match(
    cold,
    /void settleRouteHash\(hash\)\.finally\(\(\) => window\.setTimeout\(releaseScrollMotion, 360\)\);/,
  );
});

test("display names break between their words, never inside one", () => {
  const seam = "​";
  const cases = [
    ["レクソナンスサーガ", `レクソナンス${seam}サーガ`],
    ["エクスプリームサーガ", `エクスプリーム${seam}サーガ`],
    ["ファーフロムサーガ", `ファーフロム${seam}サーガ`],
    ["サイファー・ブラックサイト", `サイファー・${seam}ブラックサイト`],
    ["仮面ライダードレッド", `仮面ライダー${seam}ドレッド`],
    ["仮面ライダールパン", `仮面ライダー${seam}ルパン`],
    ["ロードケイオス", `ロード${seam}ケイオス`],
    ["ロードナイト", `ロード${seam}ナイト`],
    ["ロイヤル／ラース／ネハン", `ロイヤル／${seam}ラース／${seam}ネハン`],
    ["サーガ", "サーガ"],
    ["ローア", "ローア"],
    ["仮面ライダー", "仮面ライダー"],
    ["レルムロイヤル", "レルムロイヤル"],
  ];
  for (const [name, shown] of cases) {
    assert.equal(withWordBreaks(name), shown, name);
    assert.equal(withWordBreaks(name).replaceAll(seam, ""), name, name);
  }

  // The stored names are unchanged; each title shows the seams.
  const stub = read("src/components/world/manager-stub.tsx");
  assert.match(stub, /const rider = \{ \.\.\.record, name: withWordBreaks\(record\.name\) \};/);
  for (const label of ["の記録`", "のフォームビジュアル`", "をピックアップ`"]) {
    assert.ok(stub.includes(`\${record.name}${label}`), label);
  }
  assert.match(
    read("src/components/world/rider-page.tsx"),
    /<b>\{withWordBreaks\(rider\.special\.name\)\}<\/b>/,
  );
  assert.match(
    read("src/components/world/ciel-page.tsx"),
    /<b>\{withWordBreaks\(SAGA\.special\.name\)\}<\/b>/,
  );
  const finalStage = read("src/components/final-stage/final-stage.tsx");
  assert.equal(finalStage.split("<b>{withWordBreaks(name)}</b>").length - 1, 2);
  assert.equal(finalStage.split("<em>{withWordBreaks(sub)}</em>").length - 1, 2);
  assert.match(
    read("src/components/dream-chapter/dream-chapter.tsx"),
    /<b>\{withWordBreaks\(record\.name\)\}<\/b>/,
  );

  // Their styles keep katakana whole, so the seams are the only breaks.
  const dossier = read("src/styles-dossier-reader.css");
  assert.match(
    dossier,
    /main\.manager-page :is\(\.form-pickup-copy, \.form-pickup-heading, \.rider-special-site-copy\) h2 b \{\s*word-break: keep-all;\s*overflow-wrap: anywhere;/,
  );
  assert.match(
    read("src/styles-final-stage.css"),
    /:is\(\.fst-pickup-copy h3, \.fst-pickup-heading h2\) b,\s*:is\(\.fst-pickup-copy, \.fst-pickup-heading\) em \{\s*word-break: keep-all;/,
  );
});

test("narrow phones keep short labels and figures whole", () => {
  const dossier = read("src/styles-dossier-reader.css");
  assert.match(
    dossier,
    /@media \(max-width: 359px\) \{\s*main\.manager-page \.rider-special-site-copy h2 \{\s*font-size: 26px;/,
  );
  assert.match(dossier, /\.dossier-contents-copy b \{[^}]*text-wrap: balance;/);
  assert.match(
    dossier,
    /main\.manager-page \.sovereign-status-copy > small \{\s*text-wrap: balance;/,
  );
  assert.match(
    read("src/styles-final-stage.css"),
    /@media \(max-width: 359px\) \{\s*\.fst-page \.rxs-footer h2 \{\s*font-size: 28px;/,
  );
  assert.match(
    read("src/styles-world/rexonance-pickup.css"),
    /font-size: clamp\(28px, 8\.5vw, 42px\);/,
  );

  const rexonance = read("src/styles-rexonance-saga.css");
  assert.match(rexonance, /\.rxs-comparison-key \{\s*display: flex;\s*flex-wrap: wrap;/);
  assert.match(rexonance, /\.rxs-section-heading > span \{[^}]*word-break: auto-phrase;/);
  assert.match(
    rexonance,
    /\.rxs-p14-metrics article > small \{[^}]*word-break: auto-phrase;\s*text-wrap: balance;/,
  );
  assert.match(rexonance, /\.rxs-p14-values strong \{\s*color: #effaff;\s*word-break: keep-all;/);
  assert.match(
    read("src/styles-saga-showcase.css"),
    /@media \(max-width: 359px\) \{\s*\.rxs-page\.rxs-page \.rxs-p14-values strong \{\s*font-size: 22px;/,
  );
  assert.match(
    read("src/styles-final-stage.css"),
    /\.fst-cast-copy strong \{[^}]*word-break: auto-phrase;/,
  );

  const taisho = read("src/styles-dream-taisho.css");
  const narrow = taisho.slice(taisho.indexOf("@media (max-width: 359px) {"));
  assert.match(
    narrow,
    /\.dream-dolminence-grid button\.ios26-glass \{\s*grid-template-columns: minmax\(0, 0\.7fr\) minmax\(0, 1fr\);/,
  );
  assert.match(narrow, /\.dream-dolminence-copy b \{\s*font-size: 17px;/);
  assert.match(narrow, /\.dream-story-case-status \{\s*grid-column: 2;\s*grid-row: 2;/);
  assert.match(narrow, /\.dream-story-case-toggle \{\s*grid-column: 3;/);

  assert.match(
    read("src/styles-world-programme-sections.css"),
    /@media \(max-width: 359px\) \{[\s\S]*?\.poster-lock b \{\s*font-size: 11px;\s*word-break: keep-all;/,
  );
});
