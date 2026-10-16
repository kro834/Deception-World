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

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const extrasSource = read("src/components/rexonance-saga/rexonance-suit-extras.ts");
const planSource = read("src/components/rexonance-saga/rexonance-suit-plan.ts");
const nanites = read("src/components/rexonance-saga/rexonance-suit-nanites.tsx");
const component = read("src/components/rexonance-saga/rexonance-call-sequence.tsx");
const warmup = read("src/lib/rexonance-suit-warmup.ts");
const kitWarmup = read("src/lib/rexonance-nanites-warmup.ts");
const sheet = read("src/styles-rexonance-calls.css");
const transpile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

test("the swarm rides the pinned call: its timeline, and the pinned clocks unchanged", () => {
  const swarm = calls.REXONANCE_SUIT_SWARM;
  // RIDER！: six pump waves of chips spiral out of the core.
  assert.deepEqual([...swarm.waves], [330, 380, 430, 480, 530, 580]);
  assert.equal(swarm.wave, 160);
  // Each plate's latch from F − 360; the lattice F − 270 → F − 60; clamps
  // slide in over [F − 120, F − 40] and bite F ± 10; the seat [F − 40, F]
  // and its ring-out F → F + 40.
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
  assert.equal(swarm.overshoot, calls.REXONANCE_SUIT_CLANK_MS);
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
  // The owner's pinned clocks are untouched.
  assert.equal(calls.REXONANCE_ENTRY_TIMINGS.cover, 2730);
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

test("the call decides once, bleeds only on fine pointers, and keeps the classic call", () => {
  // Decided at the engine's start; the classic tile path stays the fallback.
  assert.match(nanites, /const rich = isRexonanceNaniteReady\(\);/);
  assert.match(nanites, /if \(rich && !coarse\) box\.dataset\.bleed = "";/);
  assert.match(nanites, /const extras = rich\s*\?\s*createSuitExtras\(/);
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
  // The settled canvas stays on the figure's box at the figure's scale, so
  // the finished suit (frame 2730) is drawn exactly as before; only the
  // flight canvas bleeds (CSS), its figure origin on whole device pixels.
  assert.match(nanites, /settledCanvas\.width = Math\.round\(box\.clientWidth \* scale\);/);
  assert.match(nanites, /const width = Math\.round\(flightCanvas\.offsetWidth \* scale\);/);
  assert.match(nanites, /const s = settledCanvas\.width \/ FIG\.width;/);
  assert.match(nanites, /const ox = Math\.round\(/);
  assert.doesNotMatch(nanites, /settled\.setTransform/);
  // Its swarm replaces the SVG motes only when it runs; the motes' own
  // clock is unchanged, and the bleed never reaches below the figure nor
  // more than 4 % to its left.
  assert.match(
    component,
    /const onNanites = useCallback\(\(rich\?: boolean\) => \{\s*setNanites\("canvas"\);\s*setSwarm\(rich \? "canvas" : "svg"\);/,
  );
  // …and the motes return once the swarm is over (frame 2730 is HEAD's).
  assert.match(
    nanites,
    /if \(!extras\) void warmRexonanceNanites\(\);\s*else ready\.current\(false\);/,
  );
  assert.match(component, /data-swarm=\{swarm\}/);
  assert.match(
    sheet,
    /\.rx-call-sequence \.rx-suit-build > \.rx-suit-nanites\[data-bleed\] > canvas:last-child \{\s*inset: auto;\s*top: -2%;\s*left: -4%;\s*width: 114%;\s*height: 102%;\s*\}/,
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
  assert.doesNotMatch(
    draw,
    /\bnew |\.map\(|\.filter\(|\.slice\(|\.concat\(|\[\]|Array\.from|\.push\(|`/,
  );
  // The plan stays free of the kit (its runtime test pins its modules).
  assert.doesNotMatch(planSource, /rexonance-nanites|rexonance-suit-extras/);
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
  assert.match(
    warmup,
    /return plan\.prepareRexonanceSuit\(\);\s*\},\s*\(\) => undefined,\s*\)\.then\(\(prepared\) => \{[^]*?import\("\.\/rexonance-nanites-warmup\.ts"\)/,
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
  const log = { draws: 0, sources: new Map(), transforms: 0, last: null, saves: 0 };
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
    "arc",
    "ellipse",
    "closePath",
    "fillRect",
    "clearRect",
    "putImageData",
  ])
    context[name] = (...args) => {
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
  const job = (result) => ({ step: () => true, commit: () => result, cancel() {} });
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
  runInNewContext(transpile(extrasSource), {
    ...globals,
    exports: extras,
    require(name) {
      if (name === "@/lib/rexonance-calls") return calls;
      if (name === "@/lib/rexonance-suit") return suit;
      if (name === "@/lib/rexonance-nanites") return kit;
      if (name === "@/lib/rexonance-unlit.js")
        return {
          createNaniteMetalJob: (s, x, y, w, h, d, o) =>
            job({
              metal: canvas("metal"),
              ...(o?.silhouette ? { silhouette: canvas("silhouette") } : {}),
            }),
          createNaniteGuideJob: (g, d, o) =>
            job({ holo: canvas("holo"), ...(o?.walls ? { walls: canvas("walls") } : {}) }),
          createNaniteMoltenJob: () => job({ molten: canvas("molten") }),
        };
      if (name === "@/lib/rexonance-nanites-warmup")
        return { rexonanceNaniteSource: (url) => sources.get(url) ?? null };
      if (name === "@/lib/rexonance-suit-warmup")
        return { rexonanceSuitSource: (url) => suitSources.get(url) ?? null };
      if (name === "./rexonance-suit-plan")
        return { ...plan, prepareRexonanceSuit: () => Promise.resolve(true) };
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
    assert.equal(log.saves, 0, `${t}: every save is restored`);
    assert.deepEqual(log.last, [1, 0, 0, 1, 34, 31], `${t}: the frame ends on the base transform`);
    // Hero sprites: chips, latches, rings and sparks from the kit's sheets;
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
  for (const t of [400, 600, 800, 1000, 1300, 1700, 2000])
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

test("the layout: every chip has a ring, the cocoon drains bottom-up, every tile a pose", async () => {
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
  // 512 cocoon chips and 160 free chips on eight rings; each cocoon chip
  // drains into its plate after it is born, on the ring nearest its seat.
  const chips = L.ring.length;
  assert.equal(chips, 672);
  let free = 0;
  let legs = 0;
  let legRings = 0;
  let helm = 0;
  for (let c = 0; c < chips; c += 1) {
    assert.ok(L.ring[c] >= 0 && L.ring[c] < 8);
    assert.ok(
      calls.REXONANCE_SUIT_SWARM.waves.some((wave) => L.birth[c] >= wave && L.birth[c] < wave + 80),
    );
    const p = L.chipPlate[c];
    if (p < 0) {
      free += 1;
      assert.equal(L.drainAt[c], Infinity);
      continue;
    }
    assert.ok(
      L.drainAt[c] >= L.birth[c] + calls.REXONANCE_SUIT_SWARM.wave - 0.01,
      "drains after its birth",
    );
    if (all[p].piece.group === "legs") {
      legs += 1;
      legRings += L.ring[c];
      assert.ok(L.ring[c] >= 3, "leg chips ride the lower rings");
      assert.ok(L.drainAt[c] < 900, "and drain first");
    }
    if (all[p].piece.group === "helm") {
      helm += 1;
      assert.equal(L.ring[c], 0, "the helmet's chips ride the top ring, then the crown");
      assert.ok(L.drainAt[c] >= calls.REXONANCE_SUIT_SWARM.crown[1]);
    }
  }
  assert.equal(free, 160);
  assert.ok(legRings / legs >= 5, `leg chips' mean ring ${legRings / legs}`);
  assert.ok(legs > 60 && helm > 20, `${legs} leg chips, ${helm} helmet chips`);
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
    assert.ok(L.buildB[p] <= F - build.done + 0.01, `${id} whole ${F - L.buildB[p]} before F`);
    assert.ok(
      L.buildB[p] <= Math.min(...plate.tiles.map((tile) => tile.land)),
      `${id} before its tiles`,
    );
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
