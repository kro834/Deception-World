import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

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
  // The chapters' sections: on the page, or in its suit-up component.
  const chapters = component + read("src/components/far-from-saga/far-from-suitup.tsx");
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
    assert.match(chapters, new RegExp(`id="${hash}"`), hash);
  }
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

test("#suitup is built on the Rexonance runway; the other prepared chapters stay 準備中, typed, and weightless", () => {
  // (a) #suitup: the scroll suit-up (far-from-suitup.tsx), its seam the
  // lazy mount of the Rexonance engine (scripts/far-from-suitup.test.mjs
  // pins the scene itself).
  const assembly = read("src/lib/far-from-assembly.ts");
  const suitup = read("src/components/far-from-saga/far-from-suitup.tsx");
  assert.match(assembly, /export function mountFarFromAssembly\(/);
  assert.match(assembly, /export const FAR_FROM_ASSEMBLY_BEATS: readonly FarFromAssemblyBeat\[\]/);
  assert.match(assembly, /rexonance-resonance\.js/);
  assert.match(assembly, /import\("\.\/far-from-assembly-engine"\)/);
  assert.match(component, /<FarFromSuitUp \/>/);
  assert.match(suitup, /mountFarFromAssembly\(runwayRef\.current\)/);
  assert.match(suitup, /id="suitup" className="rxs-section ffs-suitup"/);
  assert.match(suitup, /className="ffs-runway rzn-suitup"/);
  assert.doesNotMatch(suitup, /<Pending|<b>準備中<\/b>/);
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
  // (c) #performance and (d) #p16 are built; see the tests below.
  assert.match(
    component,
    /id="performance"\s+className="rxs-section ffs-performance"\s/,
    "performance is no longer prepared",
  );
  assert.match(component, /id="p16"\s+className="rxs-section ffs-p16 ffs-prepared"/);
  assert.match(component, /<b>準備中<\/b>/);
  // The page's own chunk never carries a canvas or an engine: the runway's
  // canvas is the suit-up component's, drawn only by the lazy engine chunk.
  assert.doesNotMatch(component, /<canvas|WebGL|\.getContext\(/);
  assert.doesNotMatch(suitup, /WebGL|\.getContext\(/);
  assert.match(styles, /\.ffs-pending b \{/);
  assert.match(styles, /@import "\.\/styles-far-from-compare\.css";/);
  assert.match(read("src/styles-far-from-suitup.css"), /\.ffs-page \.rzn-suitup \{/);
});

const comparisonData = read("src/components/far-from-saga/far-from-comparison-data.ts");
const comparison = read("src/components/far-from-saga/far-from-comparison.tsx");
const p16View = read("src/components/far-from-saga/far-from-p16.tsx");
const compareStyles = read("src/styles-far-from-compare.css");
const section = (id, next) =>
  component.slice(component.indexOf(`id="${id}"`), component.indexOf(`id="${next}"`));

test("#performance is an interactive console built only from published values", () => {
  const performance = section("performance", "p16");
  assert.match(performance, /<FarFromComparison \/>/);
  assert.doesNotMatch(performance, /<Pending/);
  // Sources: FAR FROM's record, the owner's Rexonance profile, Extreme's site.
  assert.match(
    comparisonData,
    /import \{ FAR_FROM_SAGA \} from "@\/components\/final-stage\/final-stage-data"/,
  );
  assert.match(
    comparisonData,
    /import \{ REXONANCE_PROFILE_TEXT \} from "@\/lib\/rexonance-profile"/,
  );
  // Extreme's restated values must still be what its own site prints.
  const extreme = read("src/components/extreme-saga/extreme-saga.tsx");
  const riderPage = read("src/components/world/rider-page.tsx");
  for (const figure of [
    "205.6t〜",
    "308.9t〜",
    "1033.5m",
    "0.002秒",
    "20,000YOPS / ∞Core · KHAOS Ultra",
    "5,000TOPS / 300Core · KOSMOS Ultra",
    "P14（Extreme tuning）",
  ]) {
    assert.ok(extreme.includes(figure), figure);
  }
  for (const figure of ["249.9cm", "255.3kg"]) assert.ok(riderPage.includes(figure), figure);
  for (const [label, value] of [
    ["身長", "249.9cm"],
    ["体重", "255.3kg"],
    ["パンチ力", "205.6t〜"],
    ["キック力", "308.9t〜"],
    ["ジャンプ力", "1033.5m"],
    ["走力", "0.002s／100m"],
    ["主演算", "20000YOPS／∞Core『KHAOS Ultra』"],
    ["副演算", "5000TOPS／300Core『KOSMOS Ultra』"],
  ]) {
    assert.ok(comparisonData.includes(`${label}: "${value}"`), label);
  }
  // The six numeric rows, 走力 inverted, ratios only from two parsed values.
  for (const label of ["パンチ力", "キック力", "ジャンプ力", "走力", "主演算", "副演算"]) {
    assert.match(comparisonData, new RegExp(`label: "${label}", unit: "`), label);
  }
  assert.match(comparisonData, /label: "走力", unit: "s", lowerIsBetter: true/);
  assert.match(comparisonData, /metric\.lowerIsBetter \? b \/ a : a \/ b/);
  // Non-numeric values stay text.
  assert.match(comparisonData, /export const TEXT_ROWS/);
  assert.match(comparison, /new Set\(\["可変", "測定不能", "無制限", "無限大"\]\)/);
  // The owner's three comparison sentences, verbatim, and present in the record.
  const record = read("src/components/final-stage/final-stage-data.ts");
  for (const sentence of [
    "ミドルの時点で、すでにレクソナンス・ハイを上回る実効戦闘性能を安定して発揮する。",
    "これにより、レクソナンス・ウルトラ以上の実効性能を、高い継続性で維持する。",
    "レクソナンスパークアーキテクチャの『デウスシフト』と比較して3倍の効率性を誇る必殺技が誕生した。",
  ]) {
    assert.ok(comparisonData.includes(sentence), sentence);
    assert.ok(record.includes(sentence), sentence);
  }
  assert.match(comparison, /COMPARISON_CITATIONS\.map/);
  // Native radios: keyboard selection, a visible focus ring, 44px targets.
  assert.match(comparison, /type="radio"/);
  assert.match(comparison, /<legend>表示する比較<\/legend>/);
  assert.match(comparison, /role="img"/);
  assert.match(compareStyles, /:has\(input:focus-visible\)/);
  assert.match(compareStyles, /min-height: 44px/);
  assert.match(compareStyles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("#p16 shows only the record's facts and keeps every P16 slot 準備中", () => {
  const p16 = component.slice(component.indexOf('id="p16"'), component.indexOf("<FarFromSuitUp />"));
  assert.match(p16, /<FarFromP16 \/>/);
  assert.match(p16, /<Pending line="P16の詳細な仕様は現在準備中です。" \/>/);
  // No invented figures anywhere in the chapter.
  assert.doesNotMatch(p16View, /\d+(?:\.\d+)?\s*(?:YOPS|TOPS|%|ms|倍)/);
  for (const slot of [
    "機構の正式名称と位置付け",
    "担当する処理",
    "主要指標",
    "P14との違い",
    "ビジュアル",
  ]) {
    assert.ok(comparisonData.includes(`"${slot}"`), slot);
  }
  assert.match(p16View, /<dd>準備中<\/dd>/);
  // The recognition line and the OS quotes come from the record, verbatim.
  const record = read("src/components/final-stage/final-stage-data.ts");
  assert.ok(record.includes("『Paranormal Realizer Ultra』『Neural Resonancer Ultra』『P16』"));
  const quotes = [...comparisonData.matchAll(/quote:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(quotes.length, 4);
  for (const quote of quotes) assert.ok(record.includes(quote), quote);
  // P14 is shown only as the Rexonance profile states it.
  assert.match(comparisonData, /REXONANCE_PROFILE_TEXT\.match\(\/\^『 P14 』/);
  assert.ok(read("src/lib/rexonance-profile.ts").includes("『 P14 』\n\n第14世代演算加速機構。"));
  // House copy rules: no poetic motifs.
  for (const source of [p16View, comparison]) {
    assert.doesNotMatch(source, /静かに|眠る|記録が/);
  }
});
