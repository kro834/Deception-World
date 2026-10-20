// Owner (2026-10-16): 「続けて、blenderなどを用いてナノマシン一つ一つの挙動や
// 装甲形成や金のガイドウェイなどを大きく改善して。」「超大幅な改善で。」 — the
// entry call's nanite swarm, armour staging and gold guideways on the
// Blender nanite kit (src/components/rexonance-saga/rexonance-suit-extras.ts,
// drawn by rexonance-suit-nanites.tsx, warmed by
// src/lib/rexonance-nanites-warmup.ts). These pin that it rides the call's
// pinned clocks, decides once per call, keeps the classic call as its
// fallback, allocates nothing in its draw passes, uses no timers,
// randomness, filters or composite operations, stays inside its draw
// budgets (desktop and touch), and that its timeline matches the brief.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as calls from "../src/lib/rexonance-calls.ts";
import * as suit from "../src/lib/rexonance-suit.ts";
import * as gold from "../src/lib/rexonance-suit-gold.ts";
import * as kit from "../src/lib/rexonance-nanites.ts";
import * as reactor from "../src/lib/rexonance-reactor.js";
import * as ignition from "../src/lib/rexonance-ignition.js";
import { createRexonanceCallRetention } from "../src/lib/rexonance-call-retention.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const extrasSource = read("src/components/rexonance-saga/rexonance-suit-extras.ts");
const planSource = read("src/components/rexonance-saga/rexonance-suit-plan.ts");
const nanites = read("src/components/rexonance-saga/rexonance-suit-nanites.tsx");
const component = read("src/components/rexonance-saga/rexonance-call-sequence.tsx");
const warmup = read("src/lib/rexonance-suit-warmup.ts");
const kitWarmup = read("src/lib/rexonance-nanites-warmup.ts");
const sheet = read("src/styles-rexonance-calls.css");
const flameAsset = "/rexonance-flame-natural-20261019/flame.webp";
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

test("the swarm rides the pinned call: its timeline, and the pinned clocks unchanged", () => {
  const swarm = calls.REXONANCE_SUIT_SWARM;
  // Historical metadata remains compatible with guideway schedules; the
  // actual emission now has one continuous surface-born flash (below).
  assert.deepEqual([...swarm.waves], [330, 380, 430, 480, 530, 580]);
  assert.equal(swarm.wave, 160);
  // Each plate's latch from F − 360; the lattice F − 270 → F − 60; clamps
  // slide in over [F − 120, F − 40] and bite F ± 10; the seat [F − 40, F]
  // with its ring-out inside it.
  assert.equal(swarm.project, 360);
  // Owner override (2026-10-16): the guideway is built from the toe tips up,
  // never projected or swept from above — no scan window remains; a group's
  // build starts ≤ 380 ms (ornaments 300) before a plate and is whole 115 ms
  // before it (ahead of its first tile, F − 100).
  assert.equal("scan" in swarm, false);
  assert.deepEqual(
    { ...swarm.build },
    { lead: 380, ornament: 300, done: 115, least: 70, head: 18, ahead: 32 },
  );
  assert.ok(swarm.build.done > calls.REXONANCE_SUIT_REVEAL_MS);
  assert.deepEqual([...swarm.lattice], [270, 60]);
  assert.deepEqual([...swarm.clamp], [120, 40, 10]);
  assert.equal(swarm.seat, calls.REXONANCE_SUIT_CLANK_MS);
  // Every plate is still by F (owner 2026-10-16: 「前がけの生成完了時にズレるのを
  // 修正して。」): no ring-out after the seat, the ribbons' sway before it.
  assert.equal("overshoot" in swarm, false);
  assert.equal(swarm.sway, 120);
  // After F: seam 90 + glow 60, shock 140, print [F − 30, F + 5] (bottom to
  // top along the trims, owner override 2026-10-16; whole before the first
  // gold locks at F + 6), paint
  // F + 6 → F + 70 (helmet F + 36), the conduit recedes 70 ms behind each
  // lock and its clamps release over [to + 70, to + 130].
  assert.equal(swarm.seam, 90);
  assert.equal(swarm.seamGlow, 60);
  assert.equal(swarm.shock, 140);
  assert.deepEqual([...swarm.print], [30, 5]);
  assert.ok(swarm.print[1] < calls.REXONANCE_SUIT_GOLD.delay);
  assert.deepEqual([...swarm.paint], [6, 64, 30]);
  assert.equal(swarm.recede, calls.REXONANCE_SUIT_GOLD.cool);
  assert.deepEqual([...swarm.release], [70, 130]);
  assert.deepEqual([...swarm.crown], [1600, 1700]);
  assert.deepEqual([...swarm.implode], [1980, 2160]);
  // The molten band by age (review 2026-10-16: white-hot at its head, amber
  // behind, its tail fading into the painted gold): the last step is the band.
  assert.deepEqual([...swarm.moltenAges], [6, 14, 22, 30]);
  assert.equal(swarm.moltenAges.at(-1), swarm.molten);
  // The legs project during RIDER！, before any leg armour seats.
  const legs = calls.REXONANCE_SUIT_CASCADE.find(({ group }) => group === "legs");
  assert.ok(
    calls.REXONANCE_SUIT_FIT[legs.order[0]] - swarm.project >= calls.REXONANCE_CALL_BEATS[1].start,
  );
  // Every clamp has released, and the free chips have imploded, before the
  // face's squares scatter; the crest's clamps are the last.
  const release = Math.max(
    ...Object.entries(calls.REXONANCE_SUIT_GOLD_AT)
      .filter(([id]) => !calls.REXONANCE_SUIT_DRIVER.includes(id))
      .map(([, [, to]]) => to + swarm.release[1]),
  );
  assert.ok(release <= calls.REXONANCE_SUIT_PIXELS.scatter, String(release));
  assert.ok(swarm.implode[1] < calls.REXONANCE_SUIT_PIXELS.scatter);
  // Authored armour clocks remain canonical; the real entry adds 1 s of flame.
  assert.equal(calls.REXONANCE_ENTRY_TIMINGS.cover, 3730);
  assert.equal(calls.REXONANCE_SUIT_REVEAL_MS, 100);
  assert.equal(calls.REXONANCE_SUIT_CLANK_MS, 40);
  assert.equal(calls.REXONANCE_SUIT_PIXELS.fill, 1990);
  assert.equal(calls.REXONANCE_SUIT_PIXELS.scatter, 2520);
  assert.deepEqual(calls.REXONANCE_SUIT_LIGHT, { from: 1980, spread: 380, bloom: 560 });
  // The shock rings' plates are the clank's sparks (accents and first bites).
  assert.equal(calls.REXONANCE_SUIT_SPARKS.length, 14);
  for (const id of calls.REXONANCE_SUIT_ACCENTS)
    assert.ok(calls.REXONANCE_SUIT_SPARKS.includes(id));
  assert.match(component, /const SUIT_SPARKS = REXONANCE_SUIT_SPARKS;/);
});

test("the call decides once, gives the firestorm room on every pointer, and keeps the classic call", () => {
  // Decided at the engine's start; the classic tile path stays the fallback.
  assert.match(nanites, /const rich = isRexonanceNaniteReady\(\);/);
  assert.match(nanites, /box\.dataset\.bleed = "";/);
  assert.doesNotMatch(nanites, /if \(rich && !coarse\) box\.dataset\.bleed/);
  // Round 3 (review 30): `let`, so a pass that throws drops the extras mid-call.
  assert.match(nanites, /let extras = rich\s*\?\s*createSuitExtras\(/);
  // Round 3 (review 33): reached through their hook, never imported by the call.
  assert.doesNotMatch(nanites, /^import \{[^}]*\} from "\.\/rexonance-suit-extras";/m);
  assert.match(nanites, /suitExtrasApi\(\)\?\.create\(env\)/);
  assert.match(nanites, /ready\.current\(Boolean\(extras\)\);/);
  assert.match(
    nanites,
    /if \(t < plate\.fit && extras\) \{\s*\/\/[^\n]*\n[^\n]*\n\s*extras\.forming\(p, t\);\s*continue;\s*\}/,
  );
  assert.match(nanites, /flight\.drawImage\(\s*source,\s*tile\.sx,\s*tile\.sy,/);
  // Every draw sits under the figure's offset on the bled canvas.
  assert.match(
    nanites,
    /flight\.setTransform\(1, 0, 0, 1, 0, 0\);\s*flight\.clearRect\(0, 0, width, height\);\s*flight\.setTransform\(1, 0, 0, 1, ox, oy\);/,
  );
  // The figure's scale comes from its own backing; the flight canvas bleeds
  // (CSS), its figure origin on whole device pixels.
  assert.match(nanites, /settledCanvas\.width = Math\.round\(box\.clientWidth \* scale\);/);
  // Flight edges whole CSS px off the figure's (review 2026-10-16: plates hopped ~1 px at `to`).
  assert.match(
    nanites,
    /const width = settledCanvas\.width \+ ox \+ Math\.round\(right \* scale\);/,
  );
  assert.match(
    nanites,
    /const height = settledCanvas\.height \+ oy \+ Math\.round\(bottom \* scale\);/,
  );
  // Round 4 (patch A): the settled canvas takes the flight canvas's bled box and backing.
  assert.match(nanites, /settledCanvas\.width = width;\s*settledCanvas\.height = height;/);
  assert.match(
    nanites,
    /for \(const canvas of \[settledCanvas, flightCanvas\]\)\s*Object\.assign\(canvas\.style, \{/,
  );
  assert.match(
    nanites,
    /left: `\$\{-left\}px`,\s*top: `\$\{-top\}px`,\s*width: `calc\(100% \+ \$\{left \+ right\}px\)`,\s*height: `calc\(100% \+ \$\{top \+ bottom\}px\)`,/,
  );
  assert.match(nanites, /const s = settledCanvas\.width \/ FIG\.width;/);
  assert.match(nanites, /const ox = Math\.round\(/);
  // Round 4 (patch A): the settled canvas draws under the same whole-pixel offset (was: no transform).
  assert.match(nanites, /settled\.setTransform\(1, 0, 0, 1, ox, oy\);/);
  // Its swarm replaces the SVG motes only when it runs; the motes' own
  // clock is unchanged; both canvases reserve the same broad transparent
  // padding for the firestorm without changing the figure's registration.
  assert.match(
    component,
    /const onNanites = useCallback\(\(rich\?: boolean\) => \{\s*setNanites\("canvas"\);\s*setSwarm\(rich \? "canvas" : "svg"\);/,
  );
  // …and the motes return once the swarm is over (frame 2730 is HEAD's).
  // (review 2026-10-16: a classic call no longer kicks the kit on the page
  // it lands on; the next route's warm does.)
  assert.match(nanites, /if \(extras\) ready\.current\(false\);/);
  assert.doesNotMatch(nanites, /warmRexonanceNanites/);
  assert.match(component, /data-swarm=\{swarm\}/);
  assert.match(
    sheet,
    /\.rx-call-sequence \.rx-suit-build > \.rx-suit-nanites\[data-bleed\] > canvas:last-child \{\s*inset: auto;\s*top: -18%;\s*left: -25%;\s*width: 150%;\s*height: 134%;\s*\}/,
  );
  assert.doesNotMatch(sheet, /\.rx-suit-nanites\[data-bleed\] \{/);
  assert.match(
    sheet,
    /\.rx-call-sequence \.rx-suit\[data-swarm="canvas"\] \.rx-suit-figure > \.rx-suit-motes \{\s*visibility: hidden;\s*\}/,
  );
});

test("the extras use no timers, randomness, filters or composites, and allocate nothing in draw", () => {
  assert.doesNotMatch(
    extrasSource,
    /setInterval|setTimeout|Math\.random|filter =|globalCompositeOperation/,
  );
  assert.doesNotMatch(nanites, /globalCompositeOperation|Math\.random/);
  // The draw passes: everything from the frame's transforms to the returned
  // API, after the per-call buffers are made.
  const from = extrasSource.indexOf("const base = () => {");
  const to = extrasSource.indexOf("  return {\n    before,", from);
  assert.ok(from > 0 && to > from);
  const draw = extrasSource.slice(from, to);
  assert.ok(draw.length > 20_000, String(draw.length));
  const executable = ts.transpileModule(draw, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      removeComments: true,
    },
  }).outputText;
  assert.doesNotMatch(
    executable,
    /\bnew |\.map\(|\.filter\(|\.slice\(|\.concat\(|\[\]|Array\.from|\.push\(|`/,
  );
  // The plan stays free of the kit (its runtime test pins its modules).
  assert.doesNotMatch(planSource, /rexonance-nanites|rexonance-suit-extras/);
});

// Review (2026-10-16): no per-frame allocation in the draw passes. A double
// written to a `let` that a closure or the module holds is boxed into a fresh
// heap number on every write, so the poses, the sprites' arguments and the
// glows' ramp live in one Float64Array per call; the closures keep only
// integer counters and flags. Sprites land on whole device pixels and clip
// rects on whole pixels (a fractional canvas argument is boxed on every
// call), Math.hypot (which boxes its arguments) is not used, and the poses
// are primed before any call so V8 has feedback for every branch.
// scripts/verify-rexonance-call-alloc.mjs measures it in Chrome.
test("the draw passes keep per-frame values in typed slots, not boxed lets", () => {
  const scratch = extrasSource.slice(
    extrasSource.indexOf("export function createSuitExtras("),
    extrasSource.indexOf("  const base = () => {"),
  );
  assert.match(scratch, /const pose = new Float64Array\(POSE_SLOTS\);/);
  const closureLets = [...scratch.matchAll(/^ {2}let (\w+)/gm)].map(([, name]) => name).sort();
  assert.deepEqual(closureLets, [
    "comets",
    "conduits",
    "dockCount",
    "draws",
    "fadeCount",
    "frames",
    "fusionCount", // bounded integer count into a preallocated fusion batch
    "governed",
    "heroes",
    "laserCount",
    "linkCount",
    "pulsePostCount",
    "pulsePreCount",
    "segCount",
    "slow",
    "sparkCount",
    "tipCount",
    "transformed",
  ]);
  const moduleLets = [...extrasSource.matchAll(/^let (\w+)/gm)].map(([, name]) => name).sort();
  assert.deepEqual(moduleLets, [
    "LAYOUT",
    "READY",
    "SHEETS",
    "calls",
    "preparation",
    "primed",
    "promotePreparation",
    "resumePreparation",
    "retention", // route lifetime only; no per-frame mutation/allocation
  ]);
  const from = extrasSource.indexOf("  const base = () => {");
  const to = extrasSource.indexOf("  return {\n    before,", from);
  const draw = extrasSource.slice(from, to);
  // No let inside the passes is written from another closure.
  assert.doesNotMatch(draw, /^ {2}let /m);
  assert.doesNotMatch(draw, /Math\.hypot\(/);
  assert.doesNotMatch(extrasSource, /nothing is allocated\)/);
  // Sprites on whole device pixels.
  assert.match(
    draw,
    /const k = Math\.round\(d\) \|\| 1;\s*flight\.drawImage\(image, sx, sy, sw, sh, Math\.round\(x - k \/ 2\), Math\.round\(y - k \/ 2\), k, k\);/,
  );
  // The poses read their inputs from the slots.
  assert.match(draw, /const tilePose = \(p: number, i: number, helm: boolean\) => \{/);
  assert.match(draw, /const chip = \(frame: number, tone: number, hero = false\) => \{/);
  assert.match(draw, /const surfacePose = \(c: number\) => \{\s*const t = pose\[ARG_T\];/);
  assert.match(draw, /const bornPose = \(c: number\) => \{\s*const born = pose\[ARG_U\];/);
  assert.doesNotMatch(draw, /const ringPose\s*=/);
  // Primed once prepared, on a throwaway instance, never while a call draws.
  assert.match(extrasSource, /READY = true;\s*settle\(true\);\s*primeNanites\(\);/);
  assert.match(extrasSource, /if \(work\.drawing > 0\) return queue\(\);/);
});

// Review (2026-10-16, cold tap): the kit's preparation never runs on
// /rexonance-saga, where a cold tap's classic call lands and ZENITH draws
// its first frames; a call that started without the extras drops it back to
// idle slices, and the next route's warm resumes it.
test("the kit's preparation parks on /rexonance-saga and resumes on the next route", () => {
  assert.match(
    extrasSource,
    /if \(work\.drawing > 0\) \{\s*urgent = false;\s*schedule\(\);\s*return;\s*\}\s*if \(onSaga\(\)\) \{\s*urgent = false;\s*parked = true;\s*return;\s*\}/,
  );
  assert.match(extrasSource, /if \(preparation\) \{\s*resumePreparation\?\.\(\);/);
  assert.match(warmup, /if \(ready\) \{[^]*?naniteWarm\?\.warm\("low"\);[^]*?\}/);
  assert.doesNotMatch(kitWarmup, /preparing/);
});

test("the kit warms with ImageBitmaps only, after the plan, under the suit's skips", () => {
  // fetch + createImageBitmap; never an <img>, never on Save-Data, 2G,
  // reduced motion, economy or a hidden page.
  assert.doesNotMatch(kitWarmup, /new Image\(/);
  assert.match(kitWarmup, /createImageBitmap\(blob\)/);
  assert.match(kitWarmup, /REXONANCE_NANITE_ASSETS\.map\(/);
  for (const skip of [
    /connection\?\.saveData/,
    /\["slow-2g", "2g"\]/,
    /prefers-reduced-motion: reduce/,
    /worldEffects === "economy"/,
    /document\.hidden/,
    /typeof createImageBitmap !== "function"/,
  ])
    assert.match(kitWarmup, skip);
  // The suit's warm-up only imports the kit's chunk once its plan is
  // prepared (no static import: its own fetches and stage pins are its own).
  assert.doesNotMatch(warmup, /^import[^;]*rexonance-nanites/m);
  const clean = ts.transpileModule(warmup, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, removeComments: true },
  }).outputText;
  const planStage = clean.slice(
    clean.indexOf("function warmPlanWhenIdle()"),
    clean.indexOf("function resumeKit()"),
  );
  const kitStage = clean.slice(
    clean.indexOf("function resumeKit()"),
    clean.indexOf("function picture("),
  );
  assert.match(planStage, /return plan\.prepareRexonanceSuit\(\);/);
  assert.match(
    planStage,
    /\.then\(\(prepared\) => \{\s*if \(prepared !== true \|\| saving\(\) \|\| still\(\)\)\s*return;\s*kitWaiting = true;\s*resumeKit\(\);/,
  );
  assert.doesNotMatch(planStage, /import\("\.\/rexonance-nanites-warmup\.ts"\)/);
  assert.match(
    kitStage,
    /if \(!kitWaiting \|\| !ready \|\| document\.hidden \|\| backgroundPauses \|\| saving\(\) \|\| still\(\)\)\s*return;/,
  );
  assert.match(
    kitStage,
    /kitWaiting = false;\s*void import\("\.\/rexonance-nanites-warmup\.ts"\)\.then\(\(kit\) => kit\.warmRexonanceNanites\(\)/,
  );
  assert.deepEqual(
    [...kit.REXONANCE_NANITE_ASSETS],
    [
      kit.REXONANCE_NANITE_CELLS.src,
      kit.REXONANCE_NANITE_COMETS.src,
      kit.REXONANCE_NANITE_FX.src,
      kit.REXONANCE_NANITE_GUIDE.src,
    ],
  );
});

// A 2D context that records what is drawn (draws per frame, by source).
function recorder() {
  const log = { draws: 0, paints: 0, sources: new Map(), transforms: 0, last: null, saves: 0 };
  const context = {
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    setTransform(...args) {
      log.transforms += 1;
      log.last = args;
    },
    save() {
      log.saves += 1;
    },
    restore() {
      log.saves -= 1;
    },
    drawImage(image, ...args) {
      assert.ok(args.length === 8 || args.length === 4 || args.length === 2, "drawImage arity");
      for (const value of args) assert.ok(Number.isFinite(value), "finite draw geometry");
      log.draws += 1;
      log.sources.set(image.kind, (log.sources.get(image.kind) ?? 0) + 1);
    },
  };
  for (const name of [
    "beginPath",
    "rect",
    "clip",
    "fill",
    "stroke",
    "moveTo",
    "lineTo",
    "quadraticCurveTo",
    "arc",
    "ellipse",
    "closePath",
    "fillRect",
    "clearRect",
    "putImageData",
  ])
    context[name] = (...args) => {
      if (["fill", "fillRect", "stroke"].includes(name) && context.globalAlpha > 0) log.paints++;
      for (const value of args)
        if (typeof value === "number") assert.ok(Number.isFinite(value), name);
    };
  return { context, log };
}

// The real plan and extras, in a sandbox with recording canvases.
async function extrasRuntime({ touch }) {
  const queued = [];
  let now = 0;
  const canvas = (kind, width = 0, height = 0) => ({
    kind,
    width,
    height,
    getContext() {
      return {
        drawImage() {},
        clearRect() {},
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        rect() {},
        fill() {},
      };
    },
  });

  const sources = new Map(
    Object.values({
      cells: kit.REXONANCE_NANITE_CELLS,
      comets: kit.REXONANCE_NANITE_COMETS,
      fx: kit.REXONANCE_NANITE_FX,
      guide: kit.REXONANCE_NANITE_GUIDE,
    }).map((sheet) => [sheet.src, { kind: sheet.src, width: sheet.width, height: sheet.height }]),
  );
  const suitSources = new Map([
    [suit.REXONANCE_SUIT_ATLAS.src, { kind: "atlas" }],
    [suit.REXONANCE_SUIT_GOLD_ATLAS.src, { kind: "gold" }],
  ]);
  const globals = {
    atob,
    performance: { now: () => (now += 0.01) },
    matchMedia: () => ({ matches: touch }),
    document: { createElement: () => canvas("scratch") },
    requestAnimationFrame: (callback) => {
      queued.push(() => callback(now));
      return queued.length;
    },
    cancelAnimationFrame() {},
  };
  const plan = {};
  runInNewContext(transpile(planSource), {
    ...globals,
    exports: plan,
    require(name) {
      if (name === "@/lib/rexonance-calls") return calls;
      if (name === "@/lib/rexonance-suit") return suit;
      if (name === "@/lib/rexonance-suit-gold") return gold;
      if (name === "@/lib/rexonance-unlit.js")
        return { splitLights: () => null, createSplitLightsJob: () => null };
      if (name === "@/lib/rexonance-suit-warmup")
        return { rexonanceSuitSource: (url) => suitSources.get(url) ?? null };
      throw new Error(`unexpected module ${name}`);
    },
  });
  const extras = {};
  // Test-only probes exercise the real closed-form pose without adding a
  // debugging API, copy or allocation to the production drawing engine.
  const instrumented = extrasSource
    .replace(
      "  const receiversPass = (t: number) => {",
      "  const receiverVisits = [];\n  const receiversPass = (t: number) => {",
    )
    .replace(
      "      // Receiver reservation owns this plate's entire visible interval.",
      "      receiverVisits.push(p);\n      // Receiver reservation owns this plate's entire visible interval.",
    )
    .replace(
      "  return {\n    before,",
      `  return {
      poseAt(p, i, u) {
        flat(p);
        pose[ARG_U] = u;
        pose[ARG_CX] = L.cx[i];
        pose[ARG_CY] = L.cy[i];
        pose[ARG_LX] = L.cx[L.tLead[i]];
        pose[ARG_LY] = L.cy[L.tLead[i]];
        tilePose(p, i, L.kind[p] === 3);
        return Array.from(pose);
      },
      firePoseAt(c, t, born = true) {
        pose[ARG_T] = t;
        surfacePose(c);
        if (born) {
          pose[ARG_U] = (t - L.birth[c]) / L.sprayMs[c];
          bornPose(c);
        }
        return Array.from(pose.subarray(0, 3));
      },
      firebrandAt(c, t) {
        const u = unit((t-L.brandStart[c])/(Math.min(NANITE_FIRE_PHASES.burstEnd*2400,L.birth[c])-L.brandStart[c]));
        const travel = L.brandTravel[c]*u*u;
        const curl = 5*Math.sin(Math.PI*u)*L.brandSin[c];
        return [L.emitX[c]+L.emitNX[c]*travel-L.emitNY[c]*curl,
          L.emitY[c]+L.emitNY[c]*travel+L.emitNX[c]*curl-L.brandLift[c]*u];
      },
      fireHash: hash,
      docking() { return Array.from(docks.subarray(0, dockCount * 8)); },
      platePose(p, t) {
        const lambda = lambdaAt(p, t);
        setJig(p, lambda, hingeAt(p, t, lambda), swayAt(p, t));
        return Array.from(jig.subarray(p * 6, p * 6 + 6));
      },
      receiversAt(t) { receiversPass(t); },
      receiverVisitsAt(t) {
        receiverVisits.length = 0;
        receiversPass(t);
        return Array.from(receiverVisits);
      },
      staged() { return Array.from(jigged); },
      chipShape(x, y, d, socket) { hexRects(x, y, d, socket); },
      before,`,
    );
  runInNewContext(transpile(instrumented), {
    ...globals,
    exports: extras,
    require(name) {
      if (name === "@/lib/rexonance-calls") return calls;
      if (name === "@/lib/rexonance-suit") return suit;
      if (name === "@/lib/rexonance-nanites") return kit;
      if (name === "@/lib/rexonance-reactor.js") return reactor;
      if (name === "@/lib/rexonance-ignition.js") return ignition;
      if (name === "@/lib/rexonance-flame.js")
        return {
          drawNaniteFirebrand(context, x, y, power, clock, scale) {
            // Worst-case real helper contract: two interpolated atlas draws.
            // The helper's own unit verifies actual resource/state semantics;
            // never make this a no-op that hides the caller's sprite cost.
            for (let i = 0; i < 2; i++)
              context.drawImage(
                { kind: flameAsset },
                x - 20 * scale,
                y - 50 * scale,
                40 * scale,
                70 * scale,
              );
          },
        };
      if (name === "@/lib/rexonance-call-retention") return { createRexonanceCallRetention };
      // Round 3 (reviews 8/27/9): the call phases its own read-backs and
      // shares the kit's row formulas (their bytes: rexonance-nanites-unlit).
      if (name === "@/lib/rexonance-unlit.js")
        return { naniteMetalRow() {}, naniteGuideRow() {}, naniteMoltenRow() {} };

      if (name === "@/lib/rexonance-nanites-warmup")
        return { rexonanceNaniteSource: (url) => sources.get(url) ?? null };
      if (name === "@/lib/rexonance-suit-warmup")
        return { rexonanceSuitSource: (url) => suitSources.get(url) ?? null };
      if (name === "./rexonance-suit-plan")
        return { ...plan, prepareRexonanceSuit: () => Promise.resolve(true) };
      // Round 3: the extras register with the call's hook once loaded.
      if (name === "./rexonance-suit-extras-hook") return { registerSuitExtras() {} };

      throw new Error(`unexpected module ${name}`);
    },
  });
  const preparing = extras.prepareRexonanceNanites("high");
  for (let i = 0; i < 400 && queued.length; i += 1) {
    queued.shift()();
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.equal(await preparing, true, "the extras prepare");
  assert.equal(extras.isRexonanceNaniteReady(), true);
  return { plan, extras };
}

async function playCall(touch) {
  const { plan, extras } = await extrasRuntime({ touch });
  const all = plan.plates();
  const { context, log } = recorder();
  const s = 1.5;
  const ex = extras.createSuitExtras({
    flight: context,
    s,
    ox: 34,
    oy: 31,
    all,
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  assert.ok(ex, "the call's extras are created");
  const frames = [];
  const kitSources = new Set(kit.REXONANCE_NANITE_ASSETS);
  kitSources.add(flameAsset);
  for (let t = 0; t <= 2600; t += 5) {
    log.draws = 0;
    log.sources.clear();
    ex.before(t);
    for (let p = 0; p < all.length; p += 1) {
      const plate = all[p];
      if (t < plate.spawn || t >= plate.last) continue;
      if (t < plate.fit) {
        ex.forming(p, t);
        continue;
      }
      if (t < plate.to) {
        ex.seat(p, t);
        ex.unseat();
      }
      ex.conduit(p, t);
    }
    ex.after(t);
    ex.firebrands(t);
    assert.equal(log.saves, 0, `${t}: every save is restored`);
    assert.deepEqual(log.last, [1, 0, 0, 1, 34, 31], `${t}: the frame ends on the base transform`);
    // Hero sprites: chips, latches, rings, sparks and real firebrand atlas;
    // the conduit (the guide sheet) is counted on its own.
    let kitDraws = 0;
    for (const [kind, count] of log.sources)
      if (kitSources.has(kind) && kind !== kit.REXONANCE_NANITE_GUIDE.src) kitDraws += count;
    const guide = log.sources.get(kit.REXONANCE_NANITE_GUIDE.src) ?? 0;
    frames.push({ t, draws: log.draws, kit: kitDraws, guide, counted: ex.drawn() });
  }
  return frames;
}

test("desktop: the swarm stays within 2,600 draws a frame and fills the call", async () => {
  const frames = await playCall(false);
  const most = Math.max(...frames.map(({ draws }) => draws));
  assert.ok(most <= 2600, `at most ${most} draws a frame`);
  // It is a swarm, not a sprinkle: well over a thousand sprites at its peak,
  // and drawing through every stage of the call.
  assert.ok(most > 1000, `peak ${most}`);
  for (const t of [620, 800, 1000, 1300, 1700, 2000])
    assert.ok(frames.find((frame) => frame.t === t).kit > 20, `${t}: kit sprites drawn`);
  // Nothing of the swarm remains once the seal has passed.
  assert.equal(frames.find((frame) => frame.t === 2600).draws, 0);
});

test("touch: at most 24 hero sprites a frame from the kit; the swarm is rects", async () => {
  const frames = await playCall(true);
  const heroes = Math.max(...frames.map(({ kit }) => kit));
  assert.ok(heroes <= 24, `at most ${heroes} kit sprites a frame`);
  assert.ok(heroes > 0);
  // At most four conduits a frame, their face only (no walls).
  assert.ok(Math.max(...frames.map(({ guide }) => guide)) <= 4);
});

test("touch carriers have a six-sided shell with a recessed socket and tiny chips stay cheap", async () => {
  const { plan, extras } = await extrasRuntime({ touch: true });
  const { context } = recorder();
  const loops = [];
  let rectangles = 0;
  context.moveTo = (x, y) => loops.push([[x, y]]);
  context.lineTo = (x, y) => loops.at(-1).push([x, y]);
  context.rect = () => {
    rectangles += 1;
  };
  const ex = extras.createSuitExtras({
    flight: context,
    s: 1,
    ox: 0,
    oy: 0,
    all: plan.plates(),
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  ex.chipShape(10, 20, 10, true);
  assert.deepEqual(
    loops.map((loop) => loop.length),
    [6, 6],
    "shell and socket each have six facets",
  );
  const area = (loop) =>
    loop.reduce((sum, [x, y], i) => {
      const next = loop[(i + 1) % loop.length];
      return sum + x * next[1] - next[0] * y;
    }, 0);
  assert.ok(area(loops[0]) * area(loops[1]) < 0, "reverse winding exposes the dark recess");
  assert.ok(Math.abs(area(loops[1])) < Math.abs(area(loops[0])), "socket stays inside the shell");
  loops.length = 0;
  ex.chipShape(10, 20, 3, true);
  assert.equal(rectangles, 1, "subpixel facets use one cheap rect");
  assert.equal(loops.length, 0);
});

// Owner (2026-10-16): 「前がけの生成完了時にズレるのを修正して。」 — the tassets
// and the tall narrow plates form in place (never lifted or tilted), and no
// plate moves once it has seated: from its fit on, its seat and conduit draw
// under the figure's own transform, so its gold forms where the suit has it.
test("the tassets form in place, and every plate is at rest from its fit on", async () => {
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const L = extras.rexonanceNaniteLayout();
  all.forEach((plate, p) => {
    const { id, w, h } = plate.piece;
    if (id.startsWith("tasset-") || (L.kind[p] === 0 && h >= 1.8 * w)) {
      assert.ok(L.flags[p] & 8, `${id}: formed in place`);
      assert.equal(L.lift[p], 0, id);
      assert.equal(L.tilt[p], 0, id);
    }
  });
  assert.ok(all.filter(({ piece }) => piece.id.startsWith("tasset-")).length === 3);
  const { context } = recorder();
  const transforms = [];
  context.setTransform = (...args) => transforms.push(args);
  const ex = extras.createSuitExtras({
    flight: context,
    s: 1.5,
    ox: 34,
    oy: 31,
    all,
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  for (let t = 600; t <= 2000; t += 5) {
    ex.before(t);
    for (let p = 0; p < all.length; p += 1) {
      const plate = all[p];
      if (t < plate.spawn || t >= plate.last) continue;
      if (t < plate.fit) {
        ex.forming(p, t);
        continue;
      }
      transforms.length = 0;
      if (t < plate.to) {
        ex.seat(p, t);
        ex.unseat();
      }
      ex.conduit(p, t);
      for (const args of transforms)
        assert.deepEqual(args, [1, 0, 0, 1, 34, 31], `${plate.piece.id} at ${t}: at rest`);
    }
    ex.after(t);
    ex.firebrands(t);
  }
});

test("armour aligns on anatomical rails, compresses, and keeps exact final registration", async () => {
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const L = extras.rexonanceNaniteLayout();
  const { context } = recorder();
  const ex = extras.createSuitExtras({
    flight: context,
    s: 1,
    ox: 0,
    oy: 0,
    all,
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  for (const id of [
    "shoulder-upper-l",
    "shoulder-upper-r",
    "chest-pec-l",
    "chest-pec-r",
    "arm-fist-l",
  ]) {
    const p = all.findIndex(({ piece }) => piece.id === id);
    assert.ok(p >= 0 && !(L.flags[p] & 8), `${id}: a staged armour plate`);
    const { fit, piece } = all[p];
    const poseAt = (before) => Array.from(ex.platePose(p, fit - before));
    const displacement = (pose) =>
      Math.hypot(
        pose[0] * piece.seat[0] + pose[2] * piece.seat[1] + pose[4] - piece.seat[0],
        pose[1] * piece.seat[0] + pose[3] * piece.seat[1] + pose[5] - piece.seat[1],
      );
    const approach = poseAt(150);
    const aligned = poseAt(86);
    const inserting = poseAt(42);
    const compressing = poseAt(11);
    assert.ok(displacement(approach) > 15, `${id}: readable physical carriage travel`);
    assert.ok(displacement(approach) > displacement(aligned), `${id}: approach`);
    assert.ok(displacement(aligned) > displacement(inserting), `${id}: insertion`);
    assert.ok(displacement(inserting) > displacement(compressing), `${id}: compression`);
    const side = id.endsWith("-l") ? -1 : 1;
    assert.equal(Math.sign(L.offX[p]), side, `${id}: comes from its own side of the body`);
    assert.deepEqual(poseAt(0), [1, 0, 0, 1, 0, 0], `${id}: exact final pose`);
    assert.deepEqual(
      Array.from(ex.platePose(p, fit + 30)),
      [1, 0, 0, 1, 0, 0],
      `${id}: no residual spring`,
    );
    ex.platePose(p, fit - 5);
    assert.deepEqual(poseAt(150), approach, `${id}: independent of frame history`);
  }
  for (let p = 0; p < all.length; p += 1) {
    if (!(L.flags[p] & 8)) continue;
    assert.deepEqual(
      Array.from(ex.platePose(p, all[p].fit - 80)),
      [1, 0, 0, 1, 0, 0],
      `${all[p].piece.id}: fixed fitting`,
    );
  }
});

test("the real artwork coil grows with the reactor and rotates around its fixed centre", async () => {
  for (const touch of [false, true]) {
    const { plan, extras } = await extrasRuntime({ touch });
    const all = plan.plates();
    const L = extras.rexonanceNaniteLayout();
    const p = all.findIndex(({ piece }) => piece.id === "core-swirl");
    const disc = all.findIndex(({ piece }) => piece.id === "core-disc");
    assert.equal(all[p].fit, all[disc].fit, "coil and disc share their formation endpoint");
    assert.equal(all[p].from, all[disc].from, "their gold also starts together");
    assert.ok(L.jigSlot[p] < (touch ? 4 : 12), "the actual coil always owns a rotation slot");
    assert.equal(L.receiverN[p], 0, "no fixed receiver fingers cover the rotating coil");
    const { context } = recorder();
    let transform = null;
    const drawn = [];
    const originalSetTransform = context.setTransform;
    const originalDrawImage = context.drawImage;
    context.setTransform = (...args) => {
      transform = args;
      originalSetTransform(...args);
    };
    context.drawImage = (image, ...args) => {
      drawn.push({ args, transform });
      originalDrawImage(image, ...args);
    };
    const ex = extras.createSuitExtras({
      flight: context,
      s: 1,
      ox: 0,
      oy: 0,
      all,
      gold: plan.cells(),
      source: { kind: "work" },
      sheet: { kind: "motes" },
    });
    const [cx, cy] = suit.REXONANCE_SUIT_MARKS.core;
    for (const u of [0.2, 0.5, 0.8, 1]) {
      const t = all[p].fit - calls.REXONANCE_SUIT_REVEAL_MS * (1 - u);
      const matrix = Array.from(ex.platePose(p, t));
      const scale = reactor.reactorCoilScale(u);
      const angle = reactor.reactorCoilAngle(u);
      assert.ok(Math.abs(matrix[0] - Math.cos(angle) * scale) < 1e-6);
      assert.ok(Math.abs(matrix[1] - Math.sin(angle) * scale) < 1e-6);
      assert.ok(Math.abs(matrix[0] * cx + matrix[2] * cy + matrix[4] - cx) < 1e-4);
      assert.ok(Math.abs(matrix[1] * cx + matrix[3] * cy + matrix[5] - cy) < 1e-4);
      assert.deepEqual(
        Array.from(ex.platePose(disc, t)),
        [1, 0, 0, 1, 0, 0],
        "reactor disc itself never orbits",
      );
      ex.before(t);
      if (u < 1) assert.equal(ex.staged()[p], 1, "touch and desktop actually stage the coil");
    }
    assert.deepEqual(
      Array.from(ex.platePose(p, all[p].fit)),
      [1, 0, 0, 1, 0, 0],
      "original final registration",
    );
    const middle = all[p].fit - calls.REXONANCE_SUIT_REVEAL_MS / 2;
    ex.before(middle);
    drawn.length = 0;
    ex.forming(p, middle);
    const piece = all[p].piece;
    const artwork = drawn.find(
      ({ args }) =>
        args[0] === piece.ax && args[1] === piece.ay && args[2] === piece.w && args[3] === piece.h,
    );
    assert.ok(artwork, "draws the isolated core-swirl atlas artwork, not a generated ring");
    assert.ok(Math.abs(artwork.transform[1]) > 0.1, "the artwork draw carries its rotation");
  }
});

test("carriage reservations stay fixed through each plate's complete formation", async () => {
  for (const touch of [false, true]) {
    const { plan, extras } = await extrasRuntime({ touch });
    const all = plan.plates();
    const L = extras.rexonanceNaniteLayout();
    const { context } = recorder();
    const ex = extras.createSuitExtras({
      flight: context,
      s: 1,
      ox: 0,
      oy: 0,
      all,
      gold: plan.cells(),
      source: { kind: "work" },
      sheet: { kind: "motes" },
    });
    const firstState = new Int8Array(all.length).fill(-1);
    for (let t = 300; t < 2000; t += 2) {
      ex.before(t);
      const staged = ex.staged();
      assert.ok(staged.reduce((sum, value) => sum + value, 0) <= (touch ? 4 : 12), "carriage cap");
      for (let p = 0; p < all.length; p += 1) {
        if (t < Math.max(600, all[p].spawn) || t >= all[p].fit) continue;
        if (firstState[p] < 0) firstState[p] = staged[p];
        assert.equal(staged[p], firstState[p], `${all[p].piece.id} at ${t}: no late promotion`);
      }
    }
    for (let p = 0; p < all.length; p += 1) {
      if (L.jigSlot[p] === 255) continue;
      for (let q = p + 1; q < all.length; q += 1) {
        if (L.jigSlot[q] !== L.jigSlot[p]) continue;
        assert.ok(
          all[p].fit <= all[q].spawn || all[q].fit <= all[p].spawn,
          "one carriage per simultaneous plate",
        );
      }
    }
  }
});

test("receiver reservations never promote a hidden frame halfway through fitting", async () => {
  for (const touch of [false, true]) {
    const { plan, extras } = await extrasRuntime({ touch });
    const all = plan.plates();
    const L = extras.rexonanceNaniteLayout();
    const { context } = recorder();
    const ex = extras.createSuitExtras({
      flight: context,
      s: 1,
      ox: 0,
      oy: 0,
      all,
      gold: plan.cells(),
      source: { kind: "work" },
      sheet: { kind: "motes" },
    });
    const firstState = new Int8Array(all.length).fill(-1);
    let visible = 0;
    let skipped = 0;
    for (let t = 300; t < 2200; t += 2) {
      ex.before(t);
      const rendered = new Set(ex.receiverVisitsAt(t));
      assert.ok(rendered.size <= (touch ? 2 : 7), "receiver plate budget");
      for (let p = 0; p < all.length; p += 1) {
        if (!L.receiverN[p] || t < all[p].fit - 150 || t >= all[p].fit + 64) continue;
        const shown = Number(rendered.has(p));
        if (firstState[p] < 0) {
          firstState[p] = shown;
          if (shown) visible += 1;
          else skipped += 1;
        }
        assert.equal(
          shown,
          firstState[p],
          `${all[p].piece.id} at ${t}: complete receiver interval`,
        );
      }
    }
    assert.ok(visible > 0, "reserved receivers draw across the call");
    assert.ok(skipped > 0, "overlapping plate reservations exercise the cap");
    if (touch) {
      for (const group of ["arms", "shoulders"])
        assert.ok(
          all.some(
            (plate, p) =>
              plate.piece.group === group &&
              L.jigSlot[p] < 4 &&
              L.receiverSlot[p] < 2 &&
              firstState[p] === 1,
          ),
          `${group}: a moving touch plate retains its complete receiver hardware`,
        );
    }
  }
});

test("receiver frames follow armour contours and opposed shutters fasten in stages", async () => {
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const L = extras.rexonanceNaniteLayout();
  const p = all.findIndex(({ piece }) => piece.id === "shoulder-outer-l");
  assert.equal(L.receiverN[p], 6);
  for (let plate = 0; plate < all.length; plate += 1) {
    if (L.kind[plate] !== 0) {
      assert.equal(
        L.receiverN[plate],
        0,
        `${all[plate].piece.id}: no face, ornament or driver sockets`,
      );
      continue;
    }
    for (let key = 0; key < L.receiverN[plate]; key += 1) {
      const o = (plate * 6 + key) * 4;
      assert.ok(
        Math.abs(Math.hypot(L.receiver[o + 2], L.receiver[o + 3]) - 1) < 1e-5,
        "unit contour normal",
      );
    }
  }
  // Isolate this plate's actual rendered receiver polygons. Their first two
  // vertices give a shutter's opening along the local contour tangent.
  const saved = [...L.receiverN];
  const savedSlot = L.receiverSlot[p];
  L.receiverN.fill(0);
  L.receiverN[p] = 6;
  L.receiverSlot[p] = 0;
  const { context } = recorder();
  let polygons = [];
  let path = [];
  context.beginPath = () => {
    path = [];
  };
  context.moveTo = (x, y) => path.push([x, y]);
  context.lineTo = (x, y) => path.push([x, y]);
  context.fill = () => {
    polygons = path;
  };
  const ex = extras.createSuitExtras({
    flight: context,
    s: 1,
    ox: 0,
    oy: 0,
    all,
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  const openingAt = (before) => {
    const t = all[p].fit - before;
    const pose = ex.platePose(p, t);
    polygons = [];
    ex.receiversAt(t);
    return Array.from({ length: 6 }, (_, key) => {
      const o = (p * 6 + key) * 4;
      const x = L.receiver[o];
      const y = L.receiver[o + 1];
      const tx = -L.receiver[o + 3];
      const ty = L.receiver[o + 2];
      const cx = pose[0] * x + pose[2] * y + pose[4];
      const cy = pose[1] * x + pose[3] * y + pose[5];
      const a = polygons[key * 8];
      const b = polygons[key * 8 + 1];
      return Math.abs(((a[0] + b[0]) / 2 - cx) * tx + ((a[1] + b[1]) / 2 - cy) * ty);
    });
  };
  const catching = openingAt(57);
  assert.ok(catching[0] < catching[3], "first anchor bites before its opposite");
  assert.ok(catching[3] < catching[1], "opposite bites before the next pair");
  const closed = openingAt(0);
  assert.ok(
    Math.max(...closed) - Math.min(...closed) < 1e-4,
    "all shutters finish together at the fitted contour",
  );
  polygons = [];
  ex.receiversAt(all[p].fit + 64);
  assert.equal(polygons.length, 0, "mechanism disappears after cooling");
  L.receiverN.set(saved);
  L.receiverSlot[p] = savedSlot;
});

// Owner (2026-10-16): 「更にナノマシンの挙動をブラッシュアップして。」 — squads
// that hop lanes behind a white leader, the core's heartbeat breathing the
// rings, seat ripples, tile strings behind white pathfinders that lock on
// and dart in, and chips banked to their orbit with a glint at the near
// apex. All closed-form in the clock: a frame drawn again is the same frame.
test("the swarm's life: squads, strings, and frames that depend on the clock alone", async () => {
  const life = calls.REXONANCE_SUIT_SWARM_LIFE;
  assert.deepEqual(JSON.parse(JSON.stringify(life)), {
    squad: { size: 5, gap: 0.075, hop: [900, 1500], lag: 38 },
    heartbeat: { from: 640, every: 330, lag: 260, breath: 0.035, hover: 1.6 },
    ripple: { ms: 260, speed: 1.1, width: 24, push: 13 },
    string: { gap: 12, reach: 60 },
    glint: { most: 40 },
  });
  // The heartbeat starts after RIDER！'s last pump wave and stops at the seal.
  assert.ok(life.heartbeat.from > calls.REXONANCE_SUIT_SWARM.waves.at(-1));
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const L = extras.rexonanceNaniteLayout();
  // Squads: a leader (white) and up to four followers on its ring and lane.
  let leaders = 0;
  for (let c = 0; c < L.ring.length; c += 1) {
    const lead = L.squad[c];
    assert.equal(L.ring[lead], L.ring[c]);
    assert.equal(L.rank[lead], 0);
    assert.ok(L.rank[c] < life.squad.size);
    if (L.rank[c] === 0) {
      leaders += 1;
      assert.equal(L.chipTone[c], 2, "a squad's leader is white");
      assert.ok(L.hopT[c] >= life.squad.hop[0] && L.hopT[c] <= life.squad.hop[1]);
    } else assert.equal(L.lane[c], L.lane[lead]);
  }
  assert.ok(leaders >= L.ring.length / life.squad.size, `${leaders} squads`);
  // Strings: each tile follows a pathfinder of its own plate that lands first.
  all.forEach((plate, p) => {
    for (let i = L.tileFirst[p]; i < L.tileFirst[p + 1]; i += 1) {
      const lead = L.tLead[i];
      assert.ok(lead >= L.tileFirst[p] && lead < L.tileFirst[p + 1], plate.piece.id);
      assert.ok(L.land[lead] <= L.land[i]);
      assert.equal(L.tRank[lead], 0);
      assert.ok(L.tflags[lead] & 8);
    }
  });
  // A frame is a function of t alone: drawn after another time, or again,
  // it issues exactly the same draws.
  const frame = (ex, log, t) => {
    log.length = 0;
    ex.before(t);
    for (let p = 0; p < all.length; p += 1) {
      const plate = all[p];
      if (t < plate.spawn || t >= plate.last) continue;
      if (t < plate.fit) ex.forming(p, t);
      else {
        if (t < plate.to) {
          ex.seat(p, t);
          ex.unseat();
        }
        ex.conduit(p, t);
      }
    }
    ex.after(t);
    return JSON.stringify(log);
  };
  const { context } = recorder();
  const log = [];
  context.drawImage = (image, ...args) => log.push(image.kind, ...args.map((v) => Math.round(v)));
  const ex = extras.createSuitExtras({
    flight: context,
    s: 1.5,
    ox: 34,
    oy: 31,
    all,
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  for (const t of [700, 905, 1250, 1720]) {
    const first = frame(ex, log, t);
    frame(ex, log, t + 333);
    frame(ex, log, t - 120);
    assert.equal(frame(ex, log, t), first, `${t}: the same frame`);
  }
});

test("the layout preserves bottom-up drains and exact tile timing with one continuous birth interval", async () => {
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const L = extras.rexonanceNaniteLayout();
  // Every non-driver plate has a seam (its real outline) and a gold box.
  let loops = 0;
  all.forEach((plate, p) => {
    if (calls.REXONANCE_SUIT_DRIVER.includes(plate.piece.id)) {
      assert.equal(L.kind[p], -1);
      return;
    }
    assert.ok(L.loopFirst[p + 1] > L.loopFirst[p], `${plate.piece.id}: a seam`);
    assert.ok(L.hasBox[p], `${plate.piece.id}: a gold box`);
    loops += L.loopFirst[p + 1] - L.loopFirst[p];
    // Paint develops from the seat outward within F + 6 … F + 70.
    for (let i = L.tileFirst[p]; i < L.tileFirst[p + 1]; i += 1) {
      assert.ok(L.tp[i] >= plate.fit + 6 && L.tp[i] <= plate.fit + 70, plate.piece.id);
      assert.ok(L.cov[i] >= 0 && L.cov[i] <= 1);
    }
  });
  assert.ok(loops >= 55);
  // Preserve the material and reservation counts, but not the former
  // eight decorative orbital birth lanes.
  const chips = L.ring.length;
  assert.equal(chips, 672);
  let free = 0;
  let legs = 0;
  let legRings = 0;
  let helm = 0;
  for (let c = 0; c < chips; c += 1) {
    assert.ok(L.ring[c] >= 0 && L.ring[c] < 8);
    assert.ok(
      L.birth[c] >= 528 && L.birth[c] <= 748,
      "born in the trailing explosion, with the same bounded release interval",
    );
    assert.ok(
      ignition.naniteFlameEnvelope(L.birth[c] / 2400) <= 0.36,
      "metal overlaps only the declining explosion, never the strong vortex",
    );
    const p = L.chipPlate[c];
    if (p < 0) {
      free += 1;
      assert.equal(L.drainAt[c], Infinity);
      continue;
    }
    assert.ok(L.drainAt[c] >= L.birth[c] + L.sprayMs[c] - 0.01, "drains after its birth");
    if (all[p].piece.group === "legs") {
      legs += 1;
      legRings += L.ring[c];
      assert.ok(L.ring[c] >= 3, "leg drain ordering stays compatible");
      assert.ok(L.drainAt[c] < 900, "and drain first");
    }
    if (all[p].piece.group === "helm") {
      helm += 1;
      assert.equal(L.ring[c], 0, "helmet reservations remain in the top group");
      assert.ok(L.drainAt[c] >= calls.REXONANCE_SUIT_SWARM.crown[1]);
    }
  }
  assert.equal(free, 160);
  assert.ok(legRings / legs >= 5, `leg chips' mean ring ${legRings / legs}`);
  assert.ok(legs > 60 && helm > 20, `${legs} leg chips, ${helm} helmet chips`);
});

test("entrance machines open into a visible two-turn helix with depth, then rejoin their current", async () => {
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const L = extras.rexonanceNaniteLayout();
  const ex = extras.createSuitExtras({
    flight: recorder().context,
    s: 1,
    ox: 0,
    oy: 0,
    all,
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  for (let c = 0; c < L.birth.length; c += 137) {
    const origin = ex.firebrandAt(c, L.birth[c]);
    const nx = L.emitNX[c],
      ny = L.emitNY[c],
      normal2 = nx * nx + ny * ny;
    const angles = [],
      radii = [],
      depths = [];
    for (let step = 5; step <= 95; step++) {
      const u = step / 100,
        t = L.birth[c] + L.sprayMs[c] * u;
      const pose = ex.firePoseAt(c, t),
        current = ex.firePoseAt(c, t, false);
      const mix = u * u * (3 - 2 * u),
        envelope = Math.sin(Math.PI * u) ** 2;
      // Remove the inherited trajectory and vertical arc, then recover the
      // visible ellipse in its local tangent/normal plane from actual poses.
      const dx = pose[0] - (origin[0] + (current[0] - origin[0]) * mix);
      const dy = pose[1] - (origin[1] + (current[1] - origin[1]) * mix) + 24 * envelope;
      const tangent = (-ny * dx + nx * dy) / normal2;
      const normal = ((nx * dx + ny * dy) / normal2 - 22 * envelope) / 0.55;
      let angle = Math.atan2(normal, tangent);
      if (angles.length) while (angle < angles.at(-1) - Math.PI) angle += Math.PI * 2;
      angles.push(angle);
      radii.push(Math.hypot(tangent, normal));
      depths.push(pose[2] - (0.5 + (current[2] - 0.5) * mix));
    }
    assert.ok(angles.at(-1) - angles[0] > Math.PI * 4, `${c}: more than two visible orbital turns`);
    assert.ok(
      Math.max(...radii) >= 38 && Math.max(...radii) <= 57,
      `${c}: substantial bounded orbit radius`,
    );
    assert.ok(
      Math.max(...depths) - Math.min(...depths) > 0.8,
      `${c}: projected depth crosses front and back`,
    );
    assert.ok(
      radii[0] < Math.max(...radii) / 10 && radii.at(-1) < Math.max(...radii) / 10,
      `${c}: radius opens and contracts at both joins`,
    );
    const t = L.birth[c] + L.sprayMs[c] * 0.57;
    const reference = ex.firePoseAt(c, t);
    ex.firePoseAt(c, L.birth[c] + L.sprayMs[c]);
    assert.deepEqual(ex.firePoseAt(c, t), reference, "the helix is exact under reverse scrubbing");
  }
});

test("entrance fire leaves the shared surface before a machine appears at the exact airborne handoff", async () => {
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const L = extras.rexonanceNaniteLayout();
  const ex = extras.createSuitExtras({
    flight: recorder().context,
    s: 1,
    ox: 0,
    oy: 0,
    all,
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  const source = new Float64Array(4);
  const distinct = new Set();
  for (let c = 0; c < L.birth.length; c++) {
    const p = L.chipPlate[c];
    const h2 = ex.fireHash(c, 2111);
    let best = Infinity;
    let expected;
    for (let k = 0; k < (p < 0 ? 1 : 12); k++) {
      ignition.sampleFlameBirth(p < 0 ? h2 : (k + h2) / 12, source);
      const x = source[0] * 571,
        y = source[1] * 1040;
      const distance = p < 0 ? 0 : (x - L.seatX[p]) ** 2 + (y - L.seatY[p]) ** 2;
      if (distance < best) {
        best = distance;
        expected = [x, y, source[2], source[3]];
      }
    }
    for (const [i, values] of [L.emitX, L.emitY, L.emitNX, L.emitNY].entries())
      assert.ok(Math.abs(values[c] - expected[i]) < 0.0001, `${c}/${i}: shared body source`);
    distinct.add(`${Math.floor(L.emitX[c] / 20)},${Math.floor(L.emitY[c] / 20)}`);
    const born = ex.firePoseAt(c, L.birth[c]);
    const prelude = ex.firebrandAt(c, L.brandStart[c]);
    const inherited = ex.firebrandAt(c, L.birth[c]);
    assert.ok(
      Math.hypot(prelude[0] - L.emitX[c], prelude[1] - L.emitY[c]) < 0.0001,
      "the visible flame starts on the real burning surface before the machine",
    );
    assert.ok(
      Math.hypot(born[0] - inherited[0], born[1] - inherited[1]) < 0.0001,
      "the nanite inherits the same airborne flame coordinate without a jump",
    );
    assert.ok(
      Math.hypot(born[0] - L.emitX[c], born[1] - L.emitY[c]) >= 80 - 0.001,
      "the machine forms in the thrown-off fire, at least 80px beyond its body source",
    );
    const boundary = L.birth[c] + L.sprayMs[c];
    const before = ex.firePoseAt(c, boundary - 1e-5);
    const surface = ex.firePoseAt(c, boundary, false);
    assert.ok(
      Math.hypot(before[0] - surface[0], before[1] - surface[1]) < 0.001,
      "scatter joins the material stream without teleporting",
    );
    const middle = [...ex.firePoseAt(c, L.birth[c] + 70)];
    ex.firePoseAt(c, boundary + 300);
    assert.deepEqual(
      [...ex.firePoseAt(c, L.birth[c] + 70)],
      middle,
      "reverse timing is history-free",
    );
  }
  assert.ok(distinct.size >= 30, `${distinct.size} body cells feed the machines, not a few pumps`);
  const { context, log } = recorder();
  const visible = extras.createSuitExtras({
    flight: context,
    s: 1,
    ox: 0,
    oy: 0,
    all,
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  const fireDraws = (t) => {
    log.sources.clear();
    visible.before(t);
    visible.firebrands(t);
    return log.sources.get(flameAsset) ?? 0;
  };
  assert.equal(fireDraws(419), 0);
  for (let t = 420; t <= 900; t += 5)
    assert.equal(fireDraws(t), 0, `${t}: airborne nanites never carry detached flame blobs`);
  assert.equal(fireDraws(900), 0, "firebrands cool completely after the last crossfade");
});

test("neither chips nor non-driver armour draw before the trailing explosion at 528ms", async () => {
  for (const touch of [false, true]) {
    const { plan, extras } = await extrasRuntime({ touch });
    const all = plan.plates(),
      { context, log } = recorder();
    const ex = extras.createSuitExtras({
      flight: context,
      s: 1,
      ox: 0,
      oy: 0,
      all,
      gold: plan.cells(),
      source: { kind: "work" },
      sheet: { kind: "motes" },
    });
    for (let t = 0; t < 528; t += 5) {
      log.draws = 0;
      log.paints = 0;
      log.sources.clear();
      ex.before(t);
      for (let p = 0; p < all.length; p++)
        if (!calls.REXONANCE_SUIT_DRIVER.includes(all[p].piece.id)) {
          ex.forming(p, t);
          ex.seat(p, t);
          ex.unseat();
          ex.conduit(p, t);
        }
      ex.after(t);
      assert.equal(log.draws, 0, `${touch ? "touch" : "fine"}/${t}: no material bitmap`);
      assert.equal(
        log.paints,
        0,
        `${touch ? "touch" : "fine"}/${t}: no typed-metal rectangle, facet fill or stroke`,
      );
      ex.firebrands(t);
      assert.ok(
        [...log.sources.keys()].every((key) => key === flameAsset),
        "only fire, not early machine sprites, may render",
      );
      assert.equal(
        log.paints,
        0,
        "flying fire uses actual irregular-alpha volumes, not early square machines",
      );
    }
    const L = extras.rexonanceNaniteLayout();
    for (let p = 0; p < all.length; p++)
      if (L.kind[p] >= 0)
        for (let i = L.tileFirst[p]; i < L.tileFirst[p + 1]; i++)
          assert.ok(
            L.land[i] >= 588,
            "first plate cells start growing after the first metal can emerge",
          );
  }
});

test("keyed nanites stay continuous through braking, alignment, capture and insertion", async () => {
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const L = extras.rexonanceNaniteLayout();
  const { context } = recorder();
  const ex = extras.createSuitExtras({
    flight: context,
    s: 1,
    ox: 0,
    oy: 0,
    all,
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  const axes = new Set();
  let checked = 0;
  for (let p = 0; p < all.length; p += 1) {
    if (L.kind[p] < 0) continue;
    const first = L.tileFirst[p];
    const end = L.tileFirst[p + 1];
    for (let i = first; i < end; i += 1) {
      assert.ok(Math.abs(Math.hypot(L.dockX[i], L.dockY[i]) - 1) < 1e-6, "unit docking axis");
      axes.add(`${L.dockX[i].toFixed(2)},${L.dockY[i].toFixed(2)}`);
      if (i !== first && i !== end - 1 && i !== Math.floor((first + end) / 2)) continue;
      for (const boundary of [0.46, 0.68, 0.7, 0.8, 0.82, 0.94, 1]) {
        const left = ex.poseAt(p, i, boundary - 1e-7);
        const right = ex.poseAt(p, i, boundary);
        assert.ok(
          Math.hypot(left[0] - right[0], left[1] - right[1]) < 0.01,
          `${all[p].piece.id} at ${boundary}: no position jump`,
        );
        assert.ok(Math.abs(left[6] - right[6]) < 0.01, `${boundary}: no size pop`);
      }
      const gap = ex.poseAt(p, i, 0.94);
      assert.ok(
        Math.abs(Math.hypot(gap[0] - L.cx[i], gap[1] - L.cy[i]) - 2) < 1e-6,
        "capture leaves a two-pixel insertion gap",
      );
      const locked = ex.poseAt(p, i, 1);
      assert.ok(
        Math.hypot(locked[0] - L.cx[i], locked[1] - L.cy[i]) < 1e-6,
        "insertion ends on the artwork cell exactly",
      );
      assert.equal(Math.abs(locked[7]), 0, "face aligned at contact");
      assert.ok(Math.abs(locked[9]) < 1e-6, "chip fades on the existing landing clock");
      checked += 1;
    }
  }
  assert.ok(axes.size >= 8, "joining axes follow local neighbours around the armour");
  assert.ok(checked >= 100, "sample every armour and ornament group including the helmet");
});

test("receiver jaws close on contact and cool without obscuring the helmet", async () => {
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const L = extras.rexonanceNaniteLayout();
  const { context } = recorder();
  const ex = extras.createSuitExtras({
    flight: context,
    s: 1,
    ox: 0,
    oy: 0,
    all,
    gold: plan.cells(),
    source: { kind: "work" },
    sheet: { kind: "motes" },
  });
  let candidate;
  for (let p = 0; p < all.length && !candidate; p += 1) {
    if (L.kind[p] !== 0) continue;
    for (let i = L.tileFirst[p]; i < L.tileFirst[p + 1]; i += 1) {
      if (i % 11 === 0 && L.land[i] + 44 < all[p].fit) {
        candidate = { p, i };
        break;
      }
    }
  }
  assert.ok(candidate, "an armour tile with time to cool before fitting");
  for (const since of [-25, 6, 28]) {
    const t = L.land[candidate.i] + since;
    ex.before(t);
    ex.forming(candidate.p, t);
    const raw = ex.docking();
    const entries = Array.from({ length: raw.length / 8 }, (_, k) => raw.slice(k * 8, k * 8 + 8));
    const key = entries.find((entry) => Math.abs(entry[6] - since) < 0.001);
    assert.ok(key, `${since}: receiver mechanism is visible`);
    if (since < 0) assert.ok(key[5] > 0.5, "jaws open before capture");
    else assert.equal(key[5], 0, "jaws latch at contact");
    assert.ok(key[7] > 0 && key[7] <= 1, "bounded cooling visibility");
  }
  const atFit = all.findIndex(
    (plate, p) =>
      L.kind[p] === 0 &&
      Array.from(L.land.subarray(L.tileFirst[p], L.tileFirst[p + 1])).some(
        (land, k) => (L.tileFirst[p] + k) % 11 === 0 && plate.fit - land < 25,
      ),
  );
  assert.ok(atFit >= 0, "a late receiver continues through plate fitting");
  ex.before(all[atFit].fit + 5);
  ex.seat(atFit, all[atFit].fit + 5);
  assert.ok(ex.docking().length > 0, "fitting does not cut off cooling receivers");
  for (let p = 0; p < all.length; p += 1) {
    if (L.kind[p] !== 3) continue;
    const t = L.land[L.tileFirst[p]];
    ex.before(t);
    ex.forming(p, t);
    assert.equal(ex.docking().length, 0, "late face pixels stay clear of receiver jaws");
  }
});

// Owner override (2026-10-16): 「金のガイドウェイは上から被さる形ではなく、足先から
// 滑らかに作られていく。」 The guideway is built on the body, never laid over it:
// no top-down scan or projection remains; each trim grows along its channel
// from its lowest cell (the tail from its root) behind a weld head, the
// front climbs the figure from the toe tips in the fitting order, every
// guideway is whole before its plate's first tile lands, the conduit prints
// onto the plate in the same bottom-to-top order, and the clamps slide in
// along the surface (their swing-in frames, which drop from above, unused).
test("the guideway grows from the toe tips up; clamps slide in; nothing descends", async () => {
  assert.doesNotMatch(extrasSource, /KIT_FX\.scan|sweep/);
  assert.match(extrasSource, /if \(!whole\) printClip\(unc, plate\.end, front, true\);/);
  assert.match(extrasSource, /if \(L\.buildFrac\[i\] <= front !== printed\) continue;/);
  assert.match(extrasSource, /frame = 7;\s*drift = 1\.1 \* \(1 - easeOut\(u\)\);/);
  assert.doesNotMatch(extrasSource, /frame = Math\.min\(7, Math\.floor\(u \* 8\)\)/);
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const gold = plan.cells();
  const L = extras.rexonanceNaniteLayout();
  const { build } = calls.REXONANCE_SUIT_SWARM;
  const box = (p) => [...L.box.slice(p * 4, p * 4 + 4)];
  let built = 0;
  all.forEach((plate, p) => {
    if (L.kind[p] < 0 || plate.end <= plate.first) return;
    built += 1;
    const F = plate.fit;
    const lead = L.kind[p] === 1 || L.kind[p] === 2 ? build.ornament : build.lead;
    const id = plate.piece.id;
    // Never long before its plate, whole before its first tile lands.
    assert.ok(L.buildA[p] >= F - lead - 0.01, `${id} starts ${F - L.buildA[p]} before F`);
    const retimed = L.buildA[p] === 528;
    const firstLand = Math.min(
      ...plate.tiles.map((tile) => ignition.naniteMaterialLanding(tile.land, F)),
    );
    assert.ok(L.buildA[p] >= 528, `${id} guide metal waits until the trailing explosion`);
    // Only the early guide window is squeezed after 600ms. Its original
    // cell order is preserved and it remains whole before the first plate cell.
    assert.ok(
      L.buildB[p] <= (retimed ? Math.max(568, F - build.done) : F - build.done) + 0.01,
      `${id} whole ${F - L.buildB[p]} before F`,
    );
    assert.ok(L.buildB[p] <= firstLand - (retimed ? 10 : 0) + 0.01, `${id} before its tiles`);
    assert.ok(L.buildB[p] - L.buildA[p] >= 40, id);
    // Monotone along the plate's build; each cell inside the window.
    let bottom = -Infinity;
    for (let k = plate.first; k < plate.end; k += 1) {
      if (k > plate.first) assert.ok(L.buildSorted[k] >= L.buildSorted[k - 1], id);
      const i = L.buildIdx[k];
      assert.ok(i >= plate.first && i < plate.end, id);
      assert.ok(L.buildAt[i] >= L.buildA[p] - 0.01 && L.buildAt[i] <= L.buildB[p] + 0.01, id);
      bottom = Math.max(bottom, gold.fy[i]);
    }
    // It starts at its lowest trim cell (the tail at its root, by its seat).
    const entry = L.buildIdx[plate.first];
    if (L.kind[p] !== 1) assert.equal(gold.fy[entry], bottom, `${id} starts at its lowest cell`);
  });
  assert.equal(built, 55);
  // The legs: the front climbs from the toe tips (with RIDER！) to the
  // thighs — a plate whose gold sits lower starts no later.
  const legs = all.map((_, p) => p).filter((p) => all[p].piece.group === "legs");
  const feet = legs.filter((p) => all[p].piece.id.startsWith("boot-foot"));
  for (const p of feet) {
    assert.ok(L.buildA[p] >= calls.REXONANCE_SUIT_SWARM.waves[0], "after RIDER！ begins");
    assert.ok(
      L.buildA[p] <= Math.min(...legs.map((q) => L.buildA[q])) + 0.01,
      "the toe tips first",
    );
  }
  for (const a of legs)
    for (const b of legs) {
      const [, ay, , ah] = box(a);
      const [, by, , bh] = box(b);
      if (ay + ah > by + bh + 8)
        assert.ok(L.buildA[a] <= L.buildA[b] + 0.01, `${all[a].piece.id} below ${all[b].piece.id}`);
    }
  // The tail, root to blade.
  const tail = all
    .map((_, p) => p)
    .filter((p) => L.kind[p] === 1)
    .sort((a, b) => all[a].fit - all[b].fit);
  for (let k = 1; k < tail.length; k += 1) assert.ok(L.buildA[tail[k]] > L.buildA[tail[k - 1]]);
});

// Review (2026-10-16, 滑らかに): the weld head is a thin thread along each
// trim's channel — a one-cell skeleton of its gold (Zhang–Suen), each cell
// linked back to its predecessor along the build — never a band of cell-sized
// squares; it rounds the cell steps into curves and glows at its growing
// tips, and the pulses run the channel as short dashes.
test("the weld head runs the trims' channels as a thread, not a band of squares", async () => {
  assert.doesNotMatch(extrasSource, /cellRects|b <= front - 0\.08/);
  assert.match(
    extrasSource,
    /trace\(p, front, Math\.max\(0\.04, PRINT_CELLS \* L\.cellFrac\[p\]\), TOUCH \? 0 : HEAD_TIPS\);\s*flushHeads\(\);\s*flushTips\(\);/,
  );
  assert.match(
    extrasSource,
    /flight\.quadraticCurveTo\(segs\[o \+ 2\], segs\[o \+ 3\], segs\[o \+ 4\], segs\[o \+ 5\]\);/,
  );
  const { plan, extras } = await extrasRuntime({ touch: false });
  const all = plan.plates();
  const gold = plan.cells();
  const L = extras.rexonanceNaniteLayout();
  let cells = 0;
  let channel = 0;
  all.forEach((plate, p) => {
    if (L.kind[p] < 0 || plate.end <= plate.first) return;
    const id = plate.piece.id;
    const a0 = L.chanFirst[p];
    const a1 = L.chanFirst[p + 1];
    assert.ok(a1 > a0, `${id}: a channel`);
    cells += plate.end - plate.first;
    channel += a1 - a0;
    for (let k = a0; k < a1; k += 1) {
      const i = L.chanIdx[k];
      assert.ok(i >= plate.first && i < plate.end && L.chan[i] === 1, id);
      assert.equal(L.chanFrac[k], L.buildFrac[i]);
      if (k > a0) assert.ok(L.chanFrac[k] >= L.chanFrac[k - 1], `${id}: by build`);
      const j = L.chanPrev[i];
      if (j < 0) continue;
      // Its predecessor: a channel cell of the same plate, an 8-neighbour,
      // built before it.
      assert.ok(j >= plate.first && j < plate.end && L.chan[j] === 1, id);
      assert.ok(L.buildFrac[j] < L.buildFrac[i], id);
      assert.ok(
        Math.abs(gold.fx[j] - gold.fx[i]) <= 4.01 && Math.abs(gold.fy[j] - gold.fy[i]) <= 4.01,
        id,
      );
    }
  });
  // A thread: far fewer cells than the trims' gold.
  assert.ok(channel < cells * 0.6, `${channel} channel cells of ${cells}`);
  assert.ok(channel > cells * 0.1, `${channel} channel cells of ${cells}`);
});
