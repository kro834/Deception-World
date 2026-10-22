import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// FAR FROM SAGA's special site: a provisional scaffold (2026-10-22) beside
// /extreme-saga and /rexonance-saga, registered wherever those two are.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = read("src/components/far-from-saga/far-from-saga.tsx");
const route = read("src/routes/far-from-saga.tsx");
const menu = read("src/components/world/world-chrome.tsx");
const styles = read("src/styles-far-from-saga.css");
const transitions = read("src/styles-route-transitions.css");
const loadGate = read("src/components/load-gate.tsx");
const loader = read("src/lib/asset-loader.ts");
const artwork = read("src/lib/far-from-saga-artwork.ts");
const sections = read("src/lib/special-site-sections.ts");

const STAGES = ["middle", "high", "xhigh", "max", "ultra"];
const REVISION = "20261022";

test("FAR FROM special site has a route, menu entry, warmup asset, and dedicated transition", () => {
  assert.match(route, /createFileRoute\("\/far-from-saga"\)/);
  assert.match(route, /styles-far-from-saga\.css\?url/);
  assert.match(route, /og:image", content: FAR_FROM_SAGA_KEY_VISUAL\.src/);
  assert.match(menu, /<span>\s*<DisplayName value="ファーフロムサーガ" \/>\s*<\/span>/);
  assert.match(menu, /FAR_FROM_SAGA_ENTER_ASSETS/);
  assert.match(component, /<SideMenuLayer context="far-from"/);
  assert.match(
    loader,
    /export const FAR_FROM_SAGA_ENTER_ASSETS = \[FAR_FROM_SAGA_KEY_VISUAL\.src\]/,
  );
  assert.match(loadGate, /"\/far-from-saga": "far-from"/);
  assert.match(loadGate, /FAR FROM \/\/ FINAL FORM SITE/);
  assert.match(transitions, /\.is-far-from-dive/);
  assert.match(read("src/lib/route-family.js"), /path === "\/far-from-saga"/);
  assert.match(read("server/lib/public-document-cache.ts"), /"\/far-from-saga"/);
  assert.match(read("scripts/verify-public-deployment.mjs"), /"\/far-from-saga"/);
  assert.match(read("src/lib/library-data.ts"), /path: "\/far-from-saga"/);
  assert.match(read("src/lib/record-art.ts"), /"\/far-from-saga": \{/);
  assert.match(
    read("src/components/search/search-ui-helpers.ts"),
    /"\/far-from-saga"\) return "FAR FROM SAGA"/,
  );
});

test("the side menu lists FAR FROM under SPECIAL after Rexonance, and its chapters by the shared registry", () => {
  const special = menu.slice(menu.indexOf("<p>SPECIAL</p>"), menu.indexOf("<p>STORIES</p>"));
  const rexonance = special.indexOf('<DisplayName value="レクソナンスサーガ" />');
  const farFrom = special.indexOf('<DisplayName value="ファーフロムサーガ" />');
  assert.ok(rexonance >= 0 && farFrom > rexonance);
  assert.match(sections, /"far-from": "\/far-from-saga"/);
  assert.match(sections, /"far-from": "ファーフロムサーガ"/);
  for (const hash of [
    "overview",
    "specs",
    "performance",
    "p16",
    "suitup",
    "stages",
    "theories",
    "system",
    "authority",
    "arsenal",
    "finishers",
  ]) {
    assert.match(sections, new RegExp(`\\["${hash}", `), hash);
    assert.match(component, new RegExp(`id="${hash}"`), hash);
  }
  // The two comparison documents are anchors inside #report, ids from their data.
  assert.match(component, /id="report"/);
  for (const hash of ["report-rexonance", "report-saga"]) {
    assert.match(sections, new RegExp(`\\["${hash}", `), hash);
    assert.match(
      read("src/components/far-from-saga/far-from-report-data.ts"),
      new RegExp(`"${hash}"`),
    );
  }
  assert.match(
    read("src/components/far-from-saga/far-from-report.tsx"),
    /<article id=\{part\.id\}/,
  );
  assert.match(menu, /SPECIAL_SITE_PATHS\[/);
  assert.match(read("src/styles-stage-shell.css"), /a\[href\^="\/far-from-saga"\]/);
});

test("the record is the Final Stage's own prose, imported rather than copied", () => {
  assert.match(
    component,
    /import \{ FAR_FROM_SAGA, type Article \} from "@\/components\/final-stage\/final-stage-data"/,
  );
  assert.match(component, /FAR_FROM_SAGA\.calls/);
  assert.match(component, /FAR_FROM_SAGA\.specs/);
  assert.match(component, /FAR_FROM_SAGA\.overview/);
  assert.match(component, /FAR_FROM_SAGA\.stages\[key\]/);
  assert.match(component, /FAR_FROM_SAGA\.theories/);
  assert.match(component, /FAR_FROM_SAGA\.bits, FAR_FROM_SAGA\.os/);
  assert.match(component, /FAR_FROM_SAGA\.powers/);
  assert.match(component, /FAR_FROM_SAGA\.arsenal\.map/);
  assert.match(component, /FAR_FROM_SAGA\.arsenalNote/);
  assert.match(component, /FAR_FROM_SAGA\.finishers\.map/);
  assert.doesNotMatch(component, /specNote/);
  assert.doesNotMatch(component, /月城悠真が『エクスサーガドライバー』/);
  // The Final Stage's FAR FROM chapter opens the site.
  assert.match(
    read("src/components/final-stage/final-stage.tsx"),
    /to="\/far-from-saga"\s+hash="top"\s+assets=\{FAR_FROM_SAGA_ENTER_ASSETS\}/,
  );
});

test("the five stage illustrations are one versioned, budgeted WebP set in the declared order", () => {
  assert.match(
    artwork,
    /export const FAR_FROM_SAGA_STAGE_ORDER = \[\s*"middle",\s*"high",\s*"xhigh",\s*"max",\s*"ultra",\s*\]/,
  );
  assert.match(artwork, new RegExp(`FAR_FROM_SAGA_ARTWORK_REVISION = "${REVISION}"`));
  const caps = { 640: 200_000, 960: 350_000, 1280: 480_000 };
  for (const stage of STAGES) {
    for (const [width, cap] of Object.entries(caps)) {
      const file = new URL(
        `../public/far-from-saga-${REVISION}/${stage}-${width}.webp`,
        import.meta.url,
      );
      assert.equal(existsSync(file), true, file.pathname);
      assert.ok(statSync(file).size <= cap, `${stage}-${width} within ${cap} bytes`);
    }
    assert.match(
      artwork,
      new RegExp(`${stage}: \\{ src: \`\\$\\{FOLDER\\}/${stage}-1280\\.webp\``),
    );
  }
  const tile = new URL(`../public/far-from-saga-${REVISION}/middle-tile-400.webp`, import.meta.url);
  assert.ok(statSync(tile).size <= 80_000, "menu tile within 80 KB");
  assert.match(read("scripts/build-far-from-saga-artwork.mjs"), /FAR_FROM_SAGA_STAGE_ORDER/);
  // The hero, its preload and the stage panel share one srcset helper.
  assert.match(route, /imageSrcSet: farFromImage\("middle"\)\.srcSet/);
  assert.match(component, /\{\.\.\.farFromImage\("middle"\)\}/);
  assert.match(component, /\{\.\.\.farFromImage\(stage, stage !== "middle"\)\}/);
});

test("the stage rail is the liquid rail with five 44px tabs, and the page keeps the owner's rules", () => {
  assert.match(component, /className="rxs-stage-tabs liquid-swipe-tabs ffs-stage-tabs"/);
  assert.match(component, /initRail\(rail\)/);
  assert.match(component, /railselect/);
  assert.match(component, /タップ・長押し・左右スライド・矢印キーで切り替え/);
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /min-width: 44px/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /touch-action: pan-y/);
  assert.match(styles, /-webkit-user-select: none/);
  // The footer ends on the way home, as the other special sites do.
  const footer = component.slice(
    component.lastIndexOf("<footer"),
    component.lastIndexOf("</footer>"),
  );
  assert.match(
    footer,
    /<GuardedLink\s+to="\/world"\s+hash="top"\s+assets=\{WORLD_ENTER_ASSETS\}\s+className="rxs-footer-return"\s*>\s*<span>メインサイトへ戻る<\/span>\s*<i aria-hidden="true">←<\/i>\s*<\/GuardedLink>\s*$/,
  );
});

test("the record carries the owner's 2026-10-22 values, verbatim, and none of the superseded ones", () => {
  const data = read("src/components/final-stage/final-stage-data.ts");
  const record = data.slice(
    data.indexOf("export const FAR_FROM_SAGA"),
    data.indexOf("export const REALM_ROYAL"),
  );
  for (const call of [
    "Ultra SUPERIOR DEUS！",
    "REXONANCE！",
    "SUPER SPECIAL！",
    "RIDER！FAR FROM！",
    "SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！！！",
    "FAR FROM！FAR FROM！FAR FROM！FAR FROM！",
    "FAR FROM DEUS！",
  ]) {
    assert.ok(record.includes(`"${call}"`), call);
  }
  for (const [dt, dd] of [
    ["身長", "可変"],
    ["体重", "可変"],
    ["パンチ力", "405.5t"],
    ["キック力", "502.9t"],
    ["ジャンプ力", "8000m"],
    ["走力", "0.00018s／100m"],
    ["飛行速度", "測定不能"],
    ["主演算", "60000YOPS／∞Core『KHAOS DeuX』"],
    ["副演算", "9000TOPS／300Core『KOSMOS DeuX』"],
    ["統合OS", "『SA-GA OS 6.1』"],
    ["EMP", "無制限"],
    ["浮遊ユニット", "展開数・機能可変"],
  ]) {
    assert.ok(record.includes(`{ dt: "${dt}", dd: "${dd}" }`), `${dt}: ${dd}`);
  }
  assert.match(record, /『Paranormal Realizer Ultra』『Neural Resonancer Ultra』『P16』/);
  for (const stale of [
    "369.5t",
    "50000YOPS",
    "SA-GA OS 6.0",
    "P14 Ultra",
    "Ultra VINCULUM",
    "specNote",
    "6000m",
    "無限大",
    "オーバークリスタルコア",
  ]) {
    assert.doesNotMatch(record, new RegExp(stale), stale);
  }
  // Four theories, two authorities, ten weapons, two finishers, as the owner wrote them.
  for (const title of [
    "FARFROM DRIVE／多重供給接続",
    "分散共鳴収束",
    "接続境界整合",
    "並列進化・継続実装",
  ]) {
    assert.ok(record.includes(`title: "${title}"`), title);
  }
  assert.match(record, /title: "FAR FROM DEUS"/);
  assert.match(record, /title: "Exception World"/);
  assert.doesNotMatch(record, /title: "OVERGODS DEUS"/);
  assert.match(record, /"ユナイトエッジマークII &Ⅲ・ソード／ランサーモード"/);
  assert.match(record, /name: "デウスシフト・ファー・グランドフィナーレ"/);
  assert.match(record, /"FAR！GRAND FINALE！！"/);
  assert.match(record, /title: "SA-GA OS 6.1"/);
  assert.match(record, /表記の60000YOPSは標準稼働時の基準値にあたる/);
  // The Final Stage's own chapter no longer prints a provisional note.
  assert.doesNotMatch(read("src/components/final-stage/final-stage.tsx"), /specNote/);
  assert.match(read("src/components/search/search-data.ts"), /description: "SA-GA OS 6\.1"/);
});

test("the four prepared chapters are visibly 準備中, typed, and weightless", () => {
  // (a) #suitup: a still runway whose seam is a typed no-op hook.
  const assembly = read("src/lib/far-from-assembly.ts");
  assert.match(assembly, /export function mountFarFromAssembly\(/);
  assert.match(
    assembly,
    /export const FAR_FROM_ASSEMBLY_BEATS: readonly FarFromAssemblyBeat\[\] = \[\]/,
  );
  assert.match(assembly, /rexonance-resonance\.js/);
  assert.match(assembly, /rexonance-assembly-nanites\.js/);
  assert.match(component, /mountFarFromAssembly\(runwayRef\.current/);
  assert.match(component, /<div ref=\{runwayRef\} className="ffs-runway" aria-hidden="true">/);
  // (b) the entry transition renders nothing and is mounted first.
  const entry = read("src/components/far-from-saga/far-from-entry-transition.tsx");
  assert.match(entry, /export function FarFromEntryTransition\(/);
  assert.match(entry, /return null;/);
  assert.match(entry, /prefers-reduced-motion/);
  assert.match(entry, /rexonance-call-sequence\.tsx/);
  assert.ok(
    component.indexOf("<FarFromEntryTransition") <
      component.indexOf('<header className="rxs-local-nav">'),
  );
  // (c) #performance and (d) #p16 are built from the owner's comparison
  // text; see the tests below.
  assert.match(
    component,
    /id="performance"\s+className="rxs-section ffs-performance"\s/,
    "performance is no longer prepared",
  );
  assert.match(
    component,
    /id="p16"\s+className="rxs-section ffs-p16"\s/,
    "p16 is no longer prepared",
  );
  assert.match(component, /<b>準備中<\/b>/);
  assert.match(component, /id="suitup"\s+className="rxs-section ffs-[a-z0-9]+ ffs-prepared"/);
  assert.doesNotMatch(component, /<canvas|WebGL|\.getContext\(/);
  assert.match(styles, /\.ffs-pending b \{/);
  assert.match(styles, /@import "\.\/styles-far-from-compare\.css";/);
  assert.match(styles, /\.ffs-runway \{/);
});

/* ---------------------------------------------------------------------------
   The owner's comparison text (2026-10-22): #performance, #report, #p16.
   --------------------------------------------------------------------------- */

const root = fileURLToPath(new URL("../", import.meta.url));
const loaded = new Map();
/** Loads a data module through the TypeScript transpiler (relative imports
 * only), in this realm so its arrays compare with deepEqual. */
function loadData(path) {
  const absolute = resolve(root, path);
  if (loaded.has(absolute)) return loaded.get(absolute);
  const exports = {};
  loaded.set(absolute, exports);
  const run = runInThisContext(
    `(function (exports, require) {${
      ts.transpileModule(readFileSync(absolute, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText
    }\n})`,
  );
  run(exports, (specifier) => {
    assert.ok(specifier.startsWith("."), `${path}: ${specifier} is a relative import`);
    return loadData(resolve(dirname(absolute), `${specifier.replace(/\.ts$/, "")}.ts`));
  });
  return exports;
}

const { FAR_FROM_REPORT_TEXT: TEXT } = loadData(
  "src/components/far-from-saga/far-from-report-text.ts",
);
const report = loadData("src/components/far-from-saga/far-from-report-data.ts");
const data = loadData("src/components/far-from-saga/far-from-comparison-data.ts");
const p16 = loadData("src/components/far-from-saga/far-from-p16-data.ts");
const comparison = read("src/components/far-from-saga/far-from-comparison.tsx");
const comparisonData = read("src/components/far-from-saga/far-from-comparison-data.ts");
const reportView = read("src/components/far-from-saga/far-from-report.tsx");
const p16View = read("src/components/far-from-saga/far-from-p16.tsx");
const compareStyles = read("src/styles-far-from-compare.css");
const section = (id, next) =>
  component.slice(component.indexOf(`id="${id}"`), component.indexOf(`id="${next}"`));

test("the owner's comparison text is kept verbatim and read whole into the two documents", () => {
  // sha256 of the owner's text as supplied (2026-10-22). Any edit fails here.
  assert.equal(
    createHash("sha256").update(TEXT).digest("hex"),
    "ee654c3e1208cd781de55a13c8c5fd3bcf40a099bf0b393d620abc584c21f1e7",
  );
  const [first, second] = report.REPORT_PARTS;
  assert.equal(first.title, "対レクソナンスサーガ・性能比較及び効率改善");
  assert.equal(second.title, "仮面ライダーサーガ・究極形態性能比較及び技術進化");
  assert.equal(second.subtitle, "《 VINCULUM／EXTREME／REXONANCE／FAR FROM 》");
  assert.deepEqual(
    first.chapters.map((chapter) => chapter.title),
    [
      "基本身体性能",
      "主演算性能・演算効率",
      "P16・第16世代演算加速機構",
      "SA-GA OS 6.1・統合制御効率",
      "FARFROM DRIVE・出力伝達効率",
      "分散共鳴・攻撃密度",
      "防御・同時迎撃性能",
      "攻撃継続・超自己進化効率",
      "必殺技・エネルギー利用効率",
      "総合評価",
    ],
  );
  assert.deepEqual(
    second.chapters.map((chapter) => chapter.title),
    [
      "概要",
      "基本性能比較",
      "統合演算性能",
      "P16・第16世代演算加速機構",
      "同条件ベンチマーク・暫定評価",
      "FARFROM DRIVE・攻撃伝達効率",
      "防御・継続戦闘・超自己進化",
      "最終必殺技の性能差",
      "総合評価",
    ],
  );
  // Every non-empty line lands in exactly one place, in order: a title, the
  // subtitle, a paragraph, or a table cell / note.
  const rebuilt = [];
  const tableLines = (key) => {
    const table = report.REPORT_TABLES[key];
    return [
      table.corner,
      ...table.columns,
      ...table.rows.flatMap((row) => [row.label, ...row.values]),
      table.note,
    ];
  };
  const blockLines = (block) => (block.kind === "p" ? [block.text] : tableLines(block.table));
  for (const part of report.REPORT_PARTS) {
    rebuilt.push(`【\u3000${part.title}\u3000】`);
    if (part.subtitle) rebuilt.push(part.subtitle);
    rebuilt.push(...part.intro.flatMap(blockLines));
    for (const chapter of part.chapters) {
      rebuilt.push(`【\u3000${chapter.title}\u3000】`);
      rebuilt.push(...chapter.blocks.flatMap(blockLines));
    }
  }
  assert.deepEqual(
    rebuilt,
    TEXT.split("\n").filter((line) => line.trim()),
  );
  // The page prints every block: paragraphs as <p>, tables as tables with their note.
  assert.match(reportView, /block\.kind === "p" \? \(\s*<p key=\{index\}>\{block\.text\}<\/p>/);
  assert.match(reportView, /<figcaption>\{table\.note\}<\/figcaption>/);
  assert.match(reportView, /<Blocks blocks=\{part\.intro\} \/>/);
  assert.match(reportView, /<Blocks blocks=\{chapter\.blocks\} \/>/);
});

test("#report shows both documents as accessible disclosure panels", () => {
  const block = section("report", "p16");
  assert.match(block, /<FarFromReport \/>/);
  assert.match(block, /<h2 id="ffs-report-title">比較資料<\/h2>/);
  // Native <details>/<summary>: keyboard, screen readers and find-in-page.
  assert.match(reportView, /<details\s+id=\{chapter\.id\}/);
  assert.match(reportView, /<summary>/);
  assert.match(reportView, /onToggle=/);
  assert.match(reportView, /\{allOpen \? "すべて閉じる" : "すべて開く"\}/);
  assert.match(reportView, /aria-controls=\{part\.chapters\.map/);
  // Tables keep their semantics when phones lay rows out as cards.
  assert.match(reportView, /<table role="table">/);
  assert.match(reportView, /scope="row" role="rowheader"/);
  assert.match(reportView, /data-label=\{table\.columns\[index\]\}/);
  // Mincho titles, as on the Rexonance chapters.
  assert.match(compareStyles, /--ffs-mincho:/);
  assert.match(compareStyles, /\.ffs-page \.ffs-report summary h4,/);
  assert.match(compareStyles, /summary::-webkit-details-marker/);
  // The site search reads the whole text.
  const search = read("src/components/search/search-data.ts");
  assert.match(search, /id: "far-from-comparison-report"/);
  assert.match(search, /body: FAR_FROM_REPORT_TEXT/);
});

test("#performance draws on the owner's two tables only, and each keeps its ※ note", () => {
  const performance = section("performance", "report");
  assert.match(performance, /<FarFromComparison \/>/);
  assert.doesNotMatch(performance, /<Pending/);
  // No other source: the old record-derived columns are gone.
  assert.doesNotMatch(comparisonData, /final-stage-data|rexonance-profile|EXTREME_SPECS/);
  assert.match(comparisonData, /from "\.\/far-from-report-data"/);

  const basic = report.REPORT_TABLES.basic;
  assert.equal(basic.title, "基本性能比較");
  assert.deepEqual(basic.columns, [
    "ヴィンクルム",
    "エクスプリーム",
    "レクソナンス",
    "ファーフロム",
  ]);
  assert.deepEqual(
    basic.rows.map((row) => [row.label, ...row.values]),
    [
      ["パンチ力", "98.8t", "205.6t〜", "372.2t", "405.5t"],
      ["キック力", "198.8t", "308.9t〜", "483.5t", "502.9t"],
      ["ジャンプ力", "5000m", "1033.5m", "6000m", "8000m"],
      ["100m走力", "0.1秒", "0.002秒", "0.00021秒", "0.00018秒"],
      ["主演算", "10000YOPS", "20000YOPS", "50000YOPS", "60000YOPS"],
      ["副演算", "300TOPS", "5000TOPS", "9000TOPS", "9000TOPS"],
      ["加速機構", "P2", "個別比較値未確定", "P14", "P16"],
      ["戦闘OS", "従来型", "従来型", "SA-GA OS 5.5", "SA-GA OS 6.1"],
    ],
  );
  assert.equal(
    basic.note,
    "※ヴィンクルムの身体値は提示された推定値、エクスプリームの打撃力は通常出力における下限値を用いている。エクスプリームの高出力時は測定不能とされるため、表中の数値を最大性能として扱わない。",
  );

  const bench = report.REPORT_TABLES.benchmark;
  assert.equal(bench.title, "同条件ベンチマーク・暫定評価");
  assert.deepEqual(
    bench.rows.map((row) => [row.label, ...row.values]),
    [
      ["有効攻撃出力指数", "60", "80", "100", "168"],
      ["瞬間供給帯域", "45", "80", "100", "240"],
      ["命中後の出力継続性能", "45", "75", "100", "205"],
      ["選択処理の実効加速性能", "50", "80", "100", "150"],
      ["演算資源当たりの制御効率", "60", "80", "100", "175"],
      ["同時観測・制御能力", "40", "65", "100", "300"],
      ["多方向への防護処理能力", "40", "65", "100", "280"],
      ["同一処理量当たりの熱負荷", "160", "130", "100", "73"],
    ],
  );
  assert.equal(
    bench.note,
    "※熱負荷のみ数値が低いほど優秀。それ以外は高いほど優秀。エクスプリームの結果干渉やヴィンクルムの固有接続能力など、異なる目的を持つ能力の絶対的な優劣を示すものではない。",
  );
  // Heat load alone reads lower = better; 100m走力 is a time.
  assert.deepEqual(
    data.BENCHMARK_ROWS.filter((row) => row.reading === "load").map((row) => row.label),
    ["同一処理量当たりの熱負荷"],
  );
  assert.deepEqual(
    data.BASIC_METRICS.filter((row) => row.reading === "time").map((row) => row.label),
    ["100m走力"],
  );
  assert.equal(data.BENCHMARK_BASE, 100);
  // Both notes are printed under their panels, verbatim.
  assert.match(comparison, /<p className="ffs-table-note">\{BASIC_TABLE\.note\}<\/p>/);
  assert.match(comparison, /<p className="ffs-table-note">\{BENCHMARK_TABLE\.note\}<\/p>/);
});

test("the console compares FAR FROM with each form or all four, and labels the chart 暫定指数", () => {
  assert.deepEqual([...data.BASELINES], ["vinculum", "extreme", "rexonance"]);
  assert.match(comparison, /label: `\$\{form\(key\)\.label\}と比較`/);
  assert.match(comparison, /\{ key: "all", label: "4機を並べる" \}/);
  // Native radios: keyboard selection, a visible focus ring, 44px targets.
  assert.match(comparison, /type="radio"/);
  assert.match(comparison, /<legend>表示する比較<\/legend>/);
  assert.match(compareStyles, /:has\(input:focus-visible\)/);
  assert.match(compareStyles, /min-height: 44px/);
  // The chart: eight rows, four named bars each, values printed; the owner's words.
  assert.equal(data.BENCHMARK_ROWS.length, 8);
  assert.match(comparison, /<span className="ffs-provisional-tag">暫定指数<\/span>/);
  assert.match(
    comparison,
    /sentence\(\s*reportChapter\("report-saga", "同条件ベンチマーク・暫定評価"\),\s*"暫定指数となる",?\s*\)/,
  );
  assert.equal(
    report.sentence(
      report.reportChapter("report-saga", "同条件ベンチマーク・暫定評価"),
      "暫定指数となる",
    ),
    "レクソナンス・ハイを100として比較しており、実際の確定スペックではなく、各フォームの技術構造に基づいた暫定指数となる。",
  );
  assert.match(comparison, /低いほど優秀/);
  assert.match(comparison, /熱負荷は低いほど優秀/);
  assert.match(compareStyles, /li\[data-reading="load"\] \.ffs-bench-track i/);
  assert.match(compareStyles, /\.ffs-bench-track::after/);
  // The ※ note's 推定値 / 下限値 marks.
  assert.match(comparison, /推定値/);
  assert.match(comparison, /下限値/);
  assert.match(compareStyles, /@media \(prefers-reduced-motion: reduce\)/);
  // House copy rules: no poetic motifs.
  for (const source of [comparison, reportView, p16View]) {
    assert.doesNotMatch(source, /静かに|眠る|記録が/);
  }
});

/* Every percentage and multiple the owner states, in both parts, against the
   tables. Each line of the text that holds a figure is listed with all its
   figures in order (so none is skipped), and each figure with how it is
   computed. Figures are compared at two decimals (half up), which covers the
   owner's 約. The few figures no table holds (P16's wait time and phase error,
   the OS's recalculation time, the motion loss, the finisher's 3倍) are
   checked against one value each, so every repetition must agree. */
const cell = (label, key) =>
  data.BASIC_METRICS.find((row) => row.label === label).values[key].value;
const index = (label, key) => data.BENCHMARK_ROWS.find((row) => row.label === label).values[key];
const gain = (a, b) => (a / b - 1) * 100;
const times = (a, b) => a / b;
const cut = (a, b) => (1 - a / b) * 100;
const speed = (key, base) => cell("100m走力", base) / cell("100m走力", key);
const B = {
  punch: (k) => cell("パンチ力", k),
  kick: (k) => cell("キック力", k),
  jump: (k) => cell("ジャンプ力", k),
  main: (k) => cell("主演算", k),
  sub: (k) => cell("副演算", k),
};
const I = {
  attack: (k) => index("有効攻撃出力指数", k),
  supply: (k) => index("瞬間供給帯域", k),
  follow: (k) => index("命中後の出力継続性能", k),
  accel: (k) => index("選択処理の実効加速性能", k),
  control: (k) => index("演算資源当たりの制御効率", k),
  observe: (k) => index("同時観測・制御能力", k),
  guard: (k) => index("多方向への防護処理能力", k),
  heat: (k) => index("同一処理量当たりの熱負荷", k),
};
// Stated only in the text (no table row): one value each.
const TEXT_ONLY = {
  p16Wait: 35,
  p16Phase: 40,
  osRecalc: 35,
  motionLoss: 32,
  finisher: 3,
};
const ff = "farFrom";
const STATED = [
  [
    "レクソナンスサーガ・ハイのパンチ力372.2tに対し",
    [
      ["約8.95%", gain(B.punch(ff), B.punch("rexonance"))],
      ["約4.01%", gain(B.kick(ff), B.kick("rexonance"))],
      ["33.33%", gain(B.jump(ff), B.jump("rexonance"))],
      ["14.29%", cut(cell("100m走力", ff), cell("100m走力", "rexonance"))],
      ["16.67%", (speed(ff, "rexonance") - 1) * 100],
    ],
  ],
  ["主演算機構『KHAOS DeuX』の標準演算性能は", [["20%", gain(B.main(ff), B.main("rexonance"))]]],
  [
    "暫定ベンチマークでは、戦闘OSと副演算機構を含む",
    [
      ["175%", times(I.control(ff), I.control("rexonance")) * 100],
      ["75%", gain(I.control(ff), I.control("rexonance"))],
    ],
  ],
  [
    "暫定ベンチマークでは、演算加速対象となる処理の",
    [
      ["150%", times(I.accel(ff), I.accel("rexonance")) * 100],
      ["50%", gain(I.accel(ff), I.accel("rexonance"))],
      ["35%", TEXT_ONLY.p16Wait],
      ["40%", TEXT_ONLY.p16Phase],
      ["20%", gain(B.main(ff), B.main("rexonance"))],
    ],
  ],
  ["発熱管理についても、", [["27%", cut(I.heat(ff), I.heat("rexonance"))]]],
  [
    "P16と連携した戦術再計算時間は",
    [
      ["35%", TEXT_ONLY.osRecalc],
      ["75%", gain(I.control(ff), I.control("rexonance"))],
    ],
  ],
  [
    "さらに、FARFROM BITと複数の位相観測点を利用することで",
    [
      ["300%", times(I.observe(ff), I.observe("rexonance")) * 100],
      ["200%", gain(I.observe(ff), I.observe("rexonance"))],
      ["三倍", times(I.observe(ff), I.observe("rexonance"))],
    ],
  ],
  [
    "暫定ベンチマークでは、同一総供給量を用いた際の",
    [
      ["168%", times(I.attack(ff), I.attack("rexonance")) * 100],
      ["68%", gain(I.attack(ff), I.attack("rexonance"))],
      ["240%", times(I.supply(ff), I.supply("rexonance")) * 100],
      ["140%", gain(I.supply(ff), I.supply("rexonance"))],
    ],
  ],
  [
    "また、接触した後も出力を継続して追加できるため",
    [
      ["205%", times(I.follow(ff), I.follow("rexonance")) * 100],
      ["105%", gain(I.follow(ff), I.follow("rexonance"))],
      ["32%", TEXT_ONLY.motionLoss],
    ],
  ],
  [
    "暫定ベンチマークでは、複数方向からの攻撃に対する",
    [
      ["280%", times(I.guard(ff), I.guard("rexonance")) * 100],
      ["180%", gain(I.guard(ff), I.guard("rexonance"))],
    ],
  ],
  ["最高位必殺技『DEUS SHIFT・FAR GRAND FINALE』は", [["三倍", TEXT_ONLY.finisher]]],
  ["この三倍は、", [["三倍", TEXT_ONLY.finisher]]],
  [
    "仮に同一の実効攻撃出力を得るための資源効率として定義する場合",
    [
      ["約三分の一", 1 / TEXT_ONLY.finisher],
      ["約66.67%", (1 - 1 / TEXT_ONLY.finisher) * 100],
      ["三倍", TEXT_ONLY.finisher],
    ],
  ],
  [
    "ファーフロムサーガは、レクソナンスサーガと比較して",
    [
      ["8.95%", gain(B.punch(ff), B.punch("rexonance"))],
      ["4.01%", gain(B.kick(ff), B.kick("rexonance"))],
      ["33.33%", gain(B.jump(ff), B.jump("rexonance"))],
      ["16.67%", (speed(ff, "rexonance") - 1) * 100],
      ["20%", gain(B.main(ff), B.main("rexonance"))],
    ],
  ],
  [
    "これに加えて、暫定ベンチマーク上では",
    [
      ["50%", gain(I.accel(ff), I.accel("rexonance"))],
      ["35%", TEXT_ONLY.p16Wait],
      ["40%", TEXT_ONLY.p16Phase],
      ["27%", cut(I.heat(ff), I.heat("rexonance"))],
      ["75%", gain(I.control(ff), I.control("rexonance"))],
      ["200%", gain(I.observe(ff), I.observe("rexonance"))],
      ["180%", gain(I.guard(ff), I.guard("rexonance"))],
    ],
  ],
  [
    "攻撃面では、FARFROM DRIVEによって",
    [
      ["140%", gain(I.supply(ff), I.supply("rexonance"))],
      ["105%", gain(I.follow(ff), I.follow("rexonance"))],
      ["68%", gain(I.attack(ff), I.attack("rexonance"))],
      ["三倍", TEXT_ONLY.finisher],
    ],
  ],
  [
    "ファーフロムの基礎パンチ力はヴィンクルム比",
    [
      ["310.43%", gain(B.punch(ff), B.punch("vinculum"))],
      ["97.23%", gain(B.punch(ff), B.punch("extreme"))],
      ["8.95%", gain(B.punch(ff), B.punch("rexonance"))],
      ["152.97%", gain(B.kick(ff), B.kick("vinculum"))],
      ["62.80%", gain(B.kick(ff), B.kick("extreme"))],
      ["4.01%", gain(B.kick(ff), B.kick("rexonance"))],
      ["60%", gain(B.jump(ff), B.jump("vinculum"))],
      ["674.07%", gain(B.jump(ff), B.jump("extreme"))],
      ["33.33%", gain(B.jump(ff), B.jump("rexonance"))],
    ],
  ],
  [
    "100m走行時の平均速度は",
    [
      ["約555.56倍", speed(ff, "vinculum")],
      ["約11.11倍", speed(ff, "extreme")],
      ["約1.17倍", speed(ff, "rexonance")],
      ["14.29%", cut(cell("100m走力", ff), cell("100m走力", "rexonance"))],
      ["16.67%", (speed(ff, "rexonance") - 1) * 100],
    ],
  ],
  [
    "主演算性能は、ヴィンクルムの10000YOPSを基準とすると",
    [
      ["2倍", times(B.main("extreme"), B.main("vinculum"))],
      ["5倍", times(B.main("rexonance"), B.main("vinculum"))],
      ["6倍", times(B.main(ff), B.main("vinculum"))],
      ["200%", gain(B.main(ff), B.main("extreme"))],
      ["20%", gain(B.main(ff), B.main("rexonance"))],
    ],
  ],
  [
    "副演算性能については",
    [
      ["30倍", times(B.sub(ff), B.sub("vinculum"))],
      ["1.8倍", times(B.sub(ff), B.sub("extreme"))],
    ],
  ],
  [
    "暫定ベンチマークでは、P14比で対象処理の",
    [
      ["50%", gain(I.accel(ff), I.accel("rexonance"))],
      ["35%", TEXT_ONLY.p16Wait],
      ["40%", TEXT_ONLY.p16Phase],
      ["27%", cut(I.heat(ff), I.heat("rexonance"))],
    ],
  ],
  [
    "さらに、P2を使用するヴィンクルムと比較した",
    [["約3倍", times(I.accel(ff), I.accel("vinculum"))]],
  ],
  [
    "この暫定指数を採用した場合",
    [
      ["180%", gain(I.attack(ff), I.attack("vinculum"))],
      ["110%", gain(I.attack(ff), I.attack("extreme"))],
      ["68%", gain(I.attack(ff), I.attack("rexonance"))],
      ["約433.33%", gain(I.supply(ff), I.supply("vinculum"))],
      ["200%", gain(I.supply(ff), I.supply("extreme"))],
      ["140%", gain(I.supply(ff), I.supply("rexonance"))],
      ["約355.56%", gain(I.follow(ff), I.follow("vinculum"))],
      ["173.33%", gain(I.follow(ff), I.follow("extreme"))],
      ["105%", gain(I.follow(ff), I.follow("rexonance"))],
    ],
  ],
  [
    "演算資源当たりの制御効率は",
    [
      ["約191.67%", gain(I.control(ff), I.control("vinculum"))],
      ["118.75%", gain(I.control(ff), I.control("extreme"))],
      ["75%", gain(I.control(ff), I.control("rexonance"))],
      ["7.5倍", times(I.observe(ff), I.observe("vinculum"))],
      ["約4.62倍", times(I.observe(ff), I.observe("extreme"))],
      ["3倍", times(I.observe(ff), I.observe("rexonance"))],
    ],
  ],
  [
    "また、同一処理量当たりの熱負荷については",
    [
      ["約54.38%", cut(I.heat(ff), I.heat("vinculum"))],
      ["約43.85%", cut(I.heat(ff), I.heat("extreme"))],
      ["27%", cut(I.heat(ff), I.heat("rexonance"))],
    ],
  ],
  [
    "レクソナンス比で有効攻撃出力指数が68%",
    [
      ["68%", gain(I.attack(ff), I.attack("rexonance"))],
      ["140%", gain(I.supply(ff), I.supply("rexonance"))],
      ["105%", gain(I.follow(ff), I.follow("rexonance"))],
    ],
  ],
  ["そのため、防御性能の改善は", [["2.8倍", times(I.guard(ff), I.guard("rexonance"))]]],
  ["ファーフロムの『DEUS SHIFT・FAR GRAND FINALE』は", [["3倍", TEXT_ONLY.finisher]]],
  [
    "これは攻撃力が必ず3倍になるという意味ではなく",
    [
      ["3倍", TEXT_ONLY.finisher],
      ["約3分の1", 1 / TEXT_ONLY.finisher],
      ["約66.67%", (1 - 1 / TEXT_ONLY.finisher) * 100],
    ],
  ],
  [
    "ファーフロムサーガは、ヴィンクルムサーガに対して",
    [
      ["約4.10倍", times(B.punch(ff), B.punch("vinculum"))],
      ["約2.53倍", times(B.kick(ff), B.kick("vinculum"))],
      ["約555.56倍", speed(ff, "vinculum")],
      ["6倍", times(B.main(ff), B.main("vinculum"))],
      ["30倍", times(B.sub(ff), B.sub("vinculum"))],
    ],
  ],
  [
    "エクスプリームサーガに対しては",
    [
      ["約1.97倍", times(B.punch(ff), B.punch("extreme"))],
      ["約1.63倍", times(B.kick(ff), B.kick("extreme"))],
      ["約11.11倍", speed(ff, "extreme")],
      ["3倍", times(B.main(ff), B.main("extreme"))],
      ["1.8倍", times(B.sub(ff), B.sub("extreme"))],
    ],
  ],
  [
    "レクソナンスサーガに対しては",
    [
      ["8.95%", gain(B.punch(ff), B.punch("rexonance"))],
      ["4.01%", gain(B.kick(ff), B.kick("rexonance"))],
      ["16.67%", (speed(ff, "rexonance") - 1) * 100],
      ["20%", gain(B.main(ff), B.main("rexonance"))],
    ],
  ],
];

const KANJI = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const FIGURE =
  /約?(?:\d+(?:\.\d+)?|[一二三四五六七八九十]+)(?:%|倍|分の(?:\d+|[一二三四五六七八九十]+))/g;
const numeral = (text) => (/^\d/.test(text) ? Number(text) : KANJI[text]);
/** "約8.95%" → 8.95, "三倍" → 3, "約3分の1" → 1/3. */
function statedValue(token) {
  const body = token.replace(/^約/, "");
  const fraction = body.match(/^(\d+|[一-十]+)分の(\d+|[一-十]+)$/);
  if (fraction) return numeral(fraction[2]) / numeral(fraction[1]);
  return numeral(body.replace(/[%倍]$/, ""));
}
const half = (value) => Math.round(Math.abs(value) * 100 + 1e-7) / 100;

test("every percentage and multiple the owner states matches the two tables (2 decimals)", () => {
  const lines = TEXT.split("\n");
  const withFigures = lines.filter((line) => line.match(FIGURE));
  // Every line that states a figure is listed, once, and nothing else is.
  assert.equal(STATED.length, withFigures.length);
  const mismatches = [];
  for (const [prefix, figures] of STATED) {
    const matching = lines.filter((line) => line.startsWith(prefix));
    assert.equal(matching.length, 1, `one line starts with 「${prefix}」`);
    const tokens = matching[0].match(FIGURE);
    assert.deepEqual(
      figures.map(([token]) => token),
      tokens,
      `every figure of 「${prefix}…」, in order`,
    );
    for (const [token, computed] of figures) {
      const stated = statedValue(token);
      const ok = token.includes("分の")
        ? Math.abs(stated - computed) < 0.005
        : half(computed) === stated;
      if (!ok) mismatches.push(`「${prefix}…」 ${token}: tables give ${computed}`);
    }
  }
  assert.deepEqual(mismatches, []);
  // Spot checks the brief names.
  assert.equal(half(gain(B.punch(ff), B.punch("vinculum"))), 310.43);
  assert.equal(half(gain(B.punch(ff), B.punch("extreme"))), 97.23);
  assert.equal(half(speed(ff, "vinculum")), 555.56);
  assert.equal(half(times(B.sub(ff), B.sub("rexonance"))), 1);
  assert.equal(half(cut(I.heat(ff), I.heat("vinculum"))), 54.38);
  assert.equal(half(times(B.punch(ff), B.punch("vinculum"))), 4.1);
});

test("the console's own formatting reproduces the owner's figures", () => {
  const { ratio, formatChange, formatMultiplier, formatPercent, round2 } = data;
  const r = (label, base) => {
    const metric = data.BASIC_METRICS.find((row) => row.label === label);
    return ratio(metric.values.farFrom.value, metric.values[base].value, metric.reading);
  };
  assert.equal(formatChange(r("パンチ力", "vinculum").change), "約+310.43%");
  assert.equal(formatChange(r("パンチ力", "extreme").change), "約+97.23%");
  assert.equal(formatChange(r("パンチ力", "rexonance").change), "約+8.95%");
  assert.equal(formatMultiplier(r("100m走力", "vinculum").multiplier), "約555.56倍");
  assert.equal(formatMultiplier(r("100m走力", "extreme").multiplier), "約11.11倍");
  assert.equal(formatMultiplier(r("100m走力", "rexonance").multiplier), "約1.17倍");
  assert.equal(formatPercent(r("100m走力", "rexonance").timeCut), "約14.29%");
  assert.equal(formatMultiplier(r("主演算", "vinculum").multiplier), "6倍");
  assert.equal(formatMultiplier(r("主演算", "extreme").multiplier), "3倍");
  assert.equal(formatChange(r("主演算", "rexonance").change), "+20%");
  assert.equal(formatMultiplier(r("副演算", "vinculum").multiplier), "30倍");
  assert.equal(formatMultiplier(r("副演算", "extreme").multiplier), "1.80倍");
  assert.equal(formatChange(r("副演算", "rexonance").change), "±0%");
  const b = (label, base) => {
    const row = data.BENCHMARK_ROWS.find((item) => item.label === label);
    return ratio(row.values.farFrom, row.values[base], row.reading);
  };
  assert.equal(formatChange(b("有効攻撃出力指数", "vinculum").change), "+180%");
  assert.equal(formatChange(b("有効攻撃出力指数", "extreme").change), "+110%");
  assert.equal(formatChange(b("有効攻撃出力指数", "rexonance").change), "+68%");
  assert.equal(formatPercent(-b("同一処理量当たりの熱負荷", "vinculum").change), "約54.38%");
  assert.equal(formatPercent(-b("同一処理量当たりの熱負荷", "extreme").change), "約43.85%");
  assert.equal(formatPercent(-b("同一処理量当たりの熱負荷", "rexonance").change), "27%");
  assert.equal(round2(54.375), 54.38);
});

test("#p16 prints the owner's P16 chapters, with 暫定ベンチマーク on every figure", () => {
  const block = section("p16", "suitup");
  assert.match(block, /<FarFromP16 \/>/);
  assert.doesNotMatch(block, /<Pending/);
  assert.doesNotMatch(p16View, /<dd>準備中<\/dd>/);
  // The figures are the owner's, and agree with the 暫定評価 table.
  assert.deepEqual(
    p16.P16_METRICS.map((metric) => [metric.label, metric.change, metric.verb]),
    [
      ["対象処理の実効スループット", 50, "向上"],
      ["優先処理の待機時間", -35, "短縮"],
      ["位相同期誤差", -40, "減少"],
      ["同一処理量当たりの熱負荷", -27, "削減"],
    ],
  );
  assert.equal(100 + p16.P16_METRICS[0].change, I.accel(ff));
  assert.equal(100 + p16.P16_METRICS[3].change, I.heat(ff));
  assert.equal(-p16.P16_METRICS[1].change, TEXT_ONLY.p16Wait);
  assert.equal(-p16.P16_METRICS[2].change, TEXT_ONLY.p16Phase);
  for (const metric of p16.P16_METRICS) {
    for (const source of metric.sources) {
      assert.ok(TEXT.includes(source), source);
      assert.ok(source.includes(`${Math.abs(metric.change)}%`), `${metric.label} in 「${source}」`);
    }
  }
  assert.equal(p16.P16_VS_P2.value, "約3倍");
  assert.equal(p16.P16_VS_P2.multiplier, I.accel(ff) / I.accel("vinculum"));
  assert.ok(p16.P16_VS_P2.source.includes("暫定的に約3倍"));
  assert.equal(p16.P16_VS_EXTREME.value, "保留");
  assert.ok(p16.P16_VS_EXTREME.source.endsWith("機構単体の正確な向上率は保留する。"));
  // The caveats, verbatim: independent items, never summed, never added to the 20%.
  assert.deepEqual(
    [...p16.P16_CAVEATS],
    [
      "これらは独立した評価項目であり、単純に足し合わせて一つの性能向上率へ変換するものではない。",
      "これらは異なる処理項目の比較であり、主演算性能の20%向上と単純に加算するものではない。",
    ],
  );
  assert.match(p16.P16_HEAT_NOTE, /ULTRAの60秒制限/);
  assert.match(p16.P16_INTRO.basis, /^『P16』は、レクソナンスサーガの『P14』を基礎として/);
  assert.match(p16.P16_INTRO.generations, /二世代分の改良/);
  assert.deepEqual(
    [...p16.P16_FUNCTIONS],
    ["選択的な演算加速", "神経同期", "位相制御", "負荷分散", "熱管理"],
  );
  assert.ok(
    p16.P16_TOPICS.some((topic) => topic.body.some((p) => p.includes("FARFROM BITとの分散処理"))),
  );
  // Every sentence of both P16 chapters is on #p16, verbatim.
  const shown = [
    p16.P16_INTRO.basis,
    p16.P16_INTRO.generations,
    ...p16.P16_TOPICS.flatMap((topic) => topic.body),
    p16.P16_HEAT_NOTE,
    p16.P16_LINEAGE.text,
    p16.P16_METRICS[0].sources[1],
    ...p16.P16_CAVEATS,
    p16.P16_VS_P2.source,
    p16.P16_VS_EXTREME.source,
  ].join("");
  const chapterSentences = p16.P16_CHAPTERS.flatMap((chapter) =>
    report.paragraphsOf(chapter).flatMap(report.sentencesOf),
  );
  const missing = chapterSentences.filter((item) => !shown.includes(item));
  // Part 1's benchmark sentences are stated again, in the final version's
  // wording, by part 2's sentence the comparator quotes; they stay in #report.
  assert.deepEqual(missing, [
    "暫定ベンチマークでは、演算加速対象となる処理の実効スループットはP14比150%、すなわち50%向上。",
    "優先処理の投入から実行開始までに発生する待機時間は35%短縮され、位相同期誤差は40%減少している。",
  ]);
  // 暫定ベンチマーク wherever the figures appear: the overview, the comparator.
  assert.equal(p16View.match(/<ProvisionalTag \/>/g)?.length, 2);
  assert.match(p16View, /（暫定ベンチマーク）/);
  assert.match(p16View, /P16（暫定）/);
  // The P14 → P16 comparator: native radios over P14比 / P2比 / エクスプリーム.
  assert.match(p16View, /\{ key: "p14", label: "P14比" \}/);
  assert.match(p16View, /\{ key: "p2", label: "P2比" \}/);
  assert.match(p16View, /\{ key: "extreme", label: "エクスプリーム" \}/);
  assert.match(p16View, /type="radio"/);
  // No P16 artwork yet: a drawn core, labelled as such.
  assert.match(p16View, /<figcaption>イメージ図（P16のビジュアルは準備中です）<\/figcaption>/);
  assert.doesNotMatch(p16View, /<img/);
  assert.match(compareStyles, /\.ffs-p16-ring \{[^}]*animation: ffs-p16-ring/);
  assert.match(compareStyles, /\.ffs-page \.ffs-p16-ring \{\s*animation: none;/);
});
