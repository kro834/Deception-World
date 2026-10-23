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

// Owner (2026-10-23): 「イリュージョンクルムとこれ（メタ・ウニタス）はファーフロムと
// レクソナンスの間で、ファーフロムはサイドメニューの中でもやや大きく表示」 —
// FAR FROM leads SPECIAL now, a little larger (styles-stage-shell.css).
test("the side menu lists FAR FROM first under SPECIAL, and its chapters by the shared registry", () => {
  const special = menu.slice(menu.indexOf("<p>SPECIAL</p>"), menu.indexOf("<p>STORIES</p>"));
  const rexonance = special.indexOf('<DisplayName value="レクソナンスサーガ" />');
  const farFrom = special.indexOf('<DisplayName value="ファーフロムサーガ" />');
  assert.ok(farFrom >= 0 && rexonance > farFrom);
  assert.equal(special.indexOf("<DisplayName value="), farFrom);
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
  // ウルトラ's base (FAR_FROM_SAGA_ULTRA_BASE) through the same helper.
  assert.match(component, /\{\.\.\.farFromImage\(artKey, stage !== "middle"\)\}/);
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
    "FAR FROM DEUS！",
    "REXONANCE！",
    "SUPERIOR！",
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
    ["主演算", "60000〜YOPS／∞Core『KHAOS DeuX』"],
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
  assert.match(record, /表記の60000〜YOPSは標準稼働時の基準値にあたる/);
  // The Final Stage's own chapter no longer prints a provisional note.
  assert.doesNotMatch(read("src/components/final-stage/final-stage.tsx"), /specNote/);
  assert.match(read("src/components/search/search-data.ts"), /description: "SA-GA OS 6\.1"/);
});

test("#suitup is built on the Rexonance runway; no chapter wears a 準備中 mark any more", () => {
  // (a) #suitup: the scroll suit-up (far-from-suitup.tsx), its seam the
  // lazy mount of the Rexonance engine (scripts/far-from-suitup.test.mjs
  // pins the scene itself).
  const assembly = read("src/lib/far-from-assembly.ts");
  const suitup = read("src/components/far-from-saga/far-from-suitup.tsx");
  assert.match(assembly, /export function mountFarFromAssembly\(/);
  assert.match(assembly, /export const FAR_FROM_ASSEMBLY_BEATS: readonly FarFromAssemblyBeat\[\]/);
  assert.match(assembly, /rexonance-resonance\.js/);
  assert.match(assembly, /import\("\.\/far-from-assembly-engine"\)/);
  // Owner (2026-10-23): the runway ends on the page's chosen form.
  assert.match(component, /<FarFromSuitUp stage=\{stage\} onChoose=\{chooseQuietly\} \/>/);
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
  // (c) #performance and (d) #p16 are built from the owner's comparison
  // text; see the tests below.
  assert.match(
    component,
    // Owner (2026-10-23): a sub-chapter of 01 on the Rexonance five-chapter structure.
    /id="performance"\s+className="rxs-section ffs-performance ffs-subchapter"\s/,
    "performance is no longer prepared",
  );
  assert.match(
    component,
    /id="p16"\s+className="rxs-section ffs-p16"\s/,
    "p16 is no longer prepared",
  );
  assert.doesNotMatch(component, /<Pending|<b>準備中<\/b>/);
  // The page's own chunk never carries a canvas or an engine: the runway's
  // canvas is the suit-up component's, drawn only by the lazy engine chunk.
  assert.doesNotMatch(component, /<canvas|WebGL|\.getContext\(/);
  assert.doesNotMatch(suitup, /WebGL|\.getContext\(/);
  // The provisional marks are gone from the page and its sheet.
  assert.doesNotMatch(component, /NOW UPDATING|順次更新|ffs-provisional"/);
  assert.doesNotMatch(styles, /\.ffs-pending|\.ffs-prepared/);
  assert.match(styles, /@import "\.\/styles-far-from-compare\.css";/);
  assert.match(read("src/styles-far-from-suitup.css"), /\.ffs-page \.rzn-suitup \{/);
});

/* ---------------------------------------------------------------------------
   The redesign (2026-10-22): the Rexonance / Extreme structure and design
   language, in FAR FROM's palette. 「サイトの構成もエクスプリームやレクソナンスに
   似た様なデザインや構成にして。」
   --------------------------------------------------------------------------- */

const editorial = read("src/components/far-from-saga/far-from-editorial.tsx");
const formComparison = read("src/components/far-from-saga/far-from-form-comparison.tsx");

test("the page follows the Rexonance structure: numbered bar, split hero, CONTENTS, numbered chapters, end card", () => {
  // The bar: five landmark chapters, numbered as CONTENTS numbers them; the
  // suit-up's entry stays lit through its runway (as Rexonance's does).
  const bar = component.slice(
    component.indexOf('<nav aria-label="ファーフロムサーガ ページ内ナビゲーション">'),
    component.indexOf("</nav>"),
  );
  assert.deepEqual(
    [...bar.matchAll(/<a href="#([a-z0-9]+)"[^>]*>\s*<span aria-hidden="true">(\d\d)<\/span>/g)].map(
      (m) => [m[1], m[2]],
    ),
    [
      // Owner (2026-10-23): the Rexonance site's five chapters.
      ["overview", "01"],
      ["p16", "02"],
      ["suitup", "03"],
      ["stages", "04"],
      ["theories", "05"],
    ],
  );
  assert.match(bar, /href="#overview" data-local-nav-through="specs performance report"/);
  assert.match(bar, /href="#theories" data-local-nav-through="system authority arsenal finishers"/);
  assert.match(bar, /data-local-nav-through="far-from-assembly-runway"/);
  // The hero: the key visual in its stage (slate, aperture, read-outs from
  // the spec table), the copy with its two doors, the name's ghost, the cue.
  const hero = component.slice(
    component.indexOf('<section className="rxs-hero ffs-hero"'),
    component.indexOf("<FarFromChapterMap />"),
  );
  for (const piece of [
    "<FarFromStageSlate />",
    "<FarFromAperture />",
    "<FarFromCallouts />",
    "<FarFromHeroRail />",
    'className="ffs-mark" aria-hidden="true"',
    '<a className="rxs-scroll-cue" href="#overview">',
    // The stage line breaks only after its 「／」 (withSlashBreaks: each unit
    // up to its slash is one unbreakable run; keep-all alone let a line
    // open with 「／」).
    '<span className="ffs-phrase">{withSlashBreaks(FAR_FROM_SAGA.stagesLine)}</span>',
  ])
    assert.ok(hero.includes(piece), piece);
  const phrase = read("src/components/far-from-saga/far-from-phrase.tsx");
  assert.match(phrase, /export function withSlashBreaks\(text: string\): ReactNode\[\]/);
  assert.match(phrase, /className="ffs-phrase-unit"/);
  assert.doesNotMatch(phrase, /<wbr/);
  // The calls' chips break after a 「！」 alone (FAR FROM！ never splits at its space).
  assert.match(phrase, /export function withCallBreaks\(call: string\): ReactNode\[\]/);
  assert.match(component, /<b key=\{`\$\{call\}-\$\{index\}`\} role="listitem">\s*\{withCallBreaks\(call\)\}/);
  assert.match(editorial, /<em>\{withSlashBreaks\(chapter\.detail\)\}<\/em>/);
  assert.match(component, /<h3 className="ffs-phrase">\{withSlashBreaks\(item\.title\)\}<\/h3>/);
  assert.match(styles, /\.ffs-page \.ffs-phrase-unit \{\s*white-space: nowrap;\s*\}/);
  assert.doesNotMatch(styles, /word-break: keep-all;\s*overflow-wrap: anywhere;/);
  // The 5 STAGES tag alone is a chip; the names after it stay plain text.
  assert.match(styles, /\.ffs-stages-line > span\[lang="en"\] \{/);
  assert.doesNotMatch(styles, /\.ffs-stages-line > span \{/);
  assert.match(editorial, /<a className="ffs-hero-primary" href="#suitup">/);
  assert.match(editorial, /<a className="ffs-hero-secondary" href="#stages">/);
  // The read-outs are the owner's spec values, never typed in.
  assert.match(editorial, /spec\("パンチ力"\)/);
  assert.match(editorial, /spec\("ジャンプ力"\)/);
  assert.doesNotMatch(editorial, /405\.5|8000m/);
  // CONTENTS: five chapters, numbered 01–05 (Owner (2026-10-23): the Rexonance
  // structure), each a real anchor on the page, in the registry's order; the
  // registry also lists their sub-chapters, each a sub-chapter section.
  const chapters = [...editorial.matchAll(/href: "#([a-z0-9]+)",\s*number: "(\d\d)"/g)].map(
    (m) => [m[1], m[2]],
  );
  assert.equal(chapters.length, 5);
  assert.deepEqual(
    chapters.map(([, number]) => number),
    Array.from({ length: 5 }, (_, i) => String(i + 1).padStart(2, "0")),
  );
  const mounted = component + read("src/components/far-from-saga/far-from-suitup.tsx");
  const registry = sections
    .slice(sections.indexOf('"far-from": ['), sections.indexOf('"final-stage": ['))
    .match(/\["([a-z0-9-]+)"/g)
    .map((m) => m.slice(2, -1))
    .filter((hash) => hash !== "top" && !hash.startsWith("report-"));
  assert.deepEqual(
    chapters.map(([hash]) => hash),
    registry.filter((hash) => ["overview", "p16", "suitup", "stages", "theories"].includes(hash)),
  );
  for (const hash of registry) assert.match(mounted, new RegExp(`id="${hash}"`), hash);
  for (const hash of ["specs", "performance", "report", "system", "authority", "arsenal", "finishers"])
    assert.match(component, new RegExp(`id="${hash}"\\s+className="[^"]*ffs-subchapter`), hash);
  assert.match(editorial, /<nav className="rxs-chapter-index ffs-chapter-map"/);
  assert.match(editorial, /<span lang="en">CONTENTS<\/span>\s*<small>01 — 05<\/small>/);
  // The chapters count themselves (a CSS counter over the page's direct
  // sections), so the mounted chapters' own kickers stay as they are; the
  // report is 03's second half and does not count.
  assert.match(styles, /counter-reset: ffs-chapter;/);
  assert.match(
    styles,
    /\.rxs-page\.rxs-page\.ffs-page > \.rxs-section:not\(\.ffs-subchapter\) \{\s*counter-increment: ffs-chapter;/,
  );
  assert.match(styles, /content: counter\(ffs-chapter, decimal-leading-zero\) \/ "";/);
  assert.match(component, /id="report"\s+className="rxs-section ffs-report-section ffs-subchapter"/);
  const order = [
    "overview",
    "specs",
    "performance",
    "report",
    "p16",
    // Owner (2026-10-23): #ultra folded into #suitup.
    "<FarFromSuitUp ",
    "stages",
    "theories",
    "system",
    "authority",
    "arsenal",
    "finishers",
    "<footer",
  ].map((mark) => component.indexOf(mark.startsWith("<") ? mark : `id="${mark}"`));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), "chapter order");
  // Owner (2026-10-23): the Rexonance site's five chapters; the chapter heads
  // carry its index. The kickers name the chapter (its CONTENTS code) and,
  // for a sub-chapter, its section after a slash: the number stands in the
  // forged numeral and the index alone (polish sweep, 2026-10-23: it stood
  // three times in a head).
  for (const mark of ["OVERVIEW", "OVERVIEW / SPECS", "OVERVIEW / PERFORMANCE", "OVERVIEW / REPORT", "PROCESSING CORE / P16"])
    assert.ok(component.includes(`<p lang="en">${mark}</p>`), mark);
  assert.doesNotMatch(component, /<p(?: lang="en")?>\d\d \/ [A-Z]/);
  assert.equal((component.match(/className="ffs-index" aria-hidden="true"/g) || []).length, 4);
  // The stage chapter: the form-sequence status and the five-form drawer
  // beside the liquid rail, the outlined form code behind the copy.
  assert.match(component, /<FarFromFormStatus stage=\{stage\} \/>/);
  assert.match(component, /<FarFromFormComparison selected=\{stage\} onChoose=\{selectStage\} \/>/);
  assert.match(component, /<i className="ffs-form-code" aria-hidden="true">/);
  assert.match(editorial, /FAR_FROM_SAGA_STAGE_ORDER\.indexOf\(stage\) \+ 1/);
  assert.match(formComparison, /<details className="ffs-form-comparison"/);
  assert.match(formComparison, /\{open \? \(/, "closed, the drawer creates no image request");
  assert.match(formComparison, /aria-controls="ffs-stage-panel"/);
  assert.match(formComparison, /aria-pressed=\{selected === key\}/);
  // The end card: the figure behind the last line, the way to the top first,
  // then the title and the three doors (the return last).
  const footer = component.slice(component.lastIndexOf("<footer"));
  assert.match(footer, /className="ffs-end-figure"[^]*?loading="lazy"/);
  assert.ok(footer.indexOf('className="ffs-footer-top"') < footer.indexOf("<div>"));
  assert.match(footer, /<p lang="en">FAR FROM SAGA \/ FINAL STAGE<\/p>/);
  assert.equal((footer.match(/<GuardedLink/g) || []).length, 3);
});

test("the redesign's type, motion and calm tiers", () => {
  // Type: the Rexonance type edition's scale and faces, in FAR FROM's palette.
  for (const token of [
    "--fft-step-6:",
    "--fft-forge:",
    "--fft-etch:",
    "--fft-gold:",
    "--fft-ice:",
    "--fft-violet:",
    "--fft-rainbow:",
  ])
    assert.ok(styles.includes(token), token);
  assert.match(styles, /font-family: "Rexonance Forge";[^}]*rexonance-forge-20261016\.woff2/);
  assert.match(styles, /font-family: "Rexonance Etch";[^}]*rexonance-etch-20261016\.woff2/);
  // The chapter heads: numeral, kicker, title, lede over a hairline.
  assert.match(styles, /> \.rxs-section > \.rxs-section-heading::before \{[^}]*-webkit-text-stroke: 1\.5px var\(--fft-gold\)/);
  assert.match(styles, /> \.rxs-section > \.rxs-section-heading::after \{[^}]*background: var\(--fft-rainbow-fade\)/);
  // Motion: the reveals are one IntersectionObserver armed after mount, only
  // where motion is allowed; the page grants motion on the same terms.
  assert.match(component, /data-motion-ready=\{motionReady \? "true" : "false"\}/);
  assert.match(component, /new IntersectionObserver\(/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /forced-colors: active/);
  assert.match(component, /worldEffects !== "economy"/);
  assert.match(component, /saveData === true/);
  assert.match(styles, /@media screen and \(prefers-reduced-motion: no-preference\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /@media \(forced-colors: active\)/);
  // The page's own chunk carries no engine and no scroll listener.
  assert.doesNotMatch(component, /addEventListener\("scroll"/);
  assert.doesNotMatch(editorial, /useEffect|addEventListener/);
  // House copy rules: plain official-site Japanese, no poetic motifs.
  for (const source of [component, editorial, formComparison])
    assert.doesNotMatch(source, /静かに|眠る|記録が|物語|祈り/);
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
  // Owner (2026-10-23): the two sentences naming レックス・ロワ and ゼウス are removed.
  // Owner (2026-10-23): spec notation unified — ヴィンクルム's body values carry
  // （est.）, ジャンプ力 reads 5000.0m, and the main compute of レクソナンス /
  // ファーフロム reads 50000〜YOPS / 60000〜YOPS (lower bounds).
  // Owner (2026-10-23): エクスプリームの加速機構は P14 — the table cell reads P14
  // and the 保留 sentence names 『P14（Extreme tuning）』; nothing else changed.
  // 2026-10-23, canon: that sentence describes Extreme's P14 in the Extreme
  // site's own words (「勝利経路の増殖と結果固定へ最適化された先行世代の」), not
  // as a tuning of Rexonance's P14; one phrase changed, nothing else.
  assert.equal(
    createHash("sha256").update(TEXT).digest("hex"),
    "d18baff05658ed66e99a22463489c3d2fea36884299d5f493a84a6bd36657185",
  );
  assert.doesNotMatch(TEXT, /個別比較値未確定|機構単体の正確な向上率は保留する/);
  assert.doesNotMatch(TEXT, /P14を高出力と結果固定へ最適化した/);
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
  // Owner (2026-10-23): chapter headings are catchphrases (「韋駄天？遅過ぎる」 and the like).
  assert.match(block, /<h2 id="ffs-report-title">差は、桁で見せる。<\/h2>/);
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
  // Titles in the page's cyber display face (owner, 2026-10-23); no Mincho.
  assert.doesNotMatch(compareStyles, /--ffs-mincho|"[^"\n]*Mincho[^"\n]*"/);
  assert.match(compareStyles, /\.ffs-page \.ffs-report summary h4,/);
  assert.match(compareStyles, /\.ffs-page \.ffs-p16-note h3 \{[^}]*font-family: var\(--fft-display\);/);
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
      ["パンチ力", "98.8t（est.）", "205.6t〜", "372.2t", "405.5t"],
      ["キック力", "198.8t（est.）", "308.9t〜", "483.5t", "502.9t"],
      ["ジャンプ力", "5000.0m（est.）", "1033.5m", "6000m", "8000m"],
      ["100m走力", "0.1秒（est.）", "0.002秒", "0.00021秒", "0.00018秒"],
      ["主演算", "10000YOPS", "20000YOPS", "50000〜YOPS", "60000〜YOPS"],
      ["副演算", "300TOPS", "5000TOPS", "9000TOPS", "9000TOPS"],
      ["加速機構", "P2", "P14", "P14", "P16"],
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

/* ---------------- #ultra: the ウルトラ sequence (2026-10-22) ---------------- */
// Owner: 「ファーフロム・ウルトラだけ体全身が白に染まった後、さらにナノマシンにより
// 追加部分が生成された後、…コンピュータの様な補助インターフェースが腕の外などに
// 展開されます。ウルトラだけ未来的で特殊なシークエンスで、更に別のナノマシンも使う」
const ultraMount = read("src/lib/far-from-ultra.ts");
const ultraScene = read("src/lib/far-from-ultra-scene.ts");
const ultraArt = read("src/lib/far-from-ultra-art.ts");
const ultraKit = read("src/lib/far-from-ultra-kit.ts");
const ULTRA_REVISION = "20261022";

test("ウルトラ is one of #suitup's forms: the selector after the runway picks ミドル … ウルトラ", () => {
  // Owner (2026-10-23): 「変身スクロールの後にミドルからウルトラまでのセレクターを置いて、
  // 一気にマックスまで変身したりウルトラが別枠なのを修正し、レクソナンスの特設ページと同様の仕組み」.
  assert.doesNotMatch(sections, /\["ultra", "ウルトラ", "ULTRA"\]/);
  // The side menu names the chapters as the bar and CONTENTS do (変身, and
  // 中核機構 under its CONTENTS code SYSTEM).
  assert.match(sections, /\["suitup", "変身", "SUIT-UP"\],\s*\["stages", "形態", "5 STAGES"\],\s*\["theories", "中核機構", "SYSTEM"\]/);
  assert.doesNotMatch(component, /FarFromUltra|id="ultra"/);
  assert.doesNotMatch(styles, /styles-far-from-ultra\.css/);
  const suitupSource = read("src/components/far-from-saga/far-from-suitup.tsx");
  const suitup = component.indexOf("<FarFromSuitUp stage={stage} onChoose={chooseQuietly} />");
  const stages = component.indexOf('id="stages"');
  assert.ok(suitup > 0 && stages > suitup, "suitup, then stages");
  // Owner (2026-10-23): the Rexonance site's five chapters. Each head's
  // kicker is its chapter's CONTENTS code (a sub-chapter's: the chapter's,
  // a slash, its own); the chapter's number is the numeral's and the index's.
  assert.match(suitupSource, /<p lang="en">SUIT-UP<\/p>/);
  for (const mark of [
    "OVERVIEW",
    "OVERVIEW / SPECS",
    "OVERVIEW / PERFORMANCE",
    "OVERVIEW / REPORT",
    "PROCESSING CORE / P16",
    "FIVE STAGES",
    "SYSTEM",
    "SYSTEM / ARMOR & OS",
    "SYSTEM / ABILITY", // Owner (2026-10-23): 神属権限 → 能力
    "SYSTEM / WEAPONS",
    "SYSTEM / FINISHER",
  ])
    assert.ok(component.includes(`<p lang="en">${mark}</p>`), mark);
  // The selector comes right after the runway, as a tablist over the five forms.
  const runwayAt = suitupSource.indexOf('id="far-from-assembly-runway"');
  const selectorAt = suitupSource.indexOf('role="tablist"');
  assert.ok(runwayAt > 0 && selectorAt > runwayAt, "the selector follows the runway");
  assert.match(suitupSource, /FAR_FROM_ASSEMBLY_FORMS\.map\(\(key\) => \(/);
  assert.match(suitupSource, /aria-selected=\{stage === key\}/);
  assert.match(suitupSource, /tabIndex=\{stage === key \? 0 : -1\}/);
  assert.match(suitupSource, /data-form=\{farFromRunwayForm\(stage\)\}/);
  // The old segment's words, moved verbatim into ウルトラ's ending.
  assert.ok(
    suitupSource.includes(
      "マックスから移行する、60秒間の最上位形態。全身が白に染まった後、ウルトラ専用のナノマシンが追加機構を生成し、腕の外側などに補助インターフェースが展開します。",
    ),
  );
  assert.match(suitupSource, /補助インターフェースの表示内容はイメージです。/);
  const record = read("src/components/final-stage/final-stage-data.ts");
  assert.ok(
    record.includes(
      "水色の結晶装甲が全身に大きく展開し、鋭く拡張された頭部、肩部の追加機構、幾重もの光輪と電子表示が出現する。",
    ),
  );
  for (const source of [suitupSource, ultraArt])
    assert.doesNotMatch(source, /静かに|眠る|記録が|物語|祈り/);
  // No canvas engine of the old segment on the page's path.
  assert.doesNotMatch(suitupSource, /far-from-ultra-scene|far-from-ultra-kit|mountFarFromUltra/);
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
  ];
  for (const text of texts) assert.match(text, subset, text);
  // The crown names the form in katakana only (owner, 2026-10-23), drawn in
  // the page's Japanese display face behind the HUD face.
  assert.equal(hud.crown.label, "ウルトラ 60S");
  assert.match(art.FAR_FROM_ULTRA_HUD_FONT, /^"Michroma", "Oxanium", "M PLUS 1",/);
  // Terms from the record only.
  const record = read("src/components/final-stage/final-stage-data.ts");
  for (const term of [
    "SA-GA OS 6.1",
    "KHAOS DeuX",
    "KOSMOS DeuX",
    "FARFROM DRIVE",
    "P16",
    "60000〜YOPS",
    "9000TOPS",
    "300Core",
    "60秒",
  ])
    assert.ok(record.includes(term), term);
  // Emergence (owner, 2026-10-22: 「補助パネルの出現含め、ウルトラはプロセスがかなり
  // 未来的」): projected from an emitter on the arm — the beam, the cone — the
  // wireframe tracing itself, the hex fill sweeping outward, the glass
  // resolving through a glitch and a scan, the read-outs typing on, then
  // settling; data packets on the tethers; one system sync pulse before the
  // crown gauge starts. Every phase is a share of the panel's own window.
  const EM = art.FAR_FROM_ULTRA_EMERGE;
  for (const phase of ["beam", "cone", "wire", "fill", "glass", "glitch", "scan", "type", "settle"])
    assert.ok(EM[phase][0] < EM[phase][1] && EM[phase][1] <= 1, phase);
  assert.ok(EM.beam[0] < EM.wire[0] && EM.wire[0] < EM.fill[0] && EM.fill[0] < EM.glitch[0]);
  assert.ok(EM.glitch[0] < EM.type[0] + 0.1 && EM.type[1] <= EM.settle[1]);
  for (const line of [
    /const beam = easeOut\(span\(v, EM\.beam\[0\], EM\.beam\[1\]\)\);/,
    /const cone = bell\(span\(v, EM\.cone\[0\], EM\.cone\[1\]\)\);/,
    /const wire = easeOut\(span\(v, EM\.wire\[0\], EM\.wire\[1\]\)\);/,
    /const fill = span\(v, EM\.fill\[0\], EM\.fill\[1\]\);/,
    /const glitch = span\(v, EM\.glitch\[0\], EM\.glitch\[1\]\);/,
    /const s = span\(v, EM\.scan\[0\], EM\.scan\[1\]\);/,
    /const settleV = span\(v, EM\.settle\[0\], EM\.settle\[1\]\);/,
    /left = edge\(context, 0, 0, 0, -hh, left\);/,
    /hexes\(context, xo, hh, radius, Math\.max\(0, fill - 0\.1\), fill \+ 0\.04\);/,
    /const f = \(q \* 7 \+ m \/ 3 \+ p \* 0\.17\) % 1;/,
    /const sync = bell\(span\(q, SYNC\[0\] \+ p \* 0\.006, SYNC\[1\] \+ p \* 0\.006\)\);/,
  ])
    assert.match(ultraScene, line);
  const SYNC = art.FAR_FROM_ULTRA_SYNC;
  const crownStart =
    art.FAR_FROM_ULTRA_WINDOWS.interface[0] +
    hud.crown.at *
      (art.FAR_FROM_ULTRA_WINDOWS.interface[1] - art.FAR_FROM_ULTRA_WINDOWS.interface[0]);
  const lastPanel = Math.max(...hud.panels.map((panel) => panel.at + panel.span));
  const lastPanelEnd =
    art.FAR_FROM_ULTRA_WINDOWS.interface[0] +
    lastPanel * (art.FAR_FROM_ULTRA_WINDOWS.interface[1] - art.FAR_FROM_ULTRA_WINDOWS.interface[0]);
  assert.ok(
    lastPanelEnd <= SYNC[0] && SYNC[1] <= crownStart,
    "panels settle, then the sync, then the gauge",
  );
  // The white is a digital wavefront (cells read ahead, rewritten at the
  // front, an afterimage grid behind); the units arrive defocused, tumble,
  // square into kit C's lit data tiles as they lock, and hold them on the
  // armour before the crystal resolves; the halo rings counter-rotate into
  // alignment with a locking flash.
  assert.match(
    ultraScene,
    /const AHEAD = 2\.2 \* T;[^]*?const WRITE = 2\.6 \* T;[^]*?const AFTER = 7 \* T;/,
  );
  assert.match(ultraScene, /kitCells\.bokeh\.x\[tone\]/);
  assert.match(ultraScene, /kitCells\.unfold\.x\[tone\] \+ CELL \* frameK/);
  assert.match(
    ultraScene,
    /kitCells\.unfold\.x\[tone\] \+ CELL \* \(kitCells\.unfold\.frames - 1\)/,
  );
  assert.match(ultraScene, /const TILE_HOLD = 0\.04;/);
  assert.match(ultraScene, /const turn = \(k % 2 \? -1\.4 : 1\.1\) \* easeOut\(v\);/);
  assert.match(
    ultraScene,
    /const lock = bell\(span\(S\[S_HALO\], spec\.to, spec\.to \+ 0\.08\)\);/,
  );
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
  // (#suitup's id lives in far-from-suitup.tsx: the slice ends at its mount.)
  const block = component.slice(
    component.indexOf('id="p16"'),
    component.indexOf("<FarFromSuitUp />"),
  );
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
  assert.equal(
    p16.P16_VS_EXTREME.source,
    "エクスプリームには、勝利経路の増殖と結果固定へ最適化された先行世代の『P14（Extreme tuning）』が搭載されており、P16との機構単体の比較値は暫定的な設定案として扱う。",
  );
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
  // 暫定ベンチマーク wherever the figures appear: the overview, and the
  // comparator's header, which says 暫定ベンチマーク／設定案 over the Extreme option.
  assert.equal(p16View.match(/<ProvisionalTag \/>/g)?.length, 1);
  assert.match(p16View, /<ProvisionalTag proposal=\{baseline === "extreme"\} \/>/);
  assert.match(p16View, /proposal \? "暫定ベンチマーク／設定案" : "暫定ベンチマーク"/);
  assert.match(p16View, /（暫定ベンチマーク）/);
  assert.match(p16View, /P16（暫定）/);
  // The エクスプリーム option draws the 設定案 with the P14 option's cards
  // (base, P16, bars, reading, change), its strength, and its ※ notes.
  assert.match(p16View, /<ExtremeMetricRow key=\{metric\.key\} metric=\{metric\} \/>/);
  assert.match(p16View, /<ExtremeStrength \/>/);
  assert.match(p16View, /P16_VS_EXTREME\.notes\.map/);
  assert.doesNotMatch(
    p16View,
    /ffs-p16-withheld|P16_VS_EXTREME\.value|ffs-p16-proposal|ffs-p16-burst/,
  );
  for (const [base, unit] of [
    ["レクソナンス", "P14"],
    ["ヴィンクルム", "P2"],
    ["エクスプリーム", "P14"],
  ])
    assert.match(p16View, new RegExp(`<BaseValue form="${base}" unit="${unit}" />`), base);
  // Every option's cards say how to read them (P14, P2, Extreme); the
  // Extreme cards add the two indices under it.
  assert.equal(p16View.match(/\{reading\(/g)?.length, 3);
  assert.match(
    p16View,
    /\{reading\(metric\.lowerIsBetter\)\}\s*<small>\s*指数 \{metric\.extreme\} → \{metric\.p16\}/,
  );
  // The comparator: native radios over P14比 / P2比 / P14比, each over the form
  // that carries the unit, so Rexonance's P14 and Extreme's read apart.
  assert.match(p16View, /\{ key: "p14", label: "P14比", form: "レクソナンス" \}/);
  assert.match(p16View, /\{ key: "p2", label: "P2比", form: "ヴィンクルム" \}/);
  assert.match(p16View, /\{ key: "extreme", label: "P14比", form: "エクスプリーム" \}/);
  assert.match(p16View, /extreme: `\$\{EXTREME_P14_NAME\}比`/);
  assert.match(p16View, /type="radio"/);
  // Owner (2026-10-23): the owner's P16 artwork replaces the drawn core.
  assert.match(p16View, /src="\/far-from-p16-core-20261023-720\.webp"/);
  assert.doesNotMatch(p16View, /P16のビジュアルは準備中です/);
});

// Owner (2026-10-23): 「ファーフロムのページのフォントは未来風なサイバー風なものにして。」
test("the cyber type: no Mincho, one route-only display face as text= subsets after paint", () => {
  for (const sheet of [
    "src/styles-far-from-saga.css",
    "src/styles-far-from-compare.css",
    // (styles-far-from-ultra.css is gone: ウルトラ is one of #suitup's forms, owner 2026-10-23.)
    "src/styles-far-from-suitup.css",
    "src/styles-far-from-entry.css",
  ])
    assert.doesNotMatch(read(sheet), /--ffs-mincho|"[^"\n]*Mincho[^"\n]*"|[\s,]serif;/, sheet);
  // Faces: Saira ("Rexonance Forge") for Latin and figures, M PLUS 1 for the
  // Japanese, Michroma for kickers, Oxanium for data, the system gothic to read.
  assert.match(styles, /--fft-jp-display:\s*"M PLUS 1", "Hiragino Sans"/);
  assert.match(styles, /--fft-display: "Rexonance Forge", var\(--fft-jp-display\);/);
  assert.match(
    styles,
    /--fft-etch: "Michroma", "Rexonance Etch", "Oxanium", var\(--fft-jp-display\);/,
  );
  assert.match(styles, /--fft-mono: "Oxanium", var\(--fft-jp-display\);/);
  assert.match(styles, /--fft-text:\s*-apple-system, BlinkMacSystemFont, "Hiragino Sans"/);
  // The shared chrome and the runways read the same tokens.
  for (const token of [
    "--rxs-font-display: var(--fft-display);",
    "--rxs-font-text: var(--fft-text);",
    "--dx-hud: var(--fft-etch);",
    "--dx-mono: var(--fft-mono);",
  ])
    assert.ok(styles.includes(token), token);
  // The runway keeps its HUD metrics (the call is sized to Michroma + Oxanium).
  assert.match(read("src/styles-far-from-suitup.css"), /--dx-hud: "Michroma", "Oxanium", var\(--fft-jp-display\);/);
  // Figures are tabular; the spec plates forge theirs.
  assert.match(
    styles,
    /\.ffs-specs dd \{[^}]*font-family: var\(--fft-forge\)[^}]*font-variant-numeric: tabular-nums/,
  );
  // Delivery: route-only, never render-blocking, text= subsets, display=swap.
  const fonts = read("src/lib/far-from-fonts.ts");
  assert.match(fonts, /family=M\+PLUS\+1:wght@\$\{weight\}&display=swap/);
  assert.match(fonts, /&text=\$\{encodeURIComponent\(text\)\}/);
  assert.match(fonts, /requestIdleCallback/);
  assert.match(fonts, /saveData === true/);
  // Seeded with the five forms' names, so a switch never fetches a refreshed
  // subset that re-sets every display label once it lands (a layout shift).
  assert.match(
    component,
    /useEffect\(\(\) => mountFarFromFonts\(pageRef\.current, FAR_FROM_SAGA\.stagesLine\), \[\]\)/,
  );
  assert.match(fonts, /export function mountFarFromFonts\(root: HTMLElement \| null, seed = ""\)/);
  assert.match(fonts, /for \(const char of seed\)/);
  assert.doesNotMatch(route, /M\+PLUS|far-from-fonts/, "no head link: nothing blocks first paint");
  assert.doesNotMatch(read("src/lib/site-fonts.ts"), /M\+PLUS/, "never site-wide");
});

// Owner (2026-10-23): 「『MIDDLE』と『ハイ』など英語とカタカナが混在しているので、
// ミドルからウルトラまでのみカタカナ表記に統一して」
test("the five forms are named in katakana only wherever the page's own labels name them", () => {
  const strip = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const file of [
    "src/components/far-from-saga/far-from-saga.tsx",
    "src/components/far-from-saga/far-from-editorial.tsx",
    "src/components/far-from-saga/far-from-form-comparison.tsx",
    "src/components/far-from-saga/far-from-stage-switch.tsx",
    "src/components/far-from-saga/far-from-ultra-deploy.tsx",
    "src/lib/far-from-ultra-deploy.ts",
    "src/components/far-from-saga/far-from-suitup.tsx",
    "src/components/far-from-saga/far-from-p16.tsx",
    "src/components/far-from-saga/far-from-comparison.tsx",
    "src/components/far-from-saga/far-from-report.tsx",
    "src/components/far-from-saga/far-from-entry-sequence.tsx",
    "src/lib/far-from-ultra-art.ts",
    "src/lib/far-from-entry-calls.ts",
    "src/lib/far-from-assembly.ts",
    "src/lib/special-site-sections.ts",
  ])
    assert.doesNotMatch(strip(read(file)), /\b(MIDDLE|XHIGH|HIGH|MAX|ULTRA)\b/, file);
  // The record's English codes stay in the record and are never printed here.
  // Owner (2026-10-23): the selector after the runway names them in katakana too.
  const suitupSource = read("src/components/far-from-saga/far-from-suitup.tsx");
  for (const source of [component, editorial, formComparison, suitupSource])
    assert.doesNotMatch(
      source,
      /stages\[key\]\.code|activeStage\.code|form\.code|ultra\.code|max\.code/,
    );
  assert.match(component, /<span>\{FAR_FROM_SAGA\.stages\[key\]\.label\}<\/span>\n\s*<\/button>/);
  assert.match(
    component,
    /<i className="ffs-form-code" aria-hidden="true">\s*\{activeStage\.label\}/,
  );
  assert.match(editorial, /ミドル <span lang="en">\/ STANDARD<\/span>/);
  assert.match(suitupSource, /<span>\{FAR_FROM_SAGA\.stages\[key\]\.label\}<\/span>\n\s*<\/button>/);
  assert.match(ultraArt, /\{ phase: "max", step: "01", label: "マックス" \}/);
  // /final-stage's Far From selector (its tabs and the panel) prints the katakana only.
  const finalStage = read("src/components/final-stage/final-stage.tsx");
  assert.doesNotMatch(finalStage, /stages\[key\]\.code|activeStage\.code/);
  assert.match(finalStage, /<span>\{FAR_FROM_SAGA\.stages\[key\]\.label\}<\/span>\n\s*<\/button>/);
  // The owner's own words keep their English: the calls and the report text.
  assert.match(
    read("src/components/final-stage/final-stage-data.ts"),
    /"MIDDLE！HIGH！XHIGH！MAX！ULTRA！"/,
  );
  assert.match(TEXT, /MIDDLEの時点で/);
  assert.match(TEXT, /ULTRAの60秒制限/);
});

// Owner (2026-10-23): 「ファーフロムの比較画面にて、エクスプリームはP14なので合わせて。
// また、P14との性能差は想像して生成してみて」. Then 「適当な部分もブラッシュアップして」:
// the 設定案 keeps to the Extreme site's canon, reads as plain site copy, and
// is drawn as the comparator's other options are.
test("Extreme's 加速機構 is P14 (Extreme tuning), with an invented P16 benchmark that adds up", () => {
  const vs = p16.P16_VS_EXTREME;
  const extremeSite = read("src/components/extreme-saga/extreme-saga.tsx");
  // The Extreme special site's name, on the console and in the comparator.
  assert.equal(p16.EXTREME_P14_NAME, "P14（Extreme tuning）");
  assert.match(extremeSite, /"P14（Extreme tuning）"/);
  const accel = data.BASIC_TEXT_ROWS.find((row) => row.label === "加速機構");
  assert.deepEqual(accel.values, { vinculum: "P2", extreme: "P14", rexonance: "P14", farFrom: "P16" });
  assert.equal(accel.shown.extreme, "P14（Extreme tuning）");
  assert.equal(accel.shown.rexonance, "P14");
  // The name holds together: a narrow row breaks before 「（」, never inside it.
  assert.match(comparison, /<UnitName value=\{row\.shown\[item\.key\]\} \/>/);
  assert.match(p16View, /<span className="ffs-unit-tuning">\{value\.slice\(at\)\}<\/span>/);
  assert.match(compareStyles, /\.ffs-page \.ffs-unit-tuning \{\s*white-space: nowrap;/);
  // The console's エクスプリーム view: the same figures, labelled, with the notes.
  assert.match(comparison, /\{baseline === "extreme" \? <AccelVsExtreme \/> : null\}/);
  assert.match(comparison, /暫定ベンチマーク／設定案/);
  assert.match(
    comparison,
    /\{p16ChangeAgainstExtremeFigure\(metric\)\}\s*<small>\{metric\.verb\}<\/small>/,
  );
  assert.match(comparison, /P16_VS_EXTREME\.notes\.map/);
  assert.doesNotMatch(comparison, /個別比較値未確定|data-pending/);

  // Canon. The Extreme site: エクスプリーム専用のP14 is the earlier-generation
  // core, its individual figures unpublished. Rexonance's P14 accelerates only
  // what it needs. Our words say the same, and never make the two one generation.
  assert.match(extremeSite, /勝利経路の増殖と結果固定へ最適化された先行世代の演算コアです/);
  assert.match(extremeSite, /個別数値は未公表です/);
  assert.match(read("src/lib/rexonance-profile.ts"), /必要な処理だけを選択的に加速し/);
  for (const line of [vs.source, ...vs.text, ...vs.notes])
    assert.doesNotMatch(line, /第14世代|同じ世代/, line);
  assert.match(
    vs.source,
    /勝利経路の増殖と結果固定へ最適化された先行世代の『P14（Extreme tuning）』/,
  );
  const reading = vs.text.join("");
  for (const term of [
    "エクスプリーム専用",
    "KHAOS Ultra",
    "KOSMOS Ultra",
    "勝利経路の増殖",
    "結果固定",
    "先行世代",
  ])
    assert.ok(reading.includes(term), term);
  assert.match(reading, /レクソナンスのP14はこの方式を、必要な処理だけを選んで加速する形へ改良し/);
  // The lineage: P14 is Extreme's earlier generation, then Rexonance's.
  assert.deepEqual(
    p16.P16_LINEAGE.steps.map((step) => [step.unit, [...step.forms]]),
    [
      ["P2", ["ヴィンクルム"]],
      ["P14", ["エクスプリーム", "レクソナンス"]],
      ["P16", ["ファーフロム"]],
    ],
  );

  // The four metrics are the P14 comparator's, in its order.
  assert.deepEqual(
    vs.metrics.map((m) => [m.key, m.label, m.verb, m.lowerIsBetter]),
    p16.P16_METRICS.map((m) => [m.key, m.label, m.verb, m.lowerIsBetter]),
  );
  // Rexonance's P14 = 100. P16's column is the owner's P14 benchmark.
  for (const [index, metric] of vs.metrics.entries())
    assert.equal(metric.p16, 100 + p16.P16_METRICS[index].change, metric.label);
  // Extreme's column: throughput and heat follow the owner's 暫定評価 table
  // (Extreme / Rexonance), as does P16's (FAR FROM / Rexonance).
  const [throughput, wait, phase, heat] = vs.metrics;
  assert.equal(throughput.extreme, (I.accel("extreme") / I.accel("rexonance")) * 100);
  assert.equal(throughput.p16, (I.accel(ff) / I.accel("rexonance")) * 100);
  assert.equal(heat.extreme, (I.heat("extreme") / I.heat("rexonance")) * 100);
  assert.equal(heat.p16, (I.heat(ff) / I.heat("rexonance")) * 100);
  // The wait follows the throughput: a queue drained at 80% waits 100 / 80.
  assert.equal(wait.extreme, (100 / throughput.extreme) * 100);
  // Extreme tuning is hotter, slower to start priority work and less in phase;
  // it leads Rexonance's P14 in one item, its short peak.
  assert.ok(throughput.extreme < 100 && wait.extreme > 100 && phase.extreme > 100);
  assert.ok(heat.extreme > 100 && vs.burst.extreme > 100);
  // Every derived percentage.
  assert.deepEqual(vs.metrics.map(p16.p16AgainstExtreme), [187.5, 52, 50, 56.15]);
  assert.deepEqual(vs.metrics.map(p16.p16ChangeAgainstExtreme), [87.5, -48, -50, -43.85]);
  assert.deepEqual(vs.metrics.map(p16.p16AgainstExtremeText), ["187.5%", "52%", "50%", "約56.15%"]);
  // Signed as the P14 option prints its own (「−35% 短縮」), 約 first as the console does.
  assert.deepEqual(vs.metrics.map(p16.p16ChangeAgainstExtremeFigure), [
    "+87.5%",
    "−48%",
    "−50%",
    "約−43.85%",
  ]);
  assert.deepEqual(vs.metrics.map(p16.p16ChangeAgainstExtremeText), [
    "+87.5% 向上",
    "−48% 短縮",
    "−50% 減少",
    "約−43.85% 削減",
  ]);
  // The bars' labels, as the P14 cards' say 「35%短縮」.
  assert.deepEqual(vs.metrics.map(p16.p16ChangeAgainstExtremeSpoken), [
    "87.5%向上",
    "48%短縮",
    "50%減少",
    "約43.85%削減",
  ]);
  // 87.5% = the 選択処理 row's FAR FROM 150 / Extreme 80; 43.85% = the owner's
  // own 「エクスプリーム比約43.85%」 heat cut.
  assert.equal(p16.p16ChangeAgainstExtreme(throughput), gain(I.accel(ff), I.accel("extreme")));
  assert.equal(-p16.p16ChangeAgainstExtreme(heat), half(cut(I.heat(ff), I.heat("extreme"))));
  assert.ok(TEXT.includes("エクスプリーム比約43.85%"));
  // The reading: four sentences, two a paragraph, and no figure (the cards
  // carry them). The notes: the scale, and what the figures are.
  assert.equal(vs.text.length, 2);
  for (const paragraph of vs.text) assert.equal(report.sentencesOf(paragraph).length, 2, paragraph);
  assert.doesNotMatch(reading, /\d+(?:\.\d+)?%|指数/);
  assert.deepEqual(vs.notes, [
    "指数は、レクソナンスのP14を100とした値です。",
    "P14（Extreme tuning）の個別数値は未公表です。ここに示す数値は、この比較のために作成した暫定の設定案で、確定スペックではありません。",
  ]);
  // Not passed off as the owner's; plain site copy.
  for (const line of [...vs.text, ...vs.notes]) {
    assert.ok(!TEXT.includes(line), line);
    assert.doesNotMatch(line, /静かに|眠る|記録が/);
  }
});
