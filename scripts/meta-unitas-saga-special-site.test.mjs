import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// META UNITAS SAGA's special site (owner's record, 2026-10-23): the route,
// its registrations, the owner's words verbatim, the comparison under the
// owner's rules, the SAM-cut suit-up and its motion terms.
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(`../${path}`, import.meta.url));
const page = read("src/components/meta-unitas-saga/meta-unitas-saga.tsx");
const suitup = read("src/components/meta-unitas-saga/meta-unitas-suitup.tsx");
const performance = read("src/components/meta-unitas-saga/meta-unitas-performance.tsx");
const parts = read("src/components/meta-unitas-saga/meta-unitas-parts.tsx");
const route = read("src/routes/meta-unitas-saga.tsx");
const styles = read("src/styles-meta-unitas-saga.css");
const gate = read("src/components/load-gate.tsx");
const owner = read("design/meta-unitas-saga-20261023/owner-text.md");
const comparison = read("design/meta-unitas-saga-20261023/comparison-owner-20261023.md");

const { META_UNITAS_SAGA, META_UNITAS_PERFORMANCE } =
  await import("../src/components/meta-unitas-saga/meta-unitas-data.ts");
const sections = await import("../src/lib/special-site-sections.ts");
const artwork = await import("../src/lib/meta-unitas-saga-artwork.ts");
const suit = await import("../src/lib/meta-unitas-rx-suit.ts");

test("the route is registered wherever the other special sites are", () => {
  assert.match(route, /createFileRoute\("\/meta-unitas-saga"\)/);
  assert.match(route, /title: "メタ・ウニタスサーガ｜META UNITAS SAGA — Deception World"/);
  assert.match(route, /styles-meta-unitas-saga\.css\?url/);
  assert.match(route, /og:image", content: META_UNITAS_KEY_VISUAL\.src/);
  assert.equal(sections.SPECIAL_SITE_PATHS["meta-unitas"], "/meta-unitas-saga");
  assert.equal(sections.SPECIAL_SITE_TITLES["meta-unitas"], "メタ・ウニタスサーガ");
  assert.match(page, /<SideMenuLayer context="meta-unitas"/);
  assert.match(read("src/lib/route-family.js"), /path === "\/meta-unitas-saga"/);
  assert.match(read("server/lib/public-document-cache.ts"), /"\/meta-unitas-saga"/);
  assert.match(
    read("src/lib/asset-loader.ts"),
    /export const META_UNITAS_SAGA_ENTER_ASSETS = \[\s*META_UNITAS_RX_UNDERSUIT,\s*META_UNITAS_RX_DRIVER_STANDIN,\s*META_UNITAS_KEY_VISUAL\.src,\s*\]/,
  );
  assert.match(read("src/lib/record-art.ts"), /"\/meta-unitas-saga": \{/);
  assert.match(read("src/components/search/search-data.ts"), /id: "meta-unitas-saga"/);
  assert.match(read("src/components/search/search-ui-helpers.ts"), /"\/meta-unitas-saga"/);
  assert.match(read("scripts/verify-site-health.mjs"), /"\/meta-unitas-saga"/);
  // Preparation does not consume playback; the live renderer releases its cover.
  assert.match(gate, /"\/meta-unitas-saga": "meta-unitas"/);
  assert.match(gate, /createMetaUnitasEntryPlayback\(\)/);
  assert.match(gate, /await clock\.wait\(metaUnitasPlayback\.promise\)/);
  assert.match(gate, /META_UNITAS_ENTRY_TIMINGS/);
});

test("every section the menu and the search list is a real anchor on the page", () => {
  const source = page + suitup + performance.replace('id={isP16 ? "p16" : undefined}', 'id="p16"');
  for (const [hash] of sections.SPECIAL_SITE_SECTIONS["meta-unitas"]) {
    assert.ok(source.includes(`id="${hash}"`), hash);
  }
  // The bar: five chapters, in the page's order.
  const bar = [
    ...page.matchAll(/<a href="#([a-z]+)"[^>]*>\s*<span aria-hidden="true">(\d\d)<\/span>/g),
  ];
  assert.deepEqual(
    bar.map((m) => m[1]),
    ["overview", "suitup", "system", "stages", "arsenal"],
  );
  assert.deepEqual(
    bar.map((m) => m[2]),
    ["01", "02", "03", "04", "05"],
  );
});

test("the menu thumbnail and the key visuals are one versioned, budgeted set", () => {
  assert.equal(artwork.META_UNITAS_MENU_TILE, "/meta-unitas-saga-20261023/middle-tile-400.webp");
  const tile = statSync(new URL(`../public${artwork.META_UNITAS_MENU_TILE}`, import.meta.url));
  assert.ok(tile.size < 80_000, `menu tile ${tile.size}`);
  const caps = { 640: 200_000, 960: 350_000, 1280: 480_000 };
  for (const stage of artwork.META_UNITAS_STAGE_ORDER)
    for (const width of artwork.META_UNITAS_ARTWORK_WIDTHS) {
      const file = `public/meta-unitas-saga-20261023/${stage}-${width}.webp`;
      assert.ok(exists(file), file);
      assert.ok(statSync(new URL(`../${file}`, import.meta.url)).size <= caps[width], file);
    }
  for (const name of ["middle.jpg", "ultra.webp"])
    assert.ok(exists(`design/meta-unitas-saga-20261023/key-visual/${name}`));
});

test("the words are the owner's: generated from the record, current, every line placed", () => {
  const run = spawnSync(process.execPath, ["scripts/build-meta-unitas-data.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.deepEqual(META_UNITAS_SAGA.names, [
    "仮面ライダーメタ・ウニタスサーガ",
    "仮面ライダーメタ・ウニタスサーガ・ウルトラ",
  ]);
  assert.deepEqual(META_UNITAS_SAGA.calls, [
    "【META！UNITAS！】",
    "【REXONANCE！】",
    "【DIVINEST！RIDER！】",
    "【SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！！！】",
    "【META UNITAS！】",
  ]);
  // Every prose line of the record is in the data as written.
  const data = JSON.stringify({ ...META_UNITAS_SAGA });
  for (const line of owner.split("\n")) {
    const text = line.trim();
    if (text.length > 40)
      assert.ok(data.includes(JSON.stringify(text).slice(1, -1)), text.slice(0, 30));
  }
  // ミドル／ウルトラ side by side, split only where both sides are one quantity.
  const dual = META_UNITAS_SAGA.specs.filter((row) => "middle" in row).map((row) => row.key);
  assert.deepEqual(dual, ["身長", "体重", "パンチ力", "キック力", "ジャンプ力", "走力"]);
  for (const row of META_UNITAS_SAGA.specs)
    if ("middle" in row) assert.equal(`${row.middle}／${row.ultra}`, row.value);
  const processors = META_UNITAS_SAGA.specs.find((row) => row.key === "副演算");
  assert.deepEqual(processors.more, [
    "『Paranormal Realizer Ultra』",
    "『Neural Resonancer Ultra』",
    "『P16』",
  ]);
  // Headings print the record's own brackets and readings.
  assert.match(parts, /<span className="mus-bracket">『 <\/span>/);
  assert.equal(META_UNITAS_SAGA.abilities[0].title, "『 DIVISIBILITY GRANT 』（可分性付与）");
});

test("the comparison: Meta Unitas's parts, no Rexonance, no provisos, removal only", () => {
  const text = JSON.stringify(META_UNITAS_PERFORMANCE);
  for (const word of ["レクソナンス", "REXONANCE", "暫定", "未確定", "設定案", "確定していない"])
    assert.ok(!text.includes(word), word);
  assert.ok(!text.includes("イリュージョンクルムサーガの性能評価"));
  // Each paragraph is one of the owner's with passages removed and nothing
  // else changed: it is a subsequence of a source paragraph, and every run
  // removed names Rexonance or is a proviso.
  const sourceParagraphs = comparison
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const removedRuns = (paragraph, source) => {
    const runs = [];
    let i = 0;
    let run = "";
    for (const char of source) {
      if (i < paragraph.length && char === paragraph[i]) {
        if (run) runs.push(run);
        run = "";
        i += 1;
      } else run += char;
    }
    if (run) runs.push(run);
    return i === paragraph.length ? runs : null;
  };
  for (const chapter of META_UNITAS_PERFORMANCE.chapters)
    for (const paragraph of chapter.body) {
      const candidates = sourceParagraphs
        // The owner's YOPS rule adds 「〜」 to 50000 / 60000 (yops-notation.test.mjs).
        .map((source) => removedRuns(paragraph.replace(/〜YOPS/g, "YOPS"), source))
        .filter(Boolean)
        .sort((a, b) => a.join("").length - b.join("").length);
      assert.ok(candidates.length, paragraph.slice(0, 24));
      for (const run of candidates[0])
        assert.match(run, /レクソナンス|暫定|設定案|確定していない|未確定/, run);
    }
  const compute = META_UNITAS_PERFORMANCE.chapters.find(
    (c) => c.title === "統合演算・加速機構比較",
  );
  assert.deepEqual(
    compute.table.rows.map((row) => row[0]),
    [
      "ヴィンクルム",
      "エクスプリーム",
      "イリュージョンクルム",
      "メタ・ウニタス",
      "メタ・ウニタスULTRA",
      "ファーフロム",
    ],
  );
  // ULTRA keeps the standard form's computation (the owner's own words).
  assert.deepEqual(compute.table.rows[4], [
    "メタ・ウニタスULTRA",
    "50000〜YOPS",
    "9000TOPS",
    "P16",
  ]);
  const p16 = META_UNITAS_PERFORMANCE.chapters.find((c) => c.title.startsWith("P14"));
  assert.ok(
    p16.body.some((p) => p.startsWith("P16はP14 Extreme Tuning比で実効演算加速性能50%向上")),
  );
});

test("no secondary labels: no kicker, caption, counter or hint on the page", () => {
  const all = page + suitup + performance + parts;
  for (const label of [
    "OVERVIEW",
    "SUIT-UP",
    "SPEC SHEET",
    "KEY VISUAL",
    "NANITE",
    "SCROLL",
    "スクロールで",
    "タップ・長押し",
    "FINAL FORM",
    "STAGES",
    "CALL SEQUENCE",
  ])
    assert.ok(!all.includes(label), label);
  assert.ok(!/<p lang="en">/.test(page), "no English kicker");
  // The engine's read-out element exists for it, hidden; no percentage shows.
  assert.match(suitup, /<p className="rzn-readout" hidden>/);
  assert.ok(!/%<\//.test(all), "no percentage read-out");
});

test("the suit-up assembles as Rexonance's: its engine, Meta Unitas' SAM-cut suit", () => {
  // Owner (2026-10-23): 「メタ・ウニタスはレクソナンスと同じ装着です」.
  const engine = read("src/lib/meta-unitas-rx-engine.ts");
  assert.match(engine, /import \{ mountRexonanceAssembly/);
  assert.match(
    engine,
    /mountRexonanceAssembly\(\s*runway,\s*\{ \.\.\.metaUnitasAssemblyConfig\(\), eager: options\.eager \},\s*environment,?\s*\)/,
  );
  assert.ok(!/fire: false|generation:/.test(engine), "the fire and the nanites stay Rexonance's");
  assert.match(read("src/lib/meta-unitas-assembly.ts"), /import\("\.\/meta-unitas-rx-engine"\)/);
  assert.match(suitup, /className="mus-runway rzn-suitup"/);
  assert.match(suitup, /className="rzn-canvas"/);
  // The plates are SAM's: every mask is a plate, the driver its outline.
  const dir = "design/meta-unitas-saga-20261023/sam-masks/middle";
  const manifest = JSON.parse(read(`${dir}/manifest.json`));
  assert.equal(manifest.model.id, "facebook/sam2.1-hiera-large");
  const masks = readdirSync(new URL(`../${dir}/plates`, import.meta.url)).map((f) =>
    f.replace(/\.png$/, ""),
  );
  const plates = suit.META_UNITAS_RX_PIECES.map((piece) => piece.id);
  assert.deepEqual(plates.filter((id) => id !== "belt").sort(), [...masks].sort());
  assert.deepEqual(suit.META_UNITAS_RX_DRIVER, ["belt"]);
  for (const piece of suit.META_UNITAS_RX_PIECES) {
    assert.ok(piece.ax + piece.w <= suit.META_UNITAS_RX_ATLAS.width, piece.id);
    assert.ok(piece.ay + piece.h <= suit.META_UNITAS_RX_ATLAS.height, piece.id);
  }
  const groups = (group) => suit.META_UNITAS_RX_PIECES.filter((p) => p.group === group).length;
  assert.equal(groups("tail"), 8);
  assert.equal(groups("bits"), 5); // the four bits and the halo
  // ウルトラ is the chain's one form, the owner's cutout in the same frame.
  assert.match(suit.META_UNITAS_RX_FORMS.ultra, /^\/meta-unitas-rx-suit-20261023\/ultra\.webp$/);
  const folder = new URL("../public/meta-unitas-rx-suit-20261023/", import.meta.url);
  const total = readdirSync(folder).reduce(
    (sum, name) => sum + statSync(new URL(name, folder)).size,
    0,
  );
  assert.ok(total < 1_200_000, `suit-up files ${total}`);
  // The entry plays the same scene on a clock.
  const entry = read("src/components/meta-unitas-saga/meta-unitas-entry-sequence.tsx");
  assert.match(entry, /mountMetaUnitasAssemblyEngine\(runway, window(, \{ eager: true \})?\)/);
});

test("the still tiers and the motion gate", () => {
  const gateModule = read("src/lib/meta-unitas-assembly.ts");
  for (const term of [
    "prefers-reduced-motion: reduce",
    "forced-colors: active",
    "saveData",
    "economy",
  ])
    assert.ok(gateModule.includes(term), term);
  assert.match(gateModule, /import\("\.\/meta-unitas-rx-engine"\)/);
  assert.match(
    styles,
    /:is\(\.rzn-kicker, \.rzn-phase, \.rzn-hint, \.rzn-readout, \.rzn-nanites, \.rzn-parts\)/,
  );
  // Every animation in the sheet sits under the motion terms.
  const blocks = styles.split(/@media \(prefers-reduced-motion: no-preference\)/);
  for (const block of blocks.slice(0, 1))
    assert.ok(!/animation:\s*mus-/.test(block), "an animation outside the motion gate");
  for (const block of blocks.slice(1)) {
    const body = block.slice(0, block.indexOf("\n}\n"));
    for (const use of body.match(/animation:\s*mus-[a-z-]+/g) || [])
      assert.ok(/html:not\(\[data-world-effects="economy"\]\)/.test(body), use);
  }
});

test("a11y floors: labels 12 px and up, 44 px targets, focus rings", () => {
  for (const match of styles.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g))
    assert.ok(Number(match[1]) >= 12, `font-size ${match[1]}px`);
  assert.match(styles, /\.mus-page :focus-visible \{\s*outline: 2px solid/);
  // Owner (2026-10-24): 不要なセカンダリラベルを削除（レイアウトで説明） — the hero doors repeated the bar.
  for (const selector of [".mus-end-doors a {", ".mus-weapons li {"]) {
    const rule = styles.slice(styles.indexOf(selector));
    const min = Number(/min-height: (\d+)px/.exec(rule.slice(0, rule.indexOf("}")))?.[1] ?? 0);
    assert.ok(min >= 44, selector);
  }
  assert.match(styles, /\.mus-suitup-error button,\s*\.mus-watch \{\s*min-height: 46px;/);
  // Owner (2026-10-24): 「スライダーの形も統一させて」 — both selectors are the shared FormSlider.
  assert.equal((page + suitup).match(/<FormSlider/g)?.length, 2);
  // The runway is a picture; its calls are read from a list.
  assert.match(suitup, /aria-hidden="true"\s*data-form=\{runwayForm\(stage\)\}/);
  assert.match(suitup, /<ol aria-label="変身音声">/);
});
