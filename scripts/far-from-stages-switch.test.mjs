import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";

/* FAR FROM SAGA #stages — the form switch (owner, 2026-10-23):
   「スクロール後にウルトラに切り替えても、サイバーなパネルは後から出現する様に
   して下さい。」「『03 形態』でウルトラ切り替え時のみ勝手に画面が上下するのも
   修正して。」「これらの切り替えもレクソナンスの様な切り替え効果が出る様に
   して。スクロールも同様に。」 */

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(root, path), "utf8");
const page = read("src/components/far-from-saga/far-from-saga.tsx");
const deploySource = read("src/components/far-from-saga/far-from-ultra-deploy.tsx");
const switchSource = read("src/components/far-from-saga/far-from-stage-switch.tsx");
const styles = read("src/styles-far-from-saga.css");
const artwork = read("src/lib/far-from-saga-artwork.ts");
const REVISION = "20261022";

/* A small loader: the page's TSX through the TypeScript transpiler, with
   the "@/" alias, so the real components render to static markup here. */
const require = createRequire(import.meta.url);
const modules = new Map();
function load(path) {
  const absolute = resolve(root, path);
  if (modules.has(absolute)) return modules.get(absolute).exports;
  const module = { exports: {} };
  modules.set(absolute, module);
  const output = ts.transpileModule(readFileSync(absolute, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: absolute,
  }).outputText;
  const local = (specifier) => {
    const base = specifier.startsWith("@/")
      ? resolve(root, "src", specifier.slice(2))
      : resolve(dirname(absolute), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`])
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    throw new Error(`${path}: cannot resolve ${specifier}`);
  };
  runInThisContext(`(function (exports, require, module) {${output}\n})`)(
    module.exports,
    (specifier) =>
      specifier.startsWith(".") || specifier.startsWith("@/")
        ? load(local(specifier))
        : require(specifier),
    module,
  );
  return module.exports;
}
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const render = (element) => renderToStaticMarkup(element);
const deploy = {
  ...load("src/components/far-from-saga/far-from-ultra-deploy.tsx"),
  ...load("src/lib/far-from-ultra-deploy.ts"),
};
const stageSwitch = load("src/components/far-from-saga/far-from-stage-switch.tsx");
const { FAR_FROM_SAGA } = load("src/components/final-stage/final-stage-data.ts");
const art = load("src/lib/far-from-saga-artwork.ts");
const { planStageCall } = load("src/lib/rexonance-stage-call.ts");

/** A WebP's canvas size (VP8, VP8L or VP8X). */
function webpSize(file) {
  const buffer = readFileSync(file);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP");
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X")
    return [1 + buffer.readUIntLE(24, 3), 1 + buffer.readUIntLE(27, 3)];
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
}

test("ultraBase: ウルトラ before its interfaces, one more stem in the versioned, budgeted set", () => {
  assert.deepEqual(art.FAR_FROM_SAGA_ULTRA_BASE, {
    src: `/far-from-saga-${REVISION}/ultra-base-1280.webp`,
    width: 1083,
    height: 1452,
  });
  // The same widths and caps as the five forms (build-far-from-saga-artwork.mjs).
  const caps = { 640: 200_000, 960: 350_000, 1280: 480_000 };
  for (const [width, cap] of Object.entries(caps)) {
    const file = resolve(root, `public/far-from-saga-${REVISION}/ultra-base-${width}.webp`);
    assert.ok(existsSync(file), file);
    assert.ok(statSync(file).size <= cap, `ultra-base-${width} within ${cap} bytes`);
    const [w, h] = webpSize(file);
    assert.equal(w, Math.min(Number(width), 1083), `ultra-base-${width} width`);
    // The base keeps the painted ウルトラ's aspect, so the cover box is shared.
    assert.ok(Math.abs(w / h - 1280 / 1716) < 0.002, `ultra-base-${width} aspect`);
  }
  assert.ok(existsSync(resolve(root, `design/far-from-saga-${REVISION}/ultra-base.webp`)));
  // One srcset helper serves it; the five forms' table is unchanged.
  assert.match(art.farFromImage("ultraBase").srcSet, /ultra-base-640\.webp 640w, .*ultra-base-1280\.webp 1083w$/);
  assert.deepEqual(Object.keys(art.FAR_FROM_SAGA_ARTWORK), ["middle", "high", "xhigh", "max", "ultra"]);
  assert.match(artwork, /export type FarFromArtworkKey = FarFromStageKey \| "ultraBase"/);
  const script = read("scripts/build-far-from-saga-artwork.mjs");
  assert.match(script, /FAR_FROM_SAGA_ULTRA_BASE/);
  assert.match(script, /\["ultraBase", "ultra-base", FAR_FROM_SAGA_ULTRA_BASE\]/);
});

test("ウルトラ shows its base first; the interfaces start hidden and deploy once on screen", () => {
  // The panel takes the base picture wherever the deploy runs.
  assert.match(page, /const ultraDeploys = stage === "ultra" && motionReady && stageMotionAllowed\(\);/);
  assert.match(page, /const artKey = ultraDeploys \? "ultraBase" : stage;/);
  assert.match(page, /\{\.\.\.farFromImage\(artKey, stage !== "middle"\)\}/);
  assert.match(page, /\{ultraDeploys \? \(\s*<FarFromInterfaceDeploy/);
  // Server / first render: no data-run, so every part is hidden.
  const markup = render(React.createElement(deploy.FarFromInterfaceDeploy, { delayMs: 640 }));
  assert.match(markup, /^<svg class="ffs-ultra-deploy" viewBox="0 0 1083 1452" aria-hidden="true"/);
  assert.doesNotMatch(markup, /data-run/);
  assert.match(markup, /--ffd-delay:640ms/);
  assert.match(styles, /\.ffs-ultra-deploy:not\(\[data-run\]\) \{\s*visibility: hidden;/);
  // Every deploy animation waits for data-run.
  const motion = styles.slice(styles.indexOf("ウルトラ's interfaces: emitter"));
  for (const part of ["ffd-emitter", "ffd-beam", "ffd-cone", "ffd-wire", "ffd-glitch", "ffd-scan", "ffd-settle", "ffd-tether"])
    assert.match(motion, new RegExp(`\\.ffs-ultra-deploy\\[data-run\\][^{]*\\.${part} \\{`), part);
  // data-run is set by an IntersectionObserver on the figure, not on mount.
  assert.match(deploySource, /new IntersectionObserver\(/);
  assert.match(deploySource, /observer\.observe\(figure\)/);
  assert.match(deploySource, /data-run=\{run \? "true" : undefined\}/);
  // The panels, rings and gauge, in the #ultra sequence's order of parts.
  for (const id of ["l1", "r1", "l2", "r2"]) assert.match(markup, new RegExp(`data-panel="${id}"`));
  assert.match(markup, /data-ring="wl"/);
  assert.match(markup, /data-ring="wr"/);
  assert.match(markup, /class="ffd-crown"/);
  for (const part of ["ffd-emitter", "ffd-beam", "ffd-cone", "ffd-wire", "ffd-hex", "ffd-glitch", "ffd-scan", "ffd-settle", "ffd-tether"])
    assert.match(markup, new RegExp(`class="${part}"`), part);
  // The read-outs are the record's terms (and the form's katakana name).
  const record = JSON.stringify(FAR_FROM_SAGA) + read("src/lib/far-from-ultra-art.ts");
  for (const panel of deploy.FAR_FROM_ULTRA_DEPLOY_PANELS) {
    for (const word of [panel.title, ...panel.lines].flatMap((line) => line.split(" ")))
      assert.ok(record.includes(word) || /^\d+$/.test(word), `${panel.id}: ${word}`);
    // Inside the band a 390 px figure still shows of the cover-fitted picture.
    assert.ok(panel.x >= 48 && panel.x + panel.w <= 1035, `${panel.id} inside x 48–1035`);
  }
  assert.match(markup, />ウ<\/tspan><tspan[^>]*>ル<\/tspan><tspan[^>]*>ト<\/tspan><tspan[^>]*>ラ</);
  // The layer is the picture's own cover box at every breakpoint.
  assert.match(styles, /\.ffs-stage-panel > figure \{\s*grid-area: figure;[^}]*container-type: size;/);
  assert.match(styles, /width: max\(100cqw, 100cqh \* 1083 \/ 1452\);/);
  assert.match(styles, /top: calc\(\(100cqh - max\(100cqh, 100cqw \* 1452 \/ 1083\)\) \* 0\.05\);/);
  assert.match(styles, /figure\s*> \.ffs-stage-art \{\s*animation: mx-settle linear both;/);
});

test("every switch back to ウルトラ deploys again: the figure is keyed by form", () => {
  assert.match(page, /<figure key=\{stage\} data-art=\{artKey\}>/);
  const figure = page.slice(page.indexOf("<figure key={stage}"), page.indexOf("</figure>"));
  assert.match(figure, /<FarFromInterfaceDeploy/);
  // Mounted fresh, it observes again (an effect with no dependencies), so a
  // tab, a swipe, the keys, the drawer, the selector or a deep link all
  // re-run it.
  assert.match(deploySource, /observer\.observe\(figure\);\s*return \(\) => observer\.disconnect\(\);\s*\}, \[\]\);/);
  assert.match(page, /const STAGE_LINK = \/\^#stages-\(middle\|high\|xhigh\|max\|ultra\)\$\/;/);
  assert.match(page, /window\.addEventListener\("hashchange", follow\)/);
  // Owner (2026-10-24): one form-slider shape (src/components/special/form-slider.tsx).
  assert.match(page, /onSelect=\{selectStage\}/);
  assert.match(page, /if \(next\) selectStage\(next\);/);
  assert.match(page, /<FarFromFormComparison selected=\{stage\} onChoose=\{selectStage\} \/>/);
  assert.match(page, /<FarFromSuitUp stage=\{stage\} onChoose=\{chooseQuietly\} \/>/);
  // Under a card the deploy starts after the figure has risen.
  assert.match(page, /stageEntrance\?\.kind === "card" \? stageEntrance\.delayMs \+ 260 : 160/);
});

test("the calm tiers: the painted ウルトラ at once, no card, no entrance, no deploy", () => {
  assert.match(page, /function stageMotionAllowed\(\) \{/);
  for (const term of [
    "document.hidden",
    '"(prefers-reduced-motion: reduce)"',
    '"(forced-colors: active)"',
    'worldEffects === "economy"',
    "connection?.saveData",
    "/^(slow-)?2g$/",
  ])
    assert.ok(page.slice(page.indexOf("function stageMotionAllowed")).includes(term), term);
  // Not allowed: the rest guard never mounts a card.
  assert.deepEqual(
    planStageCall({ motionAllowed: false, cardMounted: false, cardElapsedMs: 0, sinceNaturalExitMs: Infinity }),
    { action: "skip", entrance: { kind: "quiet", delayMs: 0 } },
  );
  assert.match(page, /setStageEntrance\(motionAllowed \? plan\.entrance : null\);/);
  // The picture: the painted ウルトラ (FAR_FROM_SAGA_ARTWORK.ultra) when calm.
  assert.match(page, /const activeArt = ultraDeploys \? FAR_FROM_SAGA_ULTRA_BASE : FAR_FROM_SAGA_ARTWORK\[stage\];/);
  // The sheet: every switch animation sits under no-preference / no forced
  // colours, and the ornaments are removed in the calm tiers.
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\) and \(forced-colors: none\) \{\s*\/\* The card cuts in opaque/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s*\.ffs-page > \.ffs-form-call,\s*\.ffs-page \.ffs-stage-tune,/);
  assert.match(styles, /@media \(forced-colors: active\) \{\s*\.ffs-page > \.ffs-form-call,[^}]*\.ffs-page \.ffs-ultra-deploy \{\s*display: none;/);
  assert.match(styles, /html\[data-world-effects="economy"\] \.ffs-page > \.ffs-form-call,/);
});

test("no switch moves the page: the panel keeps its place, and is as tall as its form's copy", () => {
  // The copy is the form's own (polish sweep, 2026-10-23): no hidden copies
  // pad the cell to the longest form's, which left a blank screen under
  // ミドル's two paragraphs on phones. The panel's top edge is held instead.
  assert.doesNotMatch(page, /ffs-stage-sizer/);
  assert.doesNotMatch(styles, /ffs-stage-sizer/);
  assert.match(styles, /\.ffs-stage-panel > div \{\s*grid-area: copy;/);
  assert.match(styles, /grid-template-areas:\s*"figure"\s*"copy";/);
  // The figure keeps the shared sheet's fixed box; the picture covers it,
  // whatever its intrinsic size (1092×1500 … 1280×1716).
  assert.match(read("src/styles-rexonance-saga.css"), /\.rxs-stage-panel figure \{\s*position: relative;\s*height: min\(74vw, 800px\);/);
  assert.match(read("src/styles-rexonance-saga.css"), /\.rxs-stage-panel img \{\s*width: 100%;\s*height: 100%;\s*object-fit: cover;/);
  assert.match(styles, /figure > \.ffs-stage-art \{\s*position: absolute;\s*inset: 0;/);
  // Content above (the selector after the runway grows for ウルトラ's note):
  // the panel's place is noted before the switch and restored before paint.
  assert.match(page, /panelAnchor\.current =\s*panel && panel\.bottom > 0 && panel\.top < window\.innerHeight \? panel\.top : null;/);
  assert.match(page, /useLayoutEffect\(\(\) => \{\s*const before = panelAnchor\.current;[\s\S]*?const delta = panel\.getBoundingClientRect\(\)\.top - before;\s*if \(Math\.abs\(delta\) >= 1\) window\.scrollBy\(\{ top: delta, left: 0, behavior: "instant" \}\);\s*\}, \[stage\]\);/);
  // The browser's scroll anchoring stays on (it compensates what settles
  // late above the reader: the page's compensation and it were measured
  // exact together, +211px at 390, +107px at 1024, in every run); and the
  // runway's status keeps two lines (one while loading, two once ready),
  // as the Rexonance page reserves them, so nothing above #stages changes
  // with the suit's load.
  assert.doesNotMatch(styles, /overflow-anchor/);
  assert.match(read("src/styles-far-from-suitup.css"), /\.ffs-assembly-status \{\s*min-height: 3\.2em;\s*min-height: 2lh;/);
  // No switch path scrolls or focuses with a scroll of its own.
  const select = page.slice(page.indexOf("const selectStage = useCallback("), page.indexOf("const chooseQuietly"));
  assert.doesNotMatch(select, /scrollIntoView|scrollTo|\.focus\(/);
  assert.match(read("src/lib/liquid/boot.js"), /list\[active\]\.focus\(\{ preventScroll: true \}\)/);
  assert.match(read("src/components/far-from-saga/far-from-form-comparison.tsx"), /focus\(\{ preventScroll: true \}\)/);
});

test("the switch effect: the Rexonance card and entrance in FAR FROM's palette, and a swipe in step", () => {
  // The card: decorative, three blades, the record's call, the form in katakana.
  const card = render(React.createElement(stageSwitch.FarFromFormCall, { stage: "ultra" }));
  assert.match(card, /^<div class="ffs-form-call" data-stage="ultra" aria-hidden="true"/);
  assert.match(card, /<div class="ffs-call-ground"><i><\/i><i><\/i><i><\/i><\/div>/);
  assert.ok(card.includes(`>${FAR_FROM_SAGA.calls.at(-1)}</p>`), "the record's call");
  assert.match(card, /<small lang="en">FORM 05 \/ 05<\/small>/);
  assert.match(card, /<b>ウルトラ<\/b>/);
  assert.equal(card.match(/data-reached="true"/g)?.length, 5);
  assert.doesNotMatch(card, /\b(MIDDLE|XHIGH|HIGH|MAX|ULTRA)\b/);
  const high = render(React.createElement(stageSwitch.FarFromFormCall, { stage: "high" }));
  assert.match(high, /<b>ハイ<\/b>/);
  assert.equal(high.match(/data-reached="true"/g)?.length, 2);
  // On the Rexonance page's rest guard and duration.
  assert.match(page, /const plan = planStageCall\(\{/);
  assert.match(switchSource, /export const FAR_FROM_STAGE_CALL_MS = REXONANCE_STAGE_DURATION_MS;/);
  assert.match(page, /\{stageCall \? <FarFromFormCall key=\{stageCall\.id\} stage=\{stageCall\.stage\} \/> : null\}/);
  // The entrance's ornaments over the figure.
  const fx = render(React.createElement(stageSwitch.FarFromSwitchFx));
  assert.match(fx, /^<i class="ffs-switch-rings" aria-hidden="true"><i><\/i><i><\/i><i><\/i><i><\/i><\/i>/);
  assert.equal(fx.match(/--ffs-d:/g)?.length, 12);
  assert.match(fx, /<i class="ffs-stage-tune" aria-hidden="true"><b><\/b><\/i>$/);
  assert.match(page, /data-entrance=\{stageEntrance\?\.kind\}/);
  for (const name of ["ffs-blade-left", "ffs-blade-right", "ffs-blade-shutter", "ffs-floor-rise", "ffs-switch-ring", "ffs-switch-band", "ffs-switch-mesh", "ffs-measure"])
    assert.match(styles, new RegExp(`@keyframes ${name} \\{`), name);
  assert.match(styles, /#ffs-stage-panel\[data-entrance="card"\]\s*> figure \{\s*animation: ffs-floor-rise/);
  assert.match(styles, /#ffs-stage-panel\[data-entrance="quiet"\]\s*> figure,/);
  // In step with a swipe: the rail's own drag state drives the tuning band.
  assert.match(page, /attributeFilter: \["data-liquid-dragging", "data-liquid-contact", "style"\]/);
  assert.match(page, /panel\.style\.setProperty\("--ffs-tune-x"/);
  assert.match(page, /panel\.dataset\.tune = key;/);
  assert.match(styles, /\.ffs-stage-panel\[data-tune\] \.ffs-stage-tune \{\s*opacity: 1;/);
  assert.match(styles, /left: calc\(var\(--ffs-tune-x, 0\) \* 74%\);/);
});
