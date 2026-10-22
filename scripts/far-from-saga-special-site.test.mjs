import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";
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
  // (c) #performance and (d) #p16 are built; see the tests below.
  assert.match(
    component,
    /id="performance"\s+className="rxs-section ffs-performance"\s/,
    "performance is no longer prepared",
  );
  assert.match(component, /id="p16"\s+className="rxs-section ffs-p16 ffs-prepared"/);
  assert.match(component, /<b>準備中<\/b>/);
  assert.match(component, /id="suitup"\s+className="rxs-section ffs-[a-z0-9]+ ffs-prepared"/);
  assert.doesNotMatch(component, /<canvas|WebGL|\.getContext\(/);
  assert.match(styles, /\.ffs-pending b \{/);
  assert.match(styles, /@import "\.\/styles-far-from-compare\.css";/);
  assert.match(styles, /\.ffs-runway \{/);
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
  const p16 = section("p16", "suitup");
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

/* ---------------- #ultra: the ウルトラ sequence (2026-10-22) ---------------- */
// Owner: 「ファーフロム・ウルトラだけ体全身が白に染まった後、さらにナノマシンにより
// 追加部分が生成された後、…コンピュータの様な補助インターフェースが腕の外などに
// 展開されます。ウルトラだけ未来的で特殊なシークエンスで、更に別のナノマシンも使う」
const ultraComponent = read("src/components/far-from-saga/far-from-ultra.tsx");
const ultraMount = read("src/lib/far-from-ultra.ts");
const ultraScene = read("src/lib/far-from-ultra-scene.ts");
const ultraArt = read("src/lib/far-from-ultra-art.ts");
const ultraKit = read("src/lib/far-from-ultra-kit.ts");
const ultraStyles = read("src/styles-far-from-ultra.css");
const ULTRA_REVISION = "20261022";

test("#ultra follows #suitup as its own segment, registered as ウルトラ, in the record's words", () => {
  assert.match(
    sections,
    /\["suitup", "変身シークエンス", "SUIT-UP"\],\s*\["ultra", "ウルトラ", "ULTRA"\],\s*\["stages"/,
  );
  const suitup = component.indexOf('id="suitup"');
  const ultra = component.indexOf("<FarFromUltra />");
  const stages = component.indexOf('id="stages"');
  assert.ok(suitup > 0 && ultra > suitup && stages > ultra, "suitup, then ultra, then stages");
  assert.match(ultraComponent, /<section id="ultra" className="rxs-section ffs-ultra"/);
  assert.match(ultraComponent, /<h2 id="ffs-ultra-title">ウルトラ<\/h2>/);
  // The chapter numbers after it move on by one; #suitup keeps its own.
  assert.match(component, /<p>05 \/ SUIT-UP<\/p>/);
  assert.match(ultraComponent, /<p>06 \/ ULTRA<\/p>/);
  for (const mark of [
    "07 / STAGES",
    "08 / MECHANISM",
    "09 / ARMOR & OS",
    "10 / AUTHORITY",
    "11 / WEAPONS",
    "12 / FINISHER",
  ])
    assert.ok(component.includes(`<p>${mark}</p>`), mark);
  // The caption is the record's own sentence, imported, never retyped.
  assert.match(ultraComponent, /const ultra = FAR_FROM_SAGA\.stages\.ultra;/);
  assert.match(ultraComponent, /<p>\{ultra\.body\[0\]\}<\/p>/);
  const record = read("src/components/final-stage/final-stage-data.ts");
  assert.ok(
    record.includes(
      "水色の結晶装甲が全身に大きく展開し、鋭く拡張された頭部、肩部の追加機構、幾重もの光輪と電子表示が出現する。",
    ),
  );
  // House copy rules: plain official-site Japanese, no poetic motifs.
  for (const source of [ultraComponent, ultraArt])
    assert.doesNotMatch(source, /静かに|眠る|記録が|物語|祈り/);
  assert.match(ultraComponent, /補助インターフェースの表示内容はイメージです。/);
  // #suitup is untouched: still the prepared runway with its seam.
  assert.match(component, /id="suitup"\s+className="rxs-section ffs-[a-z0-9]+ ffs-prepared"/);
  assert.match(component, /mountFarFromAssembly\(runwayRef\.current/);
  assert.match(styles, /@import "\.\/styles-far-from-ultra\.css";/);
});

test("#ultra never loads its engine on the startup path, and the quiet tiers keep the still", () => {
  // The component holds pictures and a dead canvas; the engine is the mount's lazy chunk.
  const ultraImports = ultraComponent.split("\n").filter((line) => line.startsWith("import "));
  assert.ok(ultraImports.length >= 4);
  for (const line of ultraImports)
    assert.doesNotMatch(
      line,
      /far-from-ultra-scene|far-from-ultra-kit|rexonance-assembly-nanites|rexonance-nanites/,
    );
  assert.doesNotMatch(ultraComponent, /getContext|createImageBitmap/);
  assert.match(ultraComponent, /<canvas className="ffu-canvas" width=\{0\} height=\{0\} \/>/);
  assert.match(ultraComponent, /className="ffu-still"[^]*?loading="lazy"/);
  assert.match(ultraComponent, /className="ffu-start"[^]*?loading="lazy"/);
  assert.match(
    ultraComponent,
    /useEffect\(\(\) => mountFarFromUltra\(runwayRef\.current\), \[\]\)/,
  );
  assert.match(ultraMount, /import\("\.\/far-from-ultra-scene\.ts"\)/);
  assert.match(ultraMount, /import\("\.\/far-from-ultra-kit\.ts"\)/);
  assert.match(
    ultraMount,
    /^import type \{ FarFromUltraScene \} from "\.\/far-from-ultra-scene\.ts";/m,
  );
  assert.doesNotMatch(ultraMount, /^import \{[^}]*\} from "\.\/far-from-ultra-scene\.ts"/m);
  // The motion gate: reduced motion, forced colours, economy, Save-Data and 2G.
  assert.match(ultraMount, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(ultraMount, /matchMedia\("\(forced-colors: active\)"\)/);
  assert.match(ultraMount, /html\.dataset\.worldEffects !== "economy"/);
  assert.match(ultraMount, /connection\?\.saveData/);
  assert.match(ultraMount, /setState\(motionAllowed\(\) \? "waiting" : "static"\);/);
  assert.match(
    ultraMount,
    /if \(disposed \|\| live \|\| loading \|\| !near \|\| !motionAllowed\(\) \|\| document\.hidden\) return;/,
  );
  // A change of preference flips the frame to the still, or back.
  assert.match(ultraMount, /reduced\.addEventListener\("change", onReduced\)/);
  assert.match(
    ultraMount,
    /if \(!motionAllowed\(\)\) \{[^]*?live = false;\s*setState\("static"\);/,
  );
  // Only the two cutouts the sequence draws are fetched (never the painted interfaces).
  assert.match(ultraMount, /fetchBitmap\(farFromUltraSrc\("max", artWidth\)/);
  assert.match(ultraMount, /fetchBitmap\(farFromUltraSrc\("body", artWidth\)/);
  assert.doesNotMatch(ultraMount, /farFromUltraSrc\("interface"/);
  // The sheet: the still unless live/waiting; the canvas only live; travel and
  // the sticky frame only under no-preference, no forced colours, not economy.
  assert.match(
    ultraStyles,
    /\.ffu-runway\[data-ffu-state="live"\] \.ffu-canvas \{\s*display: block;/,
  );
  assert.match(ultraStyles, /\.ffu-runway\[data-ffu-state="live"\] \.ffu-still,/);
  assert.match(
    ultraStyles,
    /@media \(prefers-reduced-motion: no-preference\) and \(forced-colors: none\) \{/,
  );
  assert.match(
    ultraStyles,
    /html:not\(\[data-world-effects="economy"\]\)\s+\.ffs-page\s+\.ffu-runway:not\(\[data-ffu-state="static"\]\)\s*>\s*\.ffu-frame\s*\{\s*position: sticky;/,
  );
  assert.match(ultraStyles, /\.ffs-page \.ffu-runway \{[^}]*height: var\(--ffu-frame-h\);/);
  // The read-outs are rewritten as text data, never replaced nodes.
  assert.match(ultraMount, /if \(\(node as Text\)\.data !== text\) \(node as Text\)\.data = text;/);
});

test("the ウルトラ cutouts are one versioned set on the マックス grid, within budget", () => {
  assert.match(ultraArt, new RegExp(`FAR_FROM_ULTRA_REVISION = "${ULTRA_REVISION}"`));
  assert.match(ultraArt, /FAR_FROM_ULTRA_WIDTHS = \[768, 1024\]/);
  assert.match(ultraArt, /FAR_FROM_ULTRA_FIGURE = \{ width: 1024, height: 1536 \}/);
  const caps = { 768: 330_000, 1024: 520_000 };
  for (const stem of ["max", "ultra", "ultra-interface"])
    for (const [width, cap] of Object.entries(caps)) {
      const file = new URL(
        `../public/far-from-ultra-${ULTRA_REVISION}/${stem}-${width}.webp`,
        import.meta.url,
      );
      assert.equal(existsSync(file), true, file.pathname);
      assert.ok(statSync(file).size <= cap, `${stem}-${width} within ${cap} bytes`);
    }
  const build = read("scripts/build-far-from-ultra-art.mjs");
  assert.match(build, /FAR_FROM_ULTRA_WIDTHS/);
  assert.match(build, /the cutouts share one pixel grid/);
  assert.match(build, /alphaQuality: 100/);
});

test("the figure stands on the #suitup runway's placement (far-from-stage.ts), never a local copy", async () => {
  const stage = await import("../src/lib/far-from-stage.ts");
  const art = await import("../src/lib/far-from-ultra-art.ts");
  assert.deepEqual({ ...stage.FAR_FROM_CUTOUT }, { ...art.FAR_FROM_ULTRA_FIGURE });
  assert.match(ultraMount, /farFromFigureBox\(cssWidth, cssHeight, place, FAR_FROM_ULTRA_FIGURE\)/);
  assert.match(ultraMount, /FAR_FROM_STAGE_TIERS\[stageTier\]/);
  assert.match(
    ultraMount,
    /frame\.style\.setProperty\(FAR_FROM_STAGE_VARS\.height, String\(place\.height\)\)/,
  );
  assert.doesNotMatch(ultraArt, /height: 0\.86|bottom: 0\.035/);
  assert.match(ultraComponent, /\[FAR_FROM_STAGE_VARS\.height as string\]: FAR_FROM_STAGE\.height/);
  // The sheet's travel and frame agree with the stage module.
  assert.ok(ultraStyles.includes(stage.FAR_FROM_RUNWAY_TRAVEL.desktop), "desktop travel");
  assert.ok(ultraStyles.includes(stage.FAR_FROM_RUNWAY_TRAVEL.phone), "phone travel");
  assert.ok(
    ultraStyles.includes(
      `min(${stage.FAR_FROM_STAGE_FRAME.desktop.max}px, max(${stage.FAR_FROM_STAGE_FRAME.desktop.min}px`,
    ),
  );
  assert.ok(ultraStyles.includes(`max(${stage.FAR_FROM_STAGE_FRAME.phone.min}px`));
  for (const name of Object.values(stage.FAR_FROM_STAGE_VARS))
    assert.ok(ultraStyles.includes(`var(${name}`), name);
});

// A document and contexts for the scene under Node: canvases whose contexts
// record every call (the main one) or accept them silently (the layers).
const ultraHarness = () => {
  const round = (value) =>
    typeof value === "number" ? Math.round(value * 1000) / 1000 : (value?.id ?? value);
  const context = (log) =>
    new Proxy(
      {},
      {
        get: (_, key) => {
          if (key === "createLinearGradient" || key === "createRadialGradient")
            return () => ({ addColorStop() {} });
          if (key === "measureText") return (text) => ({ width: 7 * text.length });
          return (...args) => {
            if (log) log.push(`${String(key)}(${args.map(round).join(",")})`);
          };
        },
        set: (_, key, value) => {
          if (log) log.push(`${String(key)}=${round(value)}`);
          return true;
        },
      },
    );
  // The scene makes its layers in this order (createFarFromUltraScene):
  // the white body, the landed tiles, the mask, the feather, the sheen band,
  // then its text measurer.
  const layers = ["white", "settled", "mask", "feather", "band", "measure"];
  let made = 0;
  const document = {
    createElement: () => ({
      id: layers[made++] ?? `layer-${made}`,
      width: 0,
      height: 0,
      getContext: () => context(null),
    }),
  };
  const sheet = (id, width = 1024, height = 1536) => ({ id, width, height });
  return { document, sheet, context };
};

// Synthetic cutouts on a quarter grid: マックス an oval body; ウルトラ the same
// body a little wider, a crown above it and spikes at both sides.
const ultraAlpha = () => {
  const width = 256;
  const height = 384;
  const max = new Uint8Array(width * height);
  const body = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const k = y * width + x;
      const inMax = ((x - 128) / 70) ** 2 + ((y - 230) / 150) ** 2 <= 1;
      const inBody = ((x - 128) / 76) ** 2 + ((y - 232) / 152) ** 2 <= 1;
      const crown = x >= 100 && x < 156 && y >= 16 && y < 82;
      const spikes = y >= 120 && y < 200 && ((x >= 8 && x < 46) || (x >= 210 && x < 248));
      if (inMax) max[k] = 255;
      if (inBody || crown || spikes) body[k] = 255;
    }
  return { width, height, max, body };
};

test("the sequence's frames are closed-form in the scroll: one q draws the same calls however it was reached", async () => {
  const { planFarFromUltra, createFarFromUltraScene, farFromUltraPhase } =
    await import("../src/lib/far-from-ultra-scene.ts");
  const { FAR_FROM_ULTRA_KIT } = await import("../src/lib/far-from-ultra-kit.ts");
  const { FAR_FROM_ULTRA_WINDOWS: WIN } = await import("../src/lib/far-from-ultra-art.ts");
  const plan = planFarFromUltra(ultraAlpha());
  assert.ok(plan.count > 400, `${plan.count} tiles`);
  assert.ok(
    plan.partsCount > 20 && plan.armourCount > plan.partsCount,
    `${plan.armourCount} armour, ${plan.partsCount} parts`,
  );
  for (let i = 1; i < plan.count; i += 1)
    assert.ok(plan.t[i] >= plan.t[i - 1], "the order is by time");
  for (let i = 0; i < plan.count; i += 1) {
    const [from, to] = plan.group[i] ? WIN.parts : WIN.armour;
    assert.ok(plan.t[i] >= from && plan.t[i] <= to, `tile ${i} lands in its window`);
  }
  // The phases, from the windows.
  assert.deepEqual([0, 0.1, 0.4, 0.65, 0.8, 1].map(farFromUltraPhase), [0, 1, 2, 3, 4, 4]);
  const { document, sheet, context } = ultraHarness();
  const scene = createFarFromUltraScene({
    plan,
    tier: "fine",
    bitmaps: {
      max: sheet("max"),
      body: sheet("body"),
      cells: sheet("cells", 768, 224),
      comets: sheet("comets", 512, 192),
      fx: sheet("fx", 1024, 384),
    },
    kit: FAR_FROM_ULTRA_KIT,
    document,
  });
  scene.view(0.5, 100, 20, 1, 1440, 837);
  const frameAt = (q, before) => {
    for (const p of before) {
      scene.frame(p);
      scene.draw(context(null));
    }
    // The landed cache catches up under its budget, then the frame is at rest.
    for (let k = 0; k < 64 && !(scene.progress() === q && scene.settled()); k += 1) scene.frame(q);
    assert.ok(scene.settled(), `${q}: settled`);
    const log = [];
    scene.draw(context(log));
    return log;
  };
  for (const q of [0.03, 0.2, 0.42, 0.6, 0.72, 0.86, 1]) {
    const forward = frameAt(q, [q - 0.03, q - 0.015, q]);
    const reverse = frameAt(q, [Math.min(1, q + 0.03), Math.min(1, q + 0.015), q]);
    const jump = frameAt(q, [1, 0, q]);
    const cold = frameAt(q, []);
    // (マックス alone, before the white, is one picture under the figure's
    // transform; the white front a few more; the swarm and the HUD many.)
    const least = q < WIN.white[0] ? 5 : q < WIN.armour[0] ? 10 : 40;
    assert.ok(forward.length > least, `${q}: the frame is drawn (${forward.length} calls)`);
    assert.deepEqual(reverse, forward, `${q}: reverse scrub`);
    assert.deepEqual(jump, forward, `${q}: jump`);
    assert.deepEqual(cold, forward, `${q}: cold`);
  }
  // Reversible to the first frame: マックス alone, after the whole sequence.
  const first = frameAt(0, [1, 0.5]);
  assert.equal(first.filter((call) => call.startsWith("drawImage(max")).length, 1);
  assert.equal(first.filter((call) => call.startsWith("drawImage(body")).length, 0);
  // The final frame: ウルトラ whole, every panel settled, the swarm gone.
  const final = frameAt(1, []);
  assert.equal(final.filter((call) => call.startsWith("drawImage(body")).length, 1);
  assert.equal(final.filter((call) => call.startsWith("drawImage(cells")).length, 0);
  assert.ok(
    final.filter((call) => call.startsWith("fillText(")).length > 30,
    "the read-outs are typed in full",
  );
  // Mid-sequence the kit's chips fly and the landed tiles show over the white body.
  const mid = frameAt(0.42, []);
  assert.ok(
    mid.filter((call) => call.startsWith("drawImage(cells")).length > 50,
    "chips in flight",
  );
  assert.ok(
    mid.some((call) => call.startsWith("drawImage(settled")),
    "the landed tiles",
  );
  assert.ok(
    mid.some((call) => call.startsWith("drawImage(white")),
    "the white body",
  );
  scene.release();
});

test("the scene's draw passes allocate nothing (AST), and the sprites land on whole pixels", () => {
  const from = ultraScene.indexOf("/* -- draw passes: allocation-free from here -- */");
  const to = ultraScene.indexOf("/* -- end of the draw passes -- */");
  assert.ok(from > 0 && to > from + 8000, `${from} ${to}`);
  const passes = ultraScene.slice(from, to);
  const file = ts.createSourceFile(
    "passes.ts",
    passes,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  const offences = [];
  const isFunction = (node) =>
    ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node);
  const line = (node) => file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const walk = (node, depth) => {
    if (ts.isNewExpression(node)) offences.push(`new at ${line(node)}`);
    if (ts.isArrayLiteralExpression(node)) offences.push(`array literal at ${line(node)}`);
    if (ts.isObjectLiteralExpression(node)) offences.push(`object literal at ${line(node)}`);
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node))
      offences.push(`template at ${line(node)}`);
    if (ts.isSpreadElement(node)) offences.push(`spread at ${line(node)}`);
    if (ts.isArrayBindingPattern(node) || ts.isObjectBindingPattern(node))
      offences.push(`destructuring at ${line(node)}`);
    if (isFunction(node) && depth > 0) offences.push(`closure at ${line(node)}`);
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const name = callee.name.text;
        if (
          [
            "map",
            "filter",
            "slice",
            "concat",
            "push",
            "join",
            "split",
            "from",
            "hypot",
            "toFixed",
            "toString",
          ].includes(name)
        )
          offences.push(`${name}() at ${line(node)}`);
      } else if (
        ts.isIdentifier(callee) &&
        ["String", "Array", "Object", "Number"].includes(callee.text)
      )
        offences.push(`${callee.text}() at ${line(node)}`);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (ts.isStringLiteral(node.left) || ts.isStringLiteral(node.right))
    )
      offences.push(`string concatenation at ${line(node)}`);
    // A double written to a let the closures hold is boxed on every write:
    // the region's top level declares consts only (its lets are the
    // passes' own locals, in registers).
    if (ts.isVariableDeclarationList(node) && !(node.flags & ts.NodeFlags.Const) && depth === 0)
      offences.push(`let held by the closures at ${line(node)}`);
    ts.forEachChild(node, (child) => walk(child, depth + (isFunction(node) ? 1 : 0)));
  };
  ts.forEachChild(file, (node) => walk(node, 0));
  assert.deepEqual(offences, []);
  // The frame's doubles live in typed slots; sprites on whole device pixels;
  // no per-sprite transform (the figure's, the sheen's and the panels' only).
  assert.match(ultraScene, /const S = new Float64Array\(SLOTS\);/);
  assert.match(ultraScene, /const POSE = new Float64Array\(6\);/);
  assert.match(passes, /Math\.round\(x - k \/ 2\),\s*Math\.round\(y - k \/ 2\),\s*k,\s*k,/);
  assert.ok((passes.match(/\.setTransform\(/g) ?? []).length <= 10);
});

test("the HUD rebuilds the owner's interfaces as vector panels placed by the reference, in the record's terms", async () => {
  const art = await import("../src/lib/far-from-ultra-art.ts");
  const hud = art.FAR_FROM_ULTRA_HUD;
  assert.deepEqual(
    hud.panels.map((panel) => panel.side),
    [-1, 1, -1, 1],
  );
  assert.deepEqual(
    hud.panels.map((panel) => panel.kind),
    ["dial", "bars", "text", "graph"],
  );
  // Outside the forearms (the reference's tall panels) and beside the blades (its low ones).
  const [l1, r1, l2, r2] = hud.panels;
  assert.ok(l1.ix > 180 && l1.ix < 200 && l1.iy > 560 && l1.iy < 610, "l1 at the left forearm");
  assert.ok(Math.abs(r1.ix - (1024 - l1.ix)) < 2 && r1.iy === l1.iy, "r1 mirrors l1");
  assert.ok(l2.iy > 860 && l2.iy < 940 && r2.iy === l2.iy, "the low panels beside the blades");
  assert.ok(
    hud.wrists.length === 2 && Math.abs(hud.wrists[0].cx + hud.wrists[1].cx - 1024) < 2,
    "the wrist rings",
  );
  assert.ok(hud.sizes.fine.text >= 9 && hud.sizes.coarse.text >= 7.5, "read-outs stay legible");
  // A panel widens to its longest read-out, so nothing is ever clipped.
  assert.match(
    ultraScene,
    /const w = Math\.round\(Math\.max\(wCss \* ratio, longest \+ 2 \* pad \+ 2 \* ratio\)\);/,
  );
  // The face's subset (DOSSIER_HUD_FONTS_URL): A–Z, digits and / - . : + # % & · | < >.
  const subset = /^[A-Z0-9 /\-.:+#%&·|<>]+$/;
  const texts = [
    ...Object.values(art.FAR_FROM_ULTRA_READOUTS).flat(),
    ...hud.panels.map((panel) => panel.title),
    hud.crown.label,
  ];
  for (const text of texts) assert.match(text, subset, text);
  // Terms from the record only.
  const record = read("src/components/final-stage/final-stage-data.ts");
  for (const term of [
    "SA-GA OS 6.1",
    "KHAOS DeuX",
    "KOSMOS DeuX",
    "FARFROM DRIVE",
    "P16",
    "60000YOPS",
    "9000TOPS",
    "300Core",
    "60秒",
  ])
    assert.ok(record.includes(term), term);
  // Deploy: unfold, then scan, then settle; the read-outs type on; the wrist
  // rings open outward.
  assert.match(ultraScene, /const u = easeOut\(span\(v, 0, 0\.35\)\);/);
  assert.match(ultraScene, /const s = span\(v, 0\.3, 0\.72\);/);
  assert.match(ultraScene, /const settleV = span\(v, 0\.7, 1\);/);
  assert.match(ultraScene, /context\.fillText\(chars\[k\], x \+ offsets\[at \+ k\], y\)/);
  assert.match(ultraScene, /const open = easeOut\(span\(v, 0\.12 \* r, 0\.5 \+ 0\.12 \* r\)\);/);
  // The owner's order: white, then the nanites' added parts, then the interfaces.
  const WIN = art.FAR_FROM_ULTRA_WINDOWS;
  assert.ok(WIN.white[1] <= WIN.armour[0] && WIN.armour[0] < WIN.parts[0]);
  assert.ok(WIN.parts[1] <= WIN.interface[0] && WIN.interface[1] <= WIN.final[0]);
  assert.equal(WIN.final[1], 1);
});

test("the ウルトラ nanites: budgets by pointer, the engine's geometry, and kit C's seam", async () => {
  const art = await import("../src/lib/far-from-ultra-art.ts");
  const budget = art.FAR_FROM_ULTRA_BUDGET;
  assert.ok(budget.fine.sprites > budget.coarse.sprites && budget.fine.motes > budget.coarse.motes);
  assert.ok(budget.fine.cache > budget.coarse.cache && budget.fine.ratio > budget.coarse.ratio);
  assert.ok(budget.coarse.width < budget.fine.width, "the touch tier decodes the smaller cutouts");
  assert.match(ultraMount, /matchMedia\("\(pointer: coarse\)"\)/);
  assert.match(
    ultraMount,
    /const tier = \(\): FarFromUltraTier => \(mediaNow\(coarse\) \? "coarse" : "fine"\);/,
  );
  assert.match(
    ultraScene,
    /S\[S_STRIDE\] = active > budget\.sprites \? Math\.ceil\(active \/ budget\.sprites\) : 1;/,
  );
  assert.match(ultraScene, /let work = budget\.cache;/);
  // The Rexonance engine's ring lanes and hashes, and its kit's sheets.
  assert.match(
    ultraScene,
    /import \{ naniteHash, naniteRings, naniteSizeScale \} from "\.\/rexonance-assembly-nanites\.js";/,
  );
  assert.match(ultraKit, /FAR_FROM_ULTRA_NANITE_CELLS/);
  assert.match(ultraKit, /far-from-nanites-ultra\.ts/);
  if (existsSync(new URL("../src/lib/far-from-nanites-ultra.ts", import.meta.url)))
    assert.match(ultraKit, /from "\.\/far-from-nanites-ultra\.ts"/);
  else assert.match(ultraKit, /from "\.\/rexonance-nanites\.ts"/);
  const { FAR_FROM_ULTRA_KIT } = await import("../src/lib/far-from-ultra-kit.ts");
  for (const key of ["cell", "frames", "lockFrame", "tones", "mip", "spark"])
    assert.ok(key in FAR_FROM_ULTRA_KIT.cells, key);
  assert.ok(FAR_FROM_ULTRA_KIT.tones.main in FAR_FROM_ULTRA_KIT.cells.tones);
  assert.ok(FAR_FROM_ULTRA_KIT.tones.accent in FAR_FROM_ULTRA_KIT.cells.tones);
  assert.ok(FAR_FROM_ULTRA_KIT.cometTone in FAR_FROM_ULTRA_KIT.comets.rows);
  for (const asset of FAR_FROM_ULTRA_KIT.assets)
    assert.equal(existsSync(new URL(`../public${asset}`, import.meta.url)), true, asset);
});
