import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

// ILLUSIONCULUM SAGA's special site (owner, 2026-10-23: 「イリュージョンクルム
// サーガを追加。レクソナンスを参考に。」), registered wherever /far-from-saga is,
// its record the owner's own text, its scroll suit-up the shared engine with
// opt-in options only.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = read("src/components/illusionculum-saga/illusionculum-saga.tsx");
const suitup = read("src/components/illusionculum-saga/illusionculum-suitup.tsx");
const comparison = read("src/components/illusionculum-saga/illusionculum-comparison.tsx");
const route = read("src/routes/illusionculum-saga.tsx");
const menu = read("src/components/world/world-chrome.tsx");
const sections = read("src/lib/special-site-sections.ts");
const styles = read("src/styles-illusionculum-saga.css");
const suitStyles = read("src/styles-illusionculum-suitup.css");
// The owner's YOPS rule (scripts/yops-notation.test.mjs): the main compute of
// イリュージョンクルム, メタ・ウニタス and ファーフロム carries 「〜」. The only
// change the page makes to the owner's figures, so the sources are read with it.
const yops = (text) => text.replace(/(?<![\d,])(50000|60000)YOPS/g, "$1〜YOPS");
const ownerText = yops(read("design/illusionculum-saga-20261023/owner-text.md"));
const comparisonText = yops(read("design/illusionculum-saga-20261023/comparison-owner.md"));
const { ILLUSIONCULUM_SAGA, ILLUSIONCULUM_FORMS, ILLUSIONCULUM_COMPARISON } = await import(
  "../src/components/illusionculum-saga/illusionculum-data.ts"
);

test("the site has a route, its sheets in order, a menu tile, a route family and search", () => {
  assert.match(route, /createFileRoute\("\/illusionculum-saga"\)/);
  assert.match(route, /og:image", content: ILLUSIONCULUM_KEY_VISUAL\.src/);
  assert.match(route, /syncRexonanceLayoutGate\(\)/);
  const order = ["rexonanceSagaCssUrl", "illusionculumSagaCssUrl", "illusionculumSuitupCssUrl", "assemblyMovieCssUrl", "CINEMATIC_STYLESHEET_LINK,"];
  const at = order.map((name) => route.lastIndexOf(name.endsWith(",") ? name : `href: ${name}`));
  assert.ok(at.every((index, i) => index > 0 && (i === 0 || index > at[i - 1])), `sheet order ${at}`);
  assert.match(component, /<SideMenuLayer context="illusionculum"/);
  assert.match(sections, /illusionculum: "\/illusionculum-saga"/);
  assert.match(sections, /illusionculum: "イリュージョンクルムサーガ"/);
  for (const hash of ["overview", "specs", "comparison", "suitup", "forms", "armour", "arsenal", "abilities", "finishers"]) {
    assert.match(sections.slice(sections.indexOf("illusionculum: [")), new RegExp(`\\["${hash}", `), hash);
    assert.match(component + suitup + comparison, new RegExp(`id="${hash}"`), hash);
  }
  assert.match(read("src/lib/route-family.js"), /path === "\/illusionculum-saga"/);
  assert.match(read("src/lib/asset-loader.ts"), /export const ILLUSIONCULUM_SAGA_ENTER_ASSETS = \[ILLUSIONCULUM_HERO\.src\]/);
  assert.match(read("src/styles-stage-shell.css"), /a\[href\^="\/illusionculum-saga"\]/);
});

test("the SPECIAL tiles: ファーフロム first and larger, then イリュージョンクルム, メタ・ウニタス, レクソナンス, エクスプリーム", () => {
  const special = menu.slice(menu.indexOf("<p>SPECIAL</p>"), menu.indexOf("<p>STORIES</p>"));
  const names = [...special.matchAll(/<DisplayName value="([^"]+)" \/>/g)].map((m) => m[1]);
  assert.deepEqual(names, [
    "ファーフロムサーガ",
    "イリュージョンクルムサーガ",
    "メタ・ウニタスサーガ",
    "レクソナンスサーガ",
    "エクスプリームサーガ",
  ]);
  assert.match(special, /to="\/meta-unitas-saga"/);
  const shell = read("src/styles-stage-shell.css");
  assert.match(shell, /\[data-special-tiles\]\s*> a\[href\^="\/far-from-saga"\] \{\s*grid-column: 1 \/ -1;/);
  assert.match(shell, /\.side-panel-links\.side-panel-links\[data-special-tiles\] \{\s*grid-template-columns: minmax\(0, 1\.4fr\);\s*grid-auto-columns: minmax\(0, 1fr\);/);
  assert.match(shell, /url\("\/meta-unitas-saga-20261023\/middle-tile-400\.webp"\)/);
  assert.match(menu, /META_UNITAS_SAGA_ENTER_ASSETS/);
  assert.match(menu, /context === "meta-unitas" \|\|/);
});

test("every word of record is the owner's, verbatim (design/illusionculum-saga-20261023/owner-text.md)", () => {
  const strings = [
    ILLUSIONCULUM_SAGA.name,
    ILLUSIONCULUM_SAGA.ultraName,
    ...ILLUSIONCULUM_SAGA.calls,
    ...ILLUSIONCULUM_SAGA.overview,
    ...[...ILLUSIONCULUM_SAGA.armour, ...ILLUSIONCULUM_SAGA.arsenal, ...ILLUSIONCULUM_SAGA.abilities].flatMap(
      (article) => [article.title, ...article.body],
    ),
    ...ILLUSIONCULUM_SAGA.finishers.flatMap((finisher) => [finisher.name, ...finisher.calls, ...finisher.body]),
    ...Object.values(ILLUSIONCULUM_FORMS).flatMap((form) => [form.name, ...form.body]),
  ];
  for (const text of strings) assert.ok(ownerText.includes(text), text.slice(0, 40));
  // The spec rows: the owner's keys and values (the 走力's 「（調整案）」 note
  // is dropped, owner: 「その際注釈はつけないで」).
  for (const row of ILLUSIONCULUM_SAGA.specs) {
    assert.match(ownerText, new RegExp(`■${row.dt}[\\u3000 ]*：${row.dd.replace(/[.()／]/g, "\\$&")}`), row.dt);
    for (const sub of row.sub) assert.ok(ownerText.includes(sub), sub);
  }
  assert.ok(!JSON.stringify(ILLUSIONCULUM_SAGA.specs).includes("調整案"));
  // The page renders the record from the data, never a copy.
  assert.match(component, /ILLUSIONCULUM_SAGA\.overview/);
  assert.match(component, /ILLUSIONCULUM_SAGA\.specs/);
  assert.match(component, /ILLUSIONCULUM_SAGA\.finishers\.map/);
  assert.doesNotMatch(component, /月城悠真が『エクスサーガドライバー』/);
});

test("the comparison: the owner's passages with only the Rexonance comparisons removed, never against レクソナンス", () => {
  const paragraphs = comparisonText.split("\n").filter(Boolean);
  const passages = ILLUSIONCULUM_COMPARISON.sections.flatMap((section) => section.body);
  for (const passage of passages) {
    if (passage.added) continue;
    // Its fragments, in order, inside one of the owner's paragraphs.
    const source = paragraphs.find((paragraph) => {
      let from = 0;
      return passage.fragments.every((fragment) => {
        const at = paragraph.indexOf(fragment, from);
        if (at < 0) return false;
        from = at + fragment.length;
        return true;
      });
    });
    assert.ok(source, passage.fragments[0].slice(0, 30));
  }
  const all = JSON.stringify(ILLUSIONCULUM_COMPARISON);
  assert.doesNotMatch(all, /レクソナンス|REXONANCE/);
  assert.doesNotMatch(all, /未確定|暫定|設定案/);
  for (const title of ["基本性能比較", "統合演算・加速機構比較", "イリュージョンクルムサーガの性能評価", "支援・戦闘機能の比較", "P14・P16の技術的な差", "総合評価"])
    assert.ok(all.includes(title), title);
  assert.match(comparison, /ILLUSIONCULUM_COMPARISON/);
});

test("the added ウルトラ figures sit above the standard form and below ファーフロム, and its gain adds up", () => {
  const rows = Object.fromEntries(ILLUSIONCULUM_COMPARISON.basic.rows.map((row) => [row.cells[0], row]));
  const value = (cell) => Number.parseFloat(cell.replace(/[^\d.]/g, ""));
  const standard = rows["イリュージョンクルム"].cells.slice(1).map(value);
  const ultra = rows["イリュージョンクルム・ウルトラ"].cells.slice(1).map(value);
  const farFrom = rows["ファーフロム"].cells.slice(1).map(value);
  assert.equal(rows["イリュージョンクルム・ウルトラ"].added, true);
  for (let i = 0; i < 3; i += 1) assert.ok(standard[i] < ultra[i] && ultra[i] <= farFrom[i], `column ${i}`);
  assert.ok(standard[3] > ultra[3] && ultra[3] > farFrom[3], "the 100 m: faster than standard, slower than ファーフロム");
  const gain = ILLUSIONCULUM_COMPARISON.sections[0].body.find((passage) => passage.added).fragments.join("");
  const percent = (a, b) => (((a - b) / b) * 100).toFixed(2);
  assert.ok(gain.includes(`パンチ力は${percent(ultra[0], standard[0])}%`));
  assert.ok(gain.includes(`キック力は${percent(ultra[1], standard[1])}%`));
  assert.ok(gain.includes(`ジャンプ力は${Math.round(((ultra[2] - standard[2]) / standard[2]) * 100)}%`));
  assert.ok(gain.includes(`パンチ力が${((1 - ultra[0] / farFrom[0]) * 100).toFixed(2)}%`));
  assert.ok(gain.includes(`キック力が${((1 - ultra[1] / farFrom[1]) * 100).toFixed(2)}%`));
  // The owner's own standard-form figures are unchanged.
  assert.deepEqual(rows["イリュージョンクルム"].cells, ["イリュージョンクルム", "328.8t", "405.8t", "5000m", "0.00024秒"]);
});

test("the four key visuals, cutouts, details and orbs are one versioned, budgeted set", () => {
  const caps = { 640: 200_000, 960: 350_000, 1280: 480_000 };
  for (const stem of ["standard", "more", "ultra", "ultra-more"]) {
    for (const [width, cap] of Object.entries(caps)) {
      const file = new URL(`../public/illusionculum-saga-20261023/${stem}-${width}.webp`, import.meta.url);
      assert.ok(statSync(file).size <= cap, `${stem}-${width}`);
    }
    for (const width of [480, 960])
      assert.ok(existsSync(new URL(`../public/illusionculum-saga-20261023/cutout-${stem}-${width}.webp`, import.meta.url)));
    assert.ok(existsSync(new URL(`../design/illusionculum-saga-20261023/key-${stem}.jpg`, import.meta.url)));
    assert.ok(existsSync(new URL(`../design/illusionculum-saga-20261023/cutout-${stem}.webp`, import.meta.url)));
  }
  assert.ok(statSync(new URL("../public/illusionculum-saga-20261023/standard-tile-400.webp", import.meta.url)).size <= 80_000);
  for (const side of ["left", "right"])
    for (const form of ["standard", "ultra"])
      assert.ok(existsSync(new URL(`../public/illusionculum-saga-20261023/orb-${side}-${form}-256.webp`, import.meta.url)));
});

test("the suit is cut by SAM's masks, every plate has its mask, and the four forms share the frame", async () => {
  const manifest = JSON.parse(read("design/illusionculum-saga-20261023/sam-masks/manifest.json"));
  assert.equal(manifest.site, "illusionculum");
  assert.match(manifest.model.id, /sam2\.1-hiera-large/);
  const suit = await import("../src/lib/illusionculum-suit.ts");
  const ids = suit.ILLUSIONCULUM_SUIT_PIECES.map((piece) => piece.id);
  for (const id of ids) {
    if (suit.ILLUSIONCULUM_SUIT_DRIVER.includes(id)) continue;
    assert.ok(manifest.plates[id], `${id}: SAM's mask`);
    assert.ok(existsSync(new URL(`../design/illusionculum-saga-20261023/sam-masks/plates/${id}.png`, import.meta.url)));
  }
  assert.ok(ids.length >= 30);
  for (const file of suit.ILLUSIONCULUM_SUIT_ASSETS) assert.ok(existsSync(new URL(`../public${file}`, import.meta.url)), file);
  const build = read("scripts/build-illusionculum-suit.mjs");
  // The build fails on a frame offset or a pixel left over or doubled.
  assert.match(build, /off the standard frame by/);
  assert.match(build, /the plates do not tile the figure/);
  assert.match(read("scripts/sam/make_masks.py"), /"illusionculum": ROOT \/ "design\/illusionculum-saga-20261023" \/ "sam-masks"/);
});

test("the engine's new options are opt-in: Rexonance and FAR FROM pass none of them", () => {
  const engine = read("src/lib/rexonance-resonance.js");
  assert.match(engine, /const FIRE = config\.fire !== false;/);
  assert.match(engine, /const flame = FIRE \? naniteFlameEnvelope\(flamePhase\) : 0;/);
  assert.match(engine, /\(formPaths\?\.\[form\] \?\? formChain\.slice\(0, formChain\.indexOf\(form\) \+ 1\)\)/);
  const farFrom = read("src/lib/far-from-assembly-engine.ts");
  assert.doesNotMatch(farFrom, /\bfire:|\bpaths:/);
  assert.doesNotMatch(read("src/components/rexonance-saga/rexonance-saga.tsx"), /\bfire: false|\bpaths:/);
  const own = read("src/lib/illusionculum-assembly-engine.ts");
  assert.match(own, /fire: false,/);
  assert.match(own, /generation: createIllusionculumProjection\(/);
  assert.match(own, /paths: ILLUSIONCULUM_FORM_PATHS,/);
  assert.match(own, /reactorRadius: 0,/);
});

test("the projection draws closed-form, allocating nothing in a frame", () => {
  const layer = read("src/lib/illusionculum-projection.ts");
  const frame = layer.slice(layer.indexOf("draw(context, progress, calm)"), layer.indexOf("release() {"));
  assert.ok(frame.length > 1000);
  assert.doesNotMatch(frame, /\bnew\b|create(Linear|Radial)Gradient|\[\]|\{\s*\w+:|Array\.from|\.map\(|\.filter\(|performance\.now|Date\.now|Math\.random/);
});

test("the sheets: motion once and only where allowed, no loops, the 12px floor", () => {
  for (const css of [styles, suitStyles]) {
    assert.doesNotMatch(css, /\binfinite\b/);
    for (const [, size] of css.matchAll(/font-size: (\d+(?:\.\d+)?)px/g)) assert.ok(Number(size) >= 12, `font-size ${size}px`);
    for (const [, size] of css.matchAll(/font: \d+ (\d+(?:\.\d+)?)px/g)) assert.ok(Number(size) >= 12, `font ${size}px`);
  }
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*html:not\(\[data-world-effects="economy"\]\)\s*\.rxs-page\.rxs-page\.ics-page\[data-motion-ready="true"\]/);
  // The ウルトラ crimson arrives slowly (a ramp, never a flash).
  assert.match(styles, /transition: opacity 1600ms/);
  assert.match(component, /data-ultra=\{isUltra\(form\) \? "true" : undefined\}/);
});

test("no secondary labels: no English kickers, counters or helper text on the page", () => {
  for (const source of [component, suitup, comparison]) {
    assert.doesNotMatch(source, /<p lang="en">[A-Z ]+<\/p>/);
    assert.doesNotMatch(source, /rzn-kicker|rzn-phase|rzn-hint|rzn-percent|rzn-count|rzn-parts|rxs-stage-hint/);
    assert.doesNotMatch(source, /タップ|スワイプ|長押し|SCROLL/);
  }
});

test("the entry transformation plays in the route transition screen, the owner's calls, once", async () => {
  const gate = read("src/components/load-gate.tsx");
  assert.match(gate, /"\/illusionculum-saga": "illusionculum"/);
  assert.match(gate, /illusionculum: ILLUSIONCULUM_ENTRY_TIMINGS,/);
  assert.match(gate, /const illusionculum = variant === "illusionculum" && scene\?\.tier === "full";/);
  assert.match(gate, /<IllusionculumEntrySequence phase=\{phase\} \/>/);
  const entry = await import("../src/lib/illusionculum-entry.ts");
  assert.deepEqual([...entry.ILLUSIONCULUM_ENTRY_CALLS], [...ILLUSIONCULUM_SAGA.calls]);
  const css = read("src/styles-illusionculum-entry.css");
  assert.doesNotMatch(css, /\binfinite\b/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ice-entry,\s*\.ice-entry \* \{\s*animation: none !important;/);
  assert.match(read("src/routes/__root.tsx"), /href: illusionculumEntryCss/);
  assert.match(read("src/styles-route-transitions.css") + css, /\.is-illusionculum-dive/);
});

test("the site is registered wherever the other special sites are", () => {
  assert.match(read("src/components/search/search-ui-helpers.ts"), /"\/illusionculum-saga"\) return "ILLUSIONCULUM SAGA"/);
  assert.match(read("src/components/search/search-data.ts"), /to: "\/illusionculum-saga",/);
  assert.match(read("src/lib/library-data.ts"), /path: "\/illusionculum-saga"/);
  assert.match(read("src/lib/record-art.ts"), /"\/illusionculum-saga": \{/);
  assert.match(read("server/lib/public-document-cache.ts"), /"\/illusionculum-saga"/);
  assert.match(read("scripts/verify-public-deployment.mjs"), /"\/illusionculum-saga"/);
  assert.match(read("scripts/verify-site-health.mjs"), /"\/illusionculum-saga"/);
});
