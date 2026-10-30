// FAR FROM SAGA's entry transformation (owner, 2026-10-22: 「遷移画面の変身
// アニメーション」, modelled on Rexonance's entry call): its calls, clock and
// cascade, the closed-form swarm of both nanite kits, the engine's draw
// passes (no per-frame allocation), the gold fire, the route transition
// screen that plays it (as Rexonance's: its loader, warm-up, tiers and
// skip), and the delivered suit data.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import sharp from "sharp";
import { FAR_FROM_SAGA } from "../src/components/final-stage/final-stage-data.ts";
import * as calls from "../src/lib/far-from-entry-calls.ts";
import * as suit from "../src/lib/far-from-entry-suit.ts";
import * as kits from "../src/lib/far-from-entry-kits.ts";
import * as ignition from "../src/lib/far-from-entry-ignition.js";
import * as swarm from "../src/lib/far-from-entry-swarm.js";
import { NANITE_FIRE_PHASES } from "../src/lib/rexonance-ignition.js";
import { FIRE_TONES } from "../src/lib/rexonance-fire/fire-tuning.js";
import { REXONANCE_NANITE_CELLS } from "../src/lib/rexonance-nanites.ts";
import { FAR_FROM_NANITE_CELLS } from "../src/lib/far-from-nanites.ts";
import { REXONANCE_SUIT_SIZE } from "../src/lib/rexonance-suit.ts";
import { createFarFromTransitionLoader } from "../src/lib/far-from-entry-gate.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const transition = read("src/components/far-from-saga/far-from-entry-transition.tsx");
const sequence = read("src/components/far-from-saga/far-from-entry-sequence.tsx");
const engine = read("src/components/far-from-saga/far-from-entry-engine.ts");
const plan = read("src/components/far-from-saga/far-from-entry-plan.ts");
const warmup = read("src/lib/far-from-entry-warmup.ts");
const page = read("src/components/far-from-saga/far-from-saga.tsx");
const sheet = read("src/styles-far-from-entry.css");
const gate = read("src/components/load-gate.tsx");
const gateModule = read("src/lib/far-from-entry-gate.ts");
const root = read("src/routes/__root.tsx");

test("the seven calls are the record's own, verbatim, on six contiguous beats inside the cover", () => {
  assert.equal(calls.FAR_FROM_CALLS, FAR_FROM_SAGA.calls);
  assert.deepEqual(
    [...calls.FAR_FROM_CALLS],
    [
      "FAR FROM DEUS！",
      "REXONANCE！",
      "SUPERIOR！",
      "RIDER！FAR FROM！",
      "SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！！！",
      "FAR FROM！FAR FROM！FAR FROM！FAR FROM！",
      "FAR FROM DEUS！",
    ],
  );
  const spoken = calls.FAR_FROM_ENTRY_BEATS.flatMap((beat) => beat.calls);
  assert.deepEqual(spoken, [0, 1, 2, 3, 4, 5, 6], "every call once, in order");
  let end = 0;
  for (const beat of calls.FAR_FROM_ENTRY_BEATS) {
    assert.equal(beat.start, end, "beats replace each other on the frame");
    assert.ok(beat.duration > 0);
    end = beat.start + beat.duration;
  }
  assert.equal(end, calls.FAR_FROM_ENTRY_TIMINGS.cover);
  assert.equal(calls.FAR_FROM_ENTRY_TIMINGS.reveal, 480);
  assert.deepEqual(
    calls.FAR_FROM_ENTRY_BEATS.map((beat) => beat.role),
    ["opening", "cut", "rider", "chant", "repetition", "final"],
  );
  // The sequence's lines reproduce each long call exactly.
  assert.match(sequence, /<span>RIDER！<\/span>\s*<span>FAR FROM！<\/span>/);
  assert.equal("RIDER！" + "FAR FROM！", calls.FAR_FROM_CALLS[3]);
  assert.match(sequence, /\{line === 3 \? "DEUS！！！" : "DEUS！"\}/);
  assert.equal("SA-GA！DEUS！".repeat(3) + "SA-GA！DEUS！！！", calls.FAR_FROM_CALLS[4]);
  assert.equal((sequence.match(/<span>FAR FROM！<\/span>/g) ?? []).length, 5);
  assert.equal("FAR FROM！".repeat(4), calls.FAR_FROM_CALLS[5]);
  assert.match(sequence, /<span>FAR FROM<\/span>\s*<span>DEUS！<\/span>/);
  assert.equal("FAR FROM" + " " + "DEUS！", calls.FAR_FROM_CALLS[6]);
  assert.equal(calls.beatCall(calls.FAR_FROM_ENTRY_BEATS[0]), "FAR FROM DEUS！\nREXONANCE！");
  assert.match(sequence, /data-call=\{beatCall\(beat\)\}/);
  // No audio, no browser reads in render.
  for (const banned of ["AudioContext", "new Audio", "speechSynthesis", "Math.random"])
    assert.equal(sequence.includes(banned), false, banned);
  // Plain HUD copy from the page's own facts.
  assert.deepEqual(calls.FAR_FROM_SUIT_SYSTEMS[2], ["KHAOS DeuX", "60000〜YOPS / ∞Core"]);
  assert.match(FAR_FROM_SAGA.specs.find((row) => row.dt === "主演算").dd, /60000〜YOPS／∞Core/);
  // A form is named in katakana only (owner, 2026-10-23).
  assert.deepEqual([...calls.FAR_FROM_ENTRY_CAPTION], ["FARFROM DRIVE", "SA-GA OS 6.1 / ミドル"]);
});

test("the fire clock: the scan ends at the ignition, the 爆散 is under RIDER！FAR FROM！, the material is there before the chant, and the phase is monotone", () => {
  const { ignite, burst } = ignition.FAR_FROM_ENTRY_FIRE;
  assert.equal(ignite, calls.FAR_FROM_ENTRY_SCAN.from + calls.FAR_FROM_ENTRY_SCAN.span);
  const rider = calls.FAR_FROM_ENTRY_BEATS.find((beat) => beat.role === "rider");
  assert.ok(burst > rider.start && burst < rider.start + rider.duration);
  assert.equal(ignition.farFromFlamePhase(ignite), 0);
  assert.equal(ignition.farFromFlamePhase(burst), NANITE_FIRE_PHASES.burstStart);
  assert.equal(
    ignition.FAR_FROM_ENTRY_MATERIAL,
    burst + (NANITE_FIRE_PHASES.materialStart - NANITE_FIRE_PHASES.burstStart) * 2400,
  );
  assert.equal(
    ignition.FAR_FROM_ENTRY_FLAME_END,
    burst + (NANITE_FIRE_PHASES.flameEnd - NANITE_FIRE_PHASES.burstStart) * 2400,
  );
  const chant = calls.FAR_FROM_ENTRY_BEATS.find((beat) => beat.role === "chant");
  assert.ok(
    ignition.FAR_FROM_ENTRY_FLAME_END <= chant.start,
    "the fire is gone as the chant strikes",
  );
  let previous = -1;
  for (let t = 0; t <= 3300; t += 1) {
    const phase = ignition.farFromFlamePhase(t);
    assert.ok(phase >= previous, "monotone");
    assert.ok(
      Math.abs(ignition.farFromFlameTime(phase) - Math.max(t, ignite)) < 1e-6,
      "exact inverse",
    );
    previous = phase;
  }
  // The earliest plates' landing windows are held until the material is there.
  const fit = calls.FAR_FROM_SUIT_FIT["boot-l"];
  const land = ignition.farFromMaterialLanding(fit - 100, fit);
  assert.ok(land >= ignition.FAR_FROM_ENTRY_MATERIAL + 60 && land < fit);
  assert.equal(ignition.farFromMaterialLanding(fit, fit), fit, "the fit is kept");
  const late = calls.FAR_FROM_SUIT_FIT["helmet-crest"];
  assert.equal(
    ignition.farFromMaterialLanding(late - 100, late),
    late - 100,
    "late plates untouched",
  );
});

test("the cascade seats every plate of the suit once, in order, each group on its DEUS！, the helmet last, the eyes and reactor after the last call", () => {
  const ids = suit.FAR_FROM_ENTRY_PIECES.map((piece) => piece.id);
  const ordered = calls.FAR_FROM_SUIT_CASCADE.flatMap((group) => group.order);
  assert.deepEqual([...ordered].sort(), [...ids].sort(), "every piece, once");
  const chant = calls.FAR_FROM_ENTRY_BEATS.find((beat) => beat.role === "chant");
  assert.equal(calls.FAR_FROM_SUIT_SNAP.legs, chant.start + 230);
  assert.equal(calls.FAR_FROM_SUIT_SNAP.chest, chant.start + 230 + 3 * 120);
  const final = calls.FAR_FROM_ENTRY_BEATS.find((beat) => beat.role === "final");
  assert.equal(calls.FAR_FROM_SUIT_SNAP.helm, final.start - 90);
  for (const group of calls.FAR_FROM_SUIT_CASCADE) {
    let last = -1;
    for (const id of group.order) {
      const fit = calls.FAR_FROM_SUIT_FIT[id];
      assert.ok(Number.isFinite(fit) && fit >= group.from && fit <= group.to, id);
      assert.ok(fit >= last, `${id} fits after its predecessor`);
      last = fit;
    }
    assert.equal(calls.FAR_FROM_SUIT_FIT[group.order[group.order.length - 1]], group.to);
    for (const id of group.order)
      assert.equal(suit.FAR_FROM_ENTRY_PIECES.find((piece) => piece.id === id).group, group.group);
  }
  assert.deepEqual(
    [...calls.FAR_FROM_SUIT_ACCENTS],
    ["thigh-r", "belt", "arm-fist-r", "chest", "helmet-crest"],
  );
  assert.ok(Math.max(...Object.values(calls.FAR_FROM_SUIT_FIT)) < final.start);
  assert.equal(calls.FAR_FROM_SUIT_PIXELS.fill, final.start + 10);
  assert.equal(calls.FAR_FROM_SUIT_PIXELS.scatter, final.start + 540);
  assert.equal(calls.FAR_FROM_SUIT_LIGHT.from, final.start);
  assert.ok(
    calls.FAR_FROM_SUIT_LIGHT.from + calls.FAR_FROM_SUIT_LIGHT.bloom <
      calls.FAR_FROM_ENTRY_TIMINGS.cover,
  );
  assert.ok(
    calls.FAR_FROM_SUIT_PIXELS.scatter +
      calls.FAR_FROM_SUIT_PIXELS.scatterMs +
      5 * calls.FAR_FROM_SUIT_PIXELS.scatterStep <
      calls.FAR_FROM_ENTRY_TIMINGS.cover,
  );
  // The reactor completes as the eyes do (owner): the same squares on both.
  assert.match(sequence, /name: "eyes",[\s\S]*?glow: FAR_FROM_ENTRY_EYES_GLOW/);
  assert.match(sequence, /name: "reactor",[\s\S]*?glow: FAR_FROM_ENTRY_REACTOR_GLOW/);
  assert.match(sequence, /className=\{`rx-suit-pixels is-\$\{light\.name\}`\}/);
  // The undersuit is gone before the helmet seats.
  assert.ok(
    calls.FAR_FROM_SUIT_UNDER.outAt + calls.FAR_FROM_SUIT_UNDER.outMs <=
      calls.FAR_FROM_SUIT_SNAP.helm,
  );
});

// A plan over synthetic tiles: two plates, each with tiles that fly from
// `start` to the plate's fit.
function synthetic(count, free) {
  const starts = [1000, 1050, 1100, 1400, 1450, 1500];
  const tiles = {
    x: Float32Array.of(100, 110, 120, 300, 310, 320),
    y: Float32Array.of(900, 910, 920, 400, 410, 420),
    start: Float32Array.from(starts),
  };
  return swarm.planFarFromSwarm({
    count,
    free,
    tiles,
    plateTiles: Int32Array.of(0, 3, 6),
    under: suit.FAR_FROM_ENTRY_UNDER,
    figure: {
      width: suit.FAR_FROM_ENTRY_SIZE.width,
      height: suit.FAR_FROM_ENTRY_SIZE.height,
      core: suit.FAR_FROM_ENTRY_MARKS.core,
    },
    swarm: calls.FAR_FROM_ENTRY_SWARM,
    kitB: kits.FAR_FROM_ENTRY_KIT_B_SHARE,
  });
}

test("the swarm is closed-form and deterministic: born from cooled fragments, both kits mixed, every bound chip spent at its tile's flight, the free chips imploded by the last call, the same frames on reverse", () => {
  const a = synthetic(96, 16);
  const b = synthetic(96, 16);
  for (const key of ["born", "kit", "tone", "plate", "arriveAt", "tx", "ty", "size"])
    assert.deepEqual(Array.from(a[key]), Array.from(b[key]), key);
  const { burst } = ignition.FAR_FROM_ENTRY_FIRE;
  let kitB = 0;
  for (let c = 0; c < a.count; c += 1) {
    assert.ok(
      a.born[c] >= ignition.FAR_FROM_ENTRY_MATERIAL - 1 &&
        a.born[c] <= ignition.FAR_FROM_ENTRY_FLAME_END + 1,
      "born as its fragment cools",
    );
    assert.ok(a.born[c] > burst);
    assert.ok(a.tone[c] >= 0 && a.tone[c] <= 3);
    assert.ok(a.kit[c] === 0 || a.kit[c] === 1);
    kitB += a.kit[c];
    assert.ok(
      a.size[c] >= calls.FAR_FROM_ENTRY_SWARM.size[0] &&
        a.size[c] <= calls.FAR_FROM_ENTRY_SWARM.size[1],
    );
  }
  assert.ok(
    kitB > a.count * 0.35 && kitB < a.count * 0.65,
    `both kinds mixed (${kitB} of ${a.count} kit B)`,
  );
  assert.equal(a.bound, 80);
  for (let c = 0; c < a.bound; c += 1) {
    assert.ok(a.plate[c] === 0 || a.plate[c] === 1);
    assert.ok(a.drainAt[c] < a.arriveAt[c]);
  }
  for (let c = a.bound; c < a.count; c += 1) assert.equal(a.plate[c], -1);
  const out = new Float64Array(swarm.CHIP_SLOTS);
  const other = new Float64Array(swarm.CHIP_SLOTS);
  const states = new Set();
  for (let t = 0; t <= 3300; t += 37)
    for (let c = 0; c < a.count; c += 1) {
      swarm.farFromChipPose(a, c, t, out);
      swarm.farFromChipPose(b, c, t, other);
      assert.deepEqual(Array.from(out), Array.from(other));
      states.add(out[swarm.CHIP_STATE]);
      if (out[swarm.CHIP_STATE] === 0) continue;
      assert.ok(Number.isFinite(out[swarm.CHIP_X]) && Number.isFinite(out[swarm.CHIP_Y]));
      assert.ok(out[swarm.CHIP_ALPHA] >= 0 && out[swarm.CHIP_ALPHA] <= 1);
      assert.ok(out[swarm.CHIP_DEPTH] >= 0 && out[swarm.CHIP_DEPTH] <= 1);
      assert.ok(out[swarm.CHIP_FRAME] >= 0 && out[swarm.CHIP_FRAME] < 24);
      assert.ok(t >= a.born[c], "nothing before its birth");
      if (a.plate[c] >= 0) assert.ok(t < a.arriveAt[c], "spent at its tile's flight");
    }
  assert.deepEqual([...states].sort(), [0, 1, 2, 3, 4, 5], "every life stage is reached");
  // Reverse: the frame at 1500 after 2000 is the frame at 1500.
  swarm.farFromChipPose(a, 5, 2000, out);
  swarm.farFromChipPose(a, 5, 1500, out);
  swarm.farFromChipPose(b, 5, 1500, other);
  assert.deepEqual(Array.from(out), Array.from(other));
  // The free chips are gone at the implosion's end; a bound chip drains to its tile.
  const S = calls.FAR_FROM_ENTRY_SWARM;
  for (let c = a.bound; c < a.count; c += 1) {
    swarm.farFromChipPose(a, c, S.implode[1] + 1, out);
    assert.equal(out[swarm.CHIP_STATE], 0);
  }
  swarm.farFromChipPose(a, 0, a.arriveAt[0] - 0.5, out);
  assert.equal(out[swarm.CHIP_STATE], 3);
  assert.ok(
    Math.hypot(out[swarm.CHIP_X] - a.tx[0], out[swarm.CHIP_Y] - a.ty[0]) < 2,
    "at its tile",
  );
  assert.ok(S.implode[1] <= calls.FAR_FROM_SUIT_PIXELS.fill);
});

// The engine's draw passes: everything inside start() from the first
// per-call closure to finish(). Audited as the Rexonance swarm's are.
function drawPasses() {
  const from = engine.indexOf("    const settle = (p: number) => {");
  const to = engine.indexOf("    const finish = (why: string) => {", from);
  assert.ok(from > 0 && to > from);
  return engine.slice(from, to);
}

test("the engine's draw passes allocate nothing, use no timers, randomness, filters or composites, and hold a draw budget by tier", () => {
  const draw = drawPasses();
  assert.ok(draw.length > 8_000, String(draw.length));
  const executable = ts.transpileModule(draw, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, removeComments: true },
  }).outputText;
  assert.doesNotMatch(
    executable,
    /\bnew |\.map\(|\.filter\(|\.slice\(|\.concat\(|\[\]|Array\.from|\.push\(|`|Math\.random|setTimeout|setInterval|globalCompositeOperation|\.filter =/,
  );
  // No closure is created inside a pass (every helper is made once).
  const source = ts.createSourceFile(
    "engine.ts",
    draw,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const forbidden = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const init = declaration.initializer;
      if (!init || !(ts.isArrowFunction(init) || ts.isFunctionExpression(init))) continue;
      const name = declaration.name.getText(source);
      const visit = (node) => {
        if (
          ts.isNewExpression(node) ||
          ts.isObjectLiteralExpression(node) ||
          ts.isArrayLiteralExpression(node) ||
          ts.isArrowFunction(node) ||
          ts.isFunctionExpression(node) ||
          ts.isTemplateExpression(node) ||
          ts.isSpreadElement(node)
        )
          forbidden.push(`${name}: ${ts.SyntaxKind[node.kind]}`);
        ts.forEachChild(node, visit);
      };
      visit(init.body);
    }
  }
  assert.deepEqual(forbidden, []);
  for (const helper of [
    "sprite",
    "drawChips",
    "drawPlate",
    "drawLight",
    "drawFirebrands",
    "draw",
    "settle",
    "reset",
    "occupied",
  ])
    assert.match(draw, new RegExp(`const ${helper} = \\(`), helper);
  // Sprites on whole device pixels; the one sprite path for both kits.
  assert.match(draw, /const k = Math\.round\(d\) \|\| 1;\s*const sheet = sheets\[kit\];/);
  assert.match(
    draw,
    /sprite\(kit, swarm\.tone\[c\], tumble, pose\[CHIP_X\] \* s, pose\[CHIP_Y\] \* s, d\);/,
  );
  assert.match(draw, /if \(counters\[0\] >= budget\) return;/);
  assert.match(engine, /const budget = coarse \? S\.budget\.touch : S\.budget\.desktop;/);
  assert.match(engine, /const chips = coarse \? S\.chips\.touch : S\.chips\.desktop;/);
  // Owner (2026-10-30): the suit-up boost — a denser swarm, the budget with it.
  assert.deepEqual({ ...calls.FAR_FROM_ENTRY_SWARM.budget }, { desktop: 3100, touch: 980 });
  assert.deepEqual({ ...calls.FAR_FROM_ENTRY_SWARM.chips }, { desktop: 512, touch: 112 });
  assert.match(plan, /const BLOCK = TOUCH \? 2 : 1;/);
  // Scrubbed back, the settled canvas resets; the finished frame is the artwork.
  assert.match(draw, /if \(t < last\) reset\(\);/);
  assert.match(engine, /settled\.drawImage\(figure, 0, 0, FIG\.width \* s, FIG\.height \* s\);/);
  // No WebGL of its own: the shared fire falls back to its CPU kernel.
  assert.doesNotMatch(engine, /getContext\("webgl/);
});

test("the fire burns on the registered undersuit in its gold end tone, and the two kits share one layout", () => {
  assert.match(engine, /const TONE = FIRE_TONES\.gold;/);
  assert.equal(FIRE_TONES.gold, 1);
  assert.match(
    engine,
    /drawBodyFlame\(flight, UNDER_SIZE, flame, clock, 1, "back", phase, TONE\);/,
  );
  assert.match(
    engine,
    /drawBodyFlame\(flight, UNDER_SIZE, flame, clock, 1, "front", phase, TONE\);/,
  );
  assert.match(engine, /drawNaniteFlame\(flight, UNDER_CORE, flame, clock, 1, TONE\);/);
  assert.match(engine, /prepareBodyFlame\(sources\.under, REXONANCE_SUIT_SIZE\);/);
  const U = suit.FAR_FROM_ENTRY_UNDER;
  assert.ok(
    Math.abs(U.w / REXONANCE_SUIT_SIZE.width - U.h / REXONANCE_SUIT_SIZE.height) < 1e-3,
    "the undersuit keeps its aspect",
  );
  assert.ok(
    Math.abs(U.x + U.w / 2 - suit.FAR_FROM_ENTRY_SIZE.width / 2) < 6,
    "on the figure's axis",
  );
  assert.ok(U.y + U.h > suit.FAR_FROM_ENTRY_SIZE.height * 0.95, "soles at the figure's soles");
  // Kit A is Rexonance's hex kit, kit B the crystal: the same layout keys.
  assert.equal(kits.FAR_FROM_ENTRY_KITS[0], REXONANCE_NANITE_CELLS);
  assert.equal(kits.FAR_FROM_ENTRY_KITS[1], FAR_FROM_NANITE_CELLS);
  assert.equal(kits.FAR_FROM_ENTRY_KIT_B_STANDIN, false);
  assert.notEqual(FAR_FROM_NANITE_CELLS.src, REXONANCE_NANITE_CELLS.src);
  for (const key of [
    "cell",
    "frames",
    "lockFrame",
    "tones",
    "mip",
    "unfold",
    "bokeh",
    "bead",
    "spark",
  ])
    assert.deepEqual(FAR_FROM_NANITE_CELLS[key], REXONANCE_NANITE_CELLS[key], key);
  assert.deepEqual(kits.FAR_FROM_ENTRY_KIT_ASSETS, [
    REXONANCE_NANITE_CELLS.src,
    FAR_FROM_NANITE_CELLS.src,
  ]);
  assert.ok(warmup.includes("FAR_FROM_ENTRY_KIT_ASSETS"));
  for (const src of kits.FAR_FROM_ENTRY_KIT_ASSETS)
    statSync(new URL(`../public${src}`, import.meta.url));
});

test("the entry plays in the route transition screen as Rexonance's does: prepared before the cover with a deadline, warmed beside it, retained through the reveal, timed by its own light module", () => {
  // The gate imports one light module; the sequence, the engine, the fire
  // and the atlas data are its dynamic imports.
  assert.match(gate, /from "@\/lib\/far-from-entry-gate"/);
  assert.match(gate, /from "@\/lib\/far-from-entry-timings"/);
  assert.doesNotMatch(gate, /^import .*far-from-entry-(sequence|engine|warmup|suit|calls|kits|swarm)/m);
  assert.match(
    gateModule,
    /\(\) => import\("\.\.\/components\/far-from-saga\/far-from-entry-sequence"\)/,
  );
  assert.match(gateModule, /import\("\.\/far-from-entry-warmup\.ts"\)/);
  assert.doesNotMatch(
    gateModule,
    /^import (?!type ).*far-from-entry-(sequence|engine|warmup|suit|calls|kits|swarm)/m,
  );
  assert.doesNotMatch(read("src/lib/far-from-entry-timings.ts"), /^import /m);
  // The dive's cover is the call's; the last beat ends inside it.
  assert.match(gate, /"far-from": FAR_FROM_ENTRY_TIMINGS,/);
  assert.deepEqual(calls.FAR_FROM_ENTRY_TIMINGS, { cover: 3240, reveal: 480 });
  const last = calls.FAR_FROM_ENTRY_BEATS.at(-1);
  assert.ok(last.start + last.duration <= calls.FAR_FROM_ENTRY_TIMINGS.cover);
  assert.match(sequence, /"--rx-call-cover": `\$\{FAR_FROM_ENTRY_TIMINGS\.cover\}ms`/);
  // The same shape as Rexonance's branch (rexonance-lazy-loading,
  // rexonance-call-scene): prepared before the cover, the call yields a
  // frame before mounting, the decoded images get one bounded window.
  const branch = gate.slice(gate.indexOf('if (diveVariant === "far-from") {'));
  assert.match(
    branch,
    /farFromCall = await preparation\.promise;[\s\S]*?if \(!isCurrent\(\)\) return;[\s\S]*?setGate\(\{[\s\S]*?phase: "covering",[\s\S]*?farFromCall,\s*farFromSuit,/,
  );
  assert.match(
    branch,
    /phase: "revealing",\s*scene: landed,\s*rexonanceCall,\s*rexonanceSuit,\s*farFromCall,\s*farFromSuit,/,
  );
  assert.match(gate, /diveVariant === "far-from" && !farFromCall\s*\? CALM_TIMINGS/);
  assert.match(gate, /callOnly:\s*Boolean\(rexonanceCall\) \|\| Boolean\(farFromCall\)/);
  assert.match(
    branch,
    /if \(farFromCall && tier === "full"\) setSignal\("running"\);\s*await nextFrame\(\);\s*await nextFrame\(\);\s*if \(!isCurrent\(\)\) return;/,
  );
  assert.match(
    branch,
    /prepareRexonanceEntry\(\{\s*decoded: farFromWarm,[\s\S]*?deadlineMs: 1800,/,
  );
  assert.match(
    branch,
    /rexonanceCoverCancel\.current = entry\.cancel;\s*const ready = await entry\.promise;[\s\S]*?if \(!isCurrent\(\)\) return;\s*if \(ready\) farFromSuit = "build";/,
  );
  assert.ok(
    branch.indexOf("await entry.promise;") < branch.indexOf("startedAt = performance.now();"),
  );
  // The warm-up only on the full tier; pieces decoded while the scan still
  // runs switch the call to the build; the call runs from its first
  // painted frame.
  assert.match(
    gate,
    /diveVariant === "far-from" && tier === "full" \? warmFarFromEntry\("high"\) : null/,
  );
  assert.match(branch, /performance\.now\(\) - startedAt > FAR_FROM_ENTRY_LATE_MS/);
  assert.match(
    branch,
    /current\.active && current\.phase === "covering" && current\.farFromCall\s*\? \{ \.\.\.current, farFromSuit \}/,
  );
  assert.match(branch, /if \(diveVariant === "far-from"\) startedAt = performance\.now\(\);/);
  // The cover's hold is the shared one (a live preference ends it).
  assert.match(
    branch,
    /else if \(diveVariant === "far-from" && farFromCall\) \{[\s\S]*?const hold = waitForRexonanceCover\(coverTimeLeft\);/,
  );
  // Intent warms it; a hidden page cancels it; the settled gate releases it.
  assert.match(gate, /if \(to === "\/far-from-saga"\) prefetchFarFromEntry\(\);/);
  assert.match(
    gate,
    /rexonanceTransition\.current !== null \|\|\s*farFromTransition\.current !== null/,
  );
  assert.match(gate, /if \(farFromTransition\.current === null\) releaseFarFromEntry\(\);/);
  assert.equal((gate.match(/farFromTransition\.current = null;/g) ?? []).length, 3);
  // The renderer in the dive, with the gate's tier and suit.
  assert.match(
    gate,
    /<FarFromCallSequence\s*phase=\{phase\}\s*tier=\{scene\?\.tier \?\? "reduced"\}\s*suit=\{farFromSuit \?\? "whole"\}\s*\/>/,
  );
  assert.match(gate, /farFrom \? " is-far-from-calls" : ""/);
  assert.match(gate, /const farFrom = variant === "far-from" && Boolean\(FarFromCallSequence\);/);
  // Rexonance's own lines stay (its tests pin them).
  assert.match(gate, /const callOnly = Boolean\(rexonanceCall\);/);
  assert.match(gate, /rexonance: REXONANCE_ENTRY_TIMINGS,/);
  assert.match(gate, /if \(diveVariant === "rexonance"\) startedAt = performance\.now\(\);/);
});

test("the still tiers, the skip, and the page: reduced motion and economy rest the call on the figure, the button or Escape shortens the cover, and the page plays nothing of its own", () => {
  // Tiers: nothing heavy is fetched on a still tier, and the gate's tier
  // reaches the sequence, whose suit then stands whole without the engine.
  for (const condition of [
    /prefers-reduced-motion: reduce/,
    /forced-colors: active/,
    /worldEffects === "economy"/,
    /connection\?\.saveData/,
    /\["slow-2g", "2g"\]/,
  ])
    assert.match(gateModule, condition);
  assert.match(gateModule, /if \(isFarFromEntryStill\(\)\) return Promise\.resolve\(false\);/);
  assert.match(sequence, /data-tier=\{tier\}/);
  assert.match(sequence, /<Suit suit=\{suit\} animate=\{tier === "full"\} \/>/);
  assert.match(sequence, /const shown = fallback \|\| !animate \? "whole" : suit;/);
  assert.match(
    sequence,
    /\{shown === "build" \? <FarFromEntryNanites onEngine=\{onEngine\} \/> : null\}/,
  );
  // (The call sheet's still rules show the whole figure: no rule of this
  // sheet hides it on a still tier.)
  assert.doesNotMatch(sheet, /data-tier="(calm|reduced)"/);
  // The skip: a real button while the full tier covers, and Escape; it
  // marks the cover spent before the hold and ends the hold during it.
  assert.match(
    gate,
    /<button\s*type="button"\s*className="ffe-skip"\s*onClick=\{onSkip\}\s*aria-label="変身演出をスキップ"\s*>\s*スキップ/,
  );
  assert.match(gate, /if \(event\.key === "Escape"\) onSkip\?\.\(\);/);
  assert.match(
    gate,
    /const farFromSkippable = farFrom && !revealing && scene\?\.tier === "full" && Boolean\(onSkip\);/,
  );
  assert.match(gate, /farFromSkip\.current = \(\) => \{\s*farFromSkipped = true;\s*\};/);
  assert.match(gate, /if \(!farFromSkipped\) \{/);
  assert.match(gate, /farFromSkip\.current = hold\.cancel;/);
  assert.match(gate, /const skipDecoration = useCallback\(\(\) => \{[\s\S]*?clock\.skip\(\);\s*farFromSkip\.current\?\.\(\);/);
  assert.match(sheet, /\.ffe-skip \{[\s\S]*?min-height: 44px;/);
  assert.match(sheet, /\.ffe-skip \{[\s\S]*?pointer-events: auto;/);
  // The gate's ground and status give way to the sequence, as Rexonance's.
  assert.match(
    sheet,
    /html body \.load-gate\.is-far-from-dive\.is-far-from-calls \{\s*background: transparent !important;/,
  );
  assert.match(
    sheet,
    /html body \.load-gate\.is-far-from-dive\.is-far-from-calls > \.rider-dive-status \{/,
  );
  // Global, as the call sheet is: the departure page carries the first beat.
  assert.match(root, /import farFromEntryCss from "\.\.\/styles-far-from-entry\.css\?url";/);
  assert.match(root, /href: farFromEntryCss/);
  assert.doesNotMatch(read("src/styles-far-from-saga.css"), /styles-far-from-entry\.css/);
  // The page: its seam renders nothing (a direct load shows the page at
  // once, as /rexonance-saga does); no overlay, no second play, no import.
  assert.match(page, /<FarFromEntryTransition stage=\{stage\} \/>/);
  assert.match(transition, /return null;/);
  assert.doesNotMatch(transition, /^import /m);
  assert.doesNotMatch(transition, /sessionStorage|setTimeout|useEffect/);
  assert.doesNotMatch(sheet, /ffe-overlay|ffe-cover|ffe-still/);
});

test("the sequence's chunk loads once on demand, a failure can be retried, and a deadline or cancellation never revives a late import", async (t) => {
  let imports = 0;
  const renderer = () => null;
  const prepare = createFarFromTransitionLoader(async () => {
    imports++;
    return { FarFromEntrySequence: renderer };
  });
  assert.equal(imports, 0);
  const first = prepare();
  const second = prepare();
  assert.deepEqual(await Promise.all([first.promise, second.promise]), [renderer, renderer]);
  assert.equal(await prepare().promise, renderer);
  assert.equal(imports, 1);
  for (const failure of ["throw", "reject"]) {
    let tries = 0;
    const retrying = createFarFromTransitionLoader(() => {
      tries++;
      if (tries === 1) {
        if (failure === "throw") throw new Error("offline");
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve({ FarFromEntrySequence: renderer });
    });
    assert.equal(await retrying().promise, null);
    assert.equal(await retrying().promise, renderer);
    assert.equal(tries, 2);
  }
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const reason of ["deadline", "cancel"]) {
    let release;
    const late = createFarFromTransitionLoader(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const request = late(50);
    await Promise.resolve();
    if (reason === "cancel") request.cancel();
    else t.mock.timers.tick(50);
    assert.equal(await request.promise, null);
    release({ FarFromEntrySequence: renderer });
    assert.equal(await request.promise, null);
    assert.equal(await late().promise, renderer);
  }
});

test("the delivered suit data is current: 36 plates partition the figure, the files weigh what the module says, and the registration contract holds", async () => {
  assert.equal(suit.FAR_FROM_ENTRY_PIECES.length, 36);
  assert.deepEqual(suit.FAR_FROM_ENTRY_SIZE, { width: 693, height: 1040 });
  const ids = new Set(suit.FAR_FROM_ENTRY_PIECES.map((piece) => piece.id));
  assert.equal(ids.size, 36);
  for (const piece of suit.FAR_FROM_ENTRY_PIECES) {
    assert.ok(
      piece.x >= 0 && piece.y >= 0 && piece.x + piece.w <= 693 && piece.y + piece.h <= 1040,
      piece.id,
    );
    assert.ok(
      piece.ax + piece.w <= suit.FAR_FROM_ENTRY_ATLAS.width &&
        piece.ay + piece.h <= suit.FAR_FROM_ENTRY_ATLAS.height,
      piece.id,
    );
    assert.ok(piece.tiles.length > 0);
  }
  for (const [name, src] of [
    ["figure", suit.FAR_FROM_ENTRY_FIGURE],
    ["plates", suit.FAR_FROM_ENTRY_ATLAS.src],
    ["lights", suit.FAR_FROM_ENTRY_LIGHTS],
  ]) {
    const file = new URL(`../public${src}`, import.meta.url);
    assert.equal(statSync(file).size, suit.FAR_FROM_ENTRY_BYTES[name], name);
    const meta = await sharp(readFileSync(file)).metadata();
    assert.equal(meta.hasAlpha, true, name);
    if (name === "plates") {
      assert.equal(meta.width, suit.FAR_FROM_ENTRY_ATLAS.width);
      assert.equal(meta.height, suit.FAR_FROM_ENTRY_ATLAS.height);
    } else {
      assert.equal(meta.width, 693);
      assert.equal(meta.height, 1040);
    }
  }
  assert.ok(suit.FAR_FROM_ENTRY_BYTES.total < 800_000, "the entry's own images stay under 800 KB");
  // The eyes' chevron and the reactor's crystal sit on the visor and the chest.
  const inside = (polygon, [px, py]) => {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (yi > py !== yj > py && ((xj - xi) * (py - yi)) / (yj - yi) + xi - px > 0) hit = !hit;
    }
    return hit;
  };
  // The left eye's streak (the visor mark is where the streaks meet).
  // Owner (2026-10-23): the eyes' outline traced again over the cutout's streaks.
  assert.ok(
    inside(suit.FAR_FROM_ENTRY_EYES_GLOW, [
      suit.FAR_FROM_ENTRY_MARKS.visor[0] - 30,
      suit.FAR_FROM_ENTRY_MARKS.visor[1] - 12,
    ]),
  );
  assert.ok(inside(suit.FAR_FROM_ENTRY_REACTOR_GLOW, suit.FAR_FROM_ENTRY_MARKS.core));
  const visor = suit.FAR_FROM_ENTRY_PIECES.find((piece) => piece.id === "helmet-visor");
  assert.ok(
    suit.FAR_FROM_ENTRY_MARKS.visor[1] > visor.y &&
      suit.FAR_FROM_ENTRY_MARKS.visor[1] < visor.y + visor.h,
  );
  const chest = suit.FAR_FROM_ENTRY_PIECES.find((piece) => piece.id === "chest");
  assert.ok(
    suit.FAR_FROM_ENTRY_MARKS.core[1] > chest.y &&
      suit.FAR_FROM_ENTRY_MARKS.core[1] < chest.y + chest.h,
  );
  assert.match(read("scripts/build-far-from-entry.mjs"), /--check/);
});
