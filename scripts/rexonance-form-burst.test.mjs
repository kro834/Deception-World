// Rexonance's form burst (owner, 2026-11-12): MAX is burned by green fire and
// explodes apart; ULTRA explodes apart and takes in a mass of nanomachines as
// it does (src/lib/rexonance-form-burst.ts, its stage and its loader; the 03
// panel's layer and the scroll scene's). The beats and their order, a cut at
// any moment, the calm tiers, the chunk fetched on demand by Rexonance's
// pages only, and particles that are sprites and nothing else: no trail.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ASSEMBLY_BEATS } from "../src/lib/rexonance-resonance.js";
import { skinBudget } from "../src/lib/rexonance-suit-skin.ts";
import {
  FORM_BURST_BEATS,
  FORM_BURST_CELL_FLIGHT,
  FORM_BURST_FLASH,
  FORM_BURST_MS,
  FORM_BURST_QUALITY,
  FORM_BURST_SHARE,
  FORM_BURST_SHEET,
  FORM_BURST_WHOLE,
  FormBurstGovernor,
  FormBurstParticles,
  bakeFormBurstField,
  buildFormBurstSheet,
  capsuleCover,
  createFormBurstFrame,
  formBurstBudget,
  formBurstBuilt,
  formBurstFrame,
  formBurstLit,
} from "../src/lib/rexonance-form-burst.ts";
import {
  FORM_BURST_FADE_MS,
  createFormBurstLoader,
  formBurstKind,
} from "../src/lib/rexonance-form-burst-loader.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, "utf8");
const at = (kind, ms) => ({ ...formBurstFrame(createFormBurstFrame(), kind, ms) });

const desktop = { matchMedia: () => ({ matches: false }) };
const media = (matches) => ({ matchMedia: (query) => ({ matches: matches.some((m) => query.includes(m)) }) });
const phone = { ...media(["coarse"]), navigator: { deviceMemory: 8, hardwareConcurrency: 6 }, innerWidth: 390, innerHeight: 844 };
const tablet = { ...media(["coarse"]), navigator: { hardwareConcurrency: 8 }, innerWidth: 820, innerHeight: 1180 };
const low = { ...media(["coarse"]), navigator: { deviceMemory: 4, hardwareConcurrency: 4 }, innerWidth: 390, innerHeight: 844 };

// A body: a trunk, two arms and two legs in a 571 x 1040 frame.
const ASPECT = 571 / 1040;
const ORIGIN = [0.498, 0.265];
const body = () => {
  const w = 57;
  const h = 104;
  const cover = capsuleCover(w, h, [
    [0.5, 0.08, 0.5, 0.5, 0.16],
    [0.25, 0.25, 0.15, 0.55, 0.07],
    [0.75, 0.25, 0.85, 0.55, 0.07],
    [0.4, 0.5, 0.36, 0.95, 0.1],
    [0.6, 0.5, 0.64, 0.95, 0.1],
  ]);
  return bakeFormBurstField(cover, w, h, w);
};
const reachOf = (points) => {
  let reach = 0;
  for (let n = 0; n < points.length; n += 2)
    reach = Math.max(reach, Math.hypot((points[n] - ORIGIN[0]) * ASPECT, points[n + 1] - ORIGIN[1]));
  return reach;
};
const VIEW = { x: 200, y: 100, w: 571, h: 1040, px: 1, origin: ORIGIN };
const CELLS = { plate: 128, plates: 4, speckY: 192, speck: 24, tones: 3, turns: 8 };
/** A context that is nothing but the four members a particle may use: any
 * other call or property (a path, a stroke, a gradient, a shadow) throws. */
const spriteContext = () => {
  const calls = [];
  const state = { globalAlpha: 1, globalCompositeOperation: "source-over" };
  const context = new Proxy(state, {
    get(target, key) {
      if (key === "setTransform") return (...m) => calls.push(["t", ...m]);
      if (key === "drawImage") return (...a) => calls.push(["d", target.globalAlpha, ...a.slice(1)]);
      if (key in target) return target[key];
      throw new Error(`a particle used context.${String(key)}`);
    },
    set(target, key, value) {
      if (!(key in target)) throw new Error(`a particle set context.${String(key)}`);
      target[key] = value;
      return true;
    },
  });
  return { context, calls };
};
const cast = (environment = desktop) => {
  const field = body();
  return new FormBurstParticles(formBurstBudget(environment), field.points, ASPECT, ORIGIN, reachOf(field.points));
};
/** Every call of a frame (each sprite's transform and its draw, then the
 * transform handed back); `drawn`: the sprites alone. */
const frameCalls = (particles, kind, ms, share = 1) => {
  const { context, calls } = spriteContext();
  particles.draw(context, kind, ms, 1000, VIEW, {}, {}, CELLS, share);
  return calls;
};
const drawn = (...frame) => frameCalls(...frame).filter((call) => call[0] === "d");

test("the forms it plays between: MAX, ULTRA straight from whichever is on screen, and back", () => {
  assert.equal(formBurstKind("standard", "max"), "max");
  assert.equal(formBurstKind("ultra", "max"), "max");
  // (No run through MAX on the way: ULTRA is its own change.)
  assert.equal(formBurstKind("standard", "ultra"), "ultra");
  assert.equal(formBurstKind("max", "ultra"), "ultra");
  assert.equal(formBurstKind("max", "standard"), "release");
  assert.equal(formBurstKind("ultra", "standard"), "release");
  assert.equal(formBurstKind("max", "max"), null);
  // EXCELSIOR keeps the scene's own overwrite.
  assert.equal(formBurstKind("ultra", "excelsior"), null);
  assert.equal(formBurstKind("excelsior", "max"), null);
  assert.deepEqual(FORM_BURST_MS, {
    max: FORM_BURST_BEATS.max.end,
    ultra: FORM_BURST_BEATS.ultra.end,
    release: FORM_BURST_BEATS.release.end,
  });
  assert.ok(FORM_BURST_MS.max >= 3000 && FORM_BURST_MS.max <= 4000);
  assert.ok(FORM_BURST_MS.ultra >= 3000 && FORM_BURST_MS.ultra <= 4200);
  assert.ok(FORM_BURST_MS.release <= 1300, "the way back is short");
});

test("MAX: the fire kindles at the reactor, engulfs, chars, and only then the armour explodes apart", () => {
  const B = FORM_BURST_BEATS.max;
  assert.equal(at("max", 0).cover, 0);
  assert.equal(at("max", 0).fire, 0);
  // Kindled at the reactor before it runs: a small front, already burning.
  const kindled = at("max", B.ignite[1]);
  assert.ok(kindled.cover > 0 && kindled.cover < 0.3 && kindled.fire > 0.5);
  // The front only grows, and has passed the whole figure before the blast.
  let last = -1;
  for (let ms = 0; ms < B.burst; ms += 10) {
    const f = at("max", ms);
    assert.ok(f.cover >= last, `the front falls back at ${ms}`);
    last = f.cover;
    assert.equal(f.shatter, 0, "nothing breaks before the burst");
    assert.equal(f.flash, 0);
    assert.equal(f.front, 0, "MAX is not there before the burst");
    assert.equal(f.blastGain, 0);
    assert.equal(f.swapped, false);
  }
  assert.equal(at("max", B.engulf[1]).cover, FORM_BURST_WHOLE);
  assert.ok(formBurstLit(0.1) < formBurstLit(0.5) && formBurstLit(0.5) < formBurstLit(1));
  assert.ok(formBurstLit(1) < B.engulf[1], "the whole body is alight before the front's rags are");
  // Engulfed whole, the armour chars; charred, it goes white; then it goes.
  assert.ok(B.char[0] > B.ignite[1] && B.char[1] > B.engulf[1] && B.char[1] <= B.swell[1]);
  assert.ok(B.engulf[1] + 200 <= B.swell[0], "it burns whole for a moment before the heat");
  assert.equal(at("max", B.char[1]).char, 1);
  assert.equal(at("max", B.swell[0]).swell, 0);
  assert.equal(at("max", B.swell[1]).swell, 1);
  assert.equal(B.swell[1], B.burst);
  // The burst: the flash, the armour gone in a quarter second, the fire
  // torn off the body, the blast out and spent.
  assert.ok(at("max", B.burst + 60).flash > 0.9 * FORM_BURST_FLASH);
  assert.equal(at("max", B.burst + 240).shatter, 1);
  assert.equal(at("max", B.burst + 200).fire, 0, "no fire stays on the body after the blast");
  assert.ok(at("max", B.burst + 10).blastGain > 0.9);
  assert.equal(at("max", B.blast[1]).blastGain, 0);
  // MAX from the blast's middle out, hot; then it cools, lights, glints.
  assert.ok(B.reveal[0] > B.burst && B.reveal[1] < B.blast[1], "revealed while the fire clears");
  assert.equal(at("max", B.reveal[1]).front, FORM_BURST_WHOLE);
  assert.equal(at("max", B.reveal[0]).cool, 1);
  assert.equal(at("max", B.cool[1]).cool, 0);
  assert.equal(at("max", B.emit[0] - 1).emit, -1, "the emitters are held until they are lit");
  assert.ok(at("max", B.emit[1]).emit > FORM_BURST_WHOLE);
  assert.ok(B.emit[0] >= B.cool[1] - 200 && B.glint[0] >= B.emit[1] - 100);
  assert.equal(at("max", B.glint[0]).glint, -1);
  assert.ok(at("max", (B.glint[0] + B.glint[1]) / 2).glint > 0);
  assert.equal(at("max", B.glint[1]).glint, -1);
  // The end: the new form's art exactly, and nothing else.
  const end = at("max", B.end);
  assert.equal(end.done, true);
  assert.equal(end.settle, 1);
  assert.equal(end.swapped, true);
  for (const key of ["fire", "flash", "blastGain", "cool"]) assert.equal(end[key], 0, key);
  assert.equal(at("max", B.end - 300).done, false);
});

test("ULTRA: it explodes apart and the cells are already coming in; the front takes them in; then it lights whole", () => {
  const B = FORM_BURST_BEATS.ultra;
  const particles = cast();
  // No fire in this one.
  for (let ms = 0; ms <= B.end; ms += 50) {
    const f = at("ultra", ms);
    assert.equal(f.fire, 0);
    assert.equal(f.cover, 0);
    assert.equal(f.blastGain, 0);
  }
  assert.equal(at("ultra", B.burst).shatter, 0);
  assert.equal(at("ultra", B.shatter[1]).shatter, 1);
  // The same moment: as the armour goes, shards leave and cells are in the air.
  const moment = drawn(particles, "ultra", B.burst + 60);
  const shards = moment.filter((call) => call[4] === 128 && call[3] === 0);
  const specks = moment.filter((call) => call[4] === 24);
  assert.ok(shards.length > 20, "shards at the burst");
  assert.ok(specks.length > 60, "cells already inbound at the burst");
  // Its opening burst is dim (the page's card has only just flashed); the
  // completion's is the play's one full flash.
  let opening = 0;
  for (let ms = 0; ms < B.close; ms += 5) opening = Math.max(opening, at("ultra", ms).flash);
  assert.ok(opening > 0 && opening <= 0.2 * FORM_BURST_FLASH + 1e-9);
  assert.ok(at("ultra", B.flash[0] + 60).flash > 0.95 * FORM_BURST_FLASH);
  // The front runs out from the reactor and never back.
  let last = -1;
  for (let ms = 0; ms <= B.end; ms += 10) {
    const f = at("ultra", ms);
    assert.ok(f.front >= last);
    last = f.front;
  }
  assert.equal(at("ultra", B.build[0]).front, 0);
  assert.equal(at("ultra", B.build[1]).front, FORM_BURST_WHOLE);
  assert.ok(B.build[0] < B.shatter[1], "it builds while the last of the old armour is still going");
  assert.ok(formBurstBuilt(0.2) < formBurstBuilt(0.6) && formBurstBuilt(1) < B.build[1]);
  // The emitters stand dim through the build and light at once.
  assert.equal(at("ultra", B.close - 1).emit, -1);
  assert.ok(at("ultra", B.close).emit > FORM_BURST_WHOLE);
  assert.ok(at("ultra", B.close + 60).bloom > 0.9);
  assert.ok(at("ultra", B.close + 60).aura > 0.9);
  assert.equal(at("ultra", B.aura[1]).aura, 0);
  assert.ok(B.close >= B.build[1], "the completion follows the last of the build");
  const end = at("ultra", B.end);
  assert.equal(end.done && end.settle === 1 && end.swapped, true);
  for (const key of ["flash", "bloom", "aura", "swell"]) assert.equal(end[key], 0, key);
});

test("ULTRA's cells: several times the suit-up's, each landing as the front arrives, none after the completion", () => {
  const B = FORM_BURST_BEATS.ultra;
  for (const environment of [desktop, tablet, phone, low]) {
    const budget = formBurstBudget(environment);
    const suit = skinBudget(environment);
    assert.ok(budget.fine >= 2.5 * suit.fine, "specks");
    assert.ok(budget.large >= 2.5 * suit.large, "plates");
  }
  const particles = cast();
  const cells = particles.cells;
  const count = cells.length / 10;
  const far0 = reachOf(body().points);
  assert.equal(count, formBurstBudget(desktop).large + formBurstBudget(desktop).fine);
  let around = [0, 0, 0, 0];
  for (let n = 0; n < count; n += 1) {
    const [u, v, ox, oy, lands, flight, , , , absorb] = cells.subarray(n * 10, n * 10 + 10);
    const reach = Math.hypot((u - ORIGIN[0]) * ASPECT, v - ORIGIN[1]) / far0;
    // It lands a moment before the front is there, and is gone at once.
    assert.ok(Math.abs(formBurstBuilt(reach) - FORM_BURST_CELL_FLIGHT.lead - lands) < 1e-3);
    assert.ok(lands - flight >= -1e-6, "none is in the air before the play");
    assert.ok(lands + absorb < B.close, "all are in before the completion");
    around[(ox > 0 ? 1 : 0) + (oy > 0 ? 2 : 0)] += 1;
    assert.ok(Math.hypot(ox, oy) >= 0.25, "it comes from away");
  }
  // From all around, not from one side.
  for (const quarter of around) assert.ok(quarter > count / 6);
  assert.equal(drawn(particles, "ultra", B.close).length, 0, "nothing of them outlives the light");
  assert.equal(drawn(particles, "ultra", B.end).length, 0);
  // Most come from beyond the frame.
  let far = 0;
  for (let n = 0; n < count; n += 1) if (Math.hypot(cells[n * 10 + 2], cells[n * 10 + 3]) > 0.7) far += 1;
  assert.ok(far > count * 0.6);
});

test("a play is a closed form of its clock: any moment, in any order, and a cut leaves nothing", () => {
  const frame = createFormBurstFrame();
  for (const kind of ["max", "ultra", "release"]) {
    const forward = [];
    for (let ms = -100; ms <= FORM_BURST_MS[kind] + 200; ms += 137) forward.push([ms, at(kind, ms)]);
    // The same frame object reused out of order gives the same frames.
    for (const [ms, expected] of [...forward].reverse())
      assert.deepEqual({ ...formBurstFrame(frame, kind, ms) }, expected, `${kind} at ${ms}`);
    assert.deepEqual(at(kind, -500), at(kind, 0), "before it starts it is its first frame");
    assert.equal(at(kind, FORM_BURST_MS[kind] + 5000).done, true);
  }
  // The particles keep no state between frames: a frame is its ms alone.
  const particles = cast();
  for (const kind of ["max", "ultra", "release"]) {
    const moment = kind === "release" ? 500 : 1900;
    const a = frameCalls(particles, kind, moment);
    assert.ok(a.length > 3, kind);
    frameCalls(particles, kind, 300);
    frameCalls(particles, kind === "max" ? "ultra" : "max", 2000);
    assert.deepEqual(frameCalls(particles, kind, moment), a, kind);
  }
  // A play that has only begun has nothing in the air; one that is over, nothing left.
  for (const kind of ["max", "ultra", "release"]) {
    assert.equal(drawn(particles, kind, 0).length, 0);
    assert.equal(drawn(particles, kind, FORM_BURST_MS[kind]).length, 0, `${kind} leaves particles`);
    assert.equal(particles.live, 0);
  }
  // The stage: a cut removes the layer, empties its canvas and frees the
  // renderer; the first frame is drawn before anything under it is hidden.
  const stage = read("src/lib/rexonance-form-burst-stage.ts");
  assert.match(
    stage,
    /cancel\(\) \{\s*if \(ended\) return;\s*ended = true;\s*cancelAnimationFrame\(raf\);[\s\S]*?layer\.remove\(\);\s*air\.width = air\.height = 0;\s*giveRenderer\(renderer\);/,
  );
  assert.match(stage, /if \(draw\(performance\.now\(\)\)\) \{\s*shown = true;\s*options\.onShown\?\.\(\);/);
  assert.match(stage, /getExtension\("WEBGL_lose_context"\)\?\.loseContext\(\)/);
  // Paused while the tab is hidden or the layer is out of view: the clock stands.
  assert.match(stage, /if \(document\.hidden \|\| !visible\) \{[\s\S]*?last = 0;\s*away \|\|= now;\s*return;/);
  // Left out of view for long, it is not resumed: the new form simply stands.
  assert.match(stage, /if \(away && now - away > AWAY_MS && elapsed > 0\) \{\s*finish\(\);/);
  assert.match(stage, /new IntersectionObserver\(/);
});

test("a new pick mid-play hands on cleanly, in the panel and on the scene", () => {
  const panel = read("src/components/rexonance-saga/rexonance-form-burst.tsx");
  // The panel's figure is keyed by the form: the layer's effect is torn down
  // whole, and the next starts from the form last on screen.
  const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
  assert.match(page, /<figure key=\{stage\}>/);
  assert.match(
    page,
    /morphFrom\.current === stage \? null : formBurstPlays\(morphFrom\.current, stage\) \? \(\s*<RexonanceFormBurst[\s\S]*?\) : \(\s*<FormMorph/,
  );
  assert.match(
    panel,
    /return \(\) => \{\s*cancelled = true;\s*play\?\.cancel\(\);\s*play = null;[\s\S]*?restore\(\);\s*img\.style\.visibility = target\.visibility;\s*delete figure\.dataset\.rxfBurst;/,
  );
  assert.match(panel, /const origin = held && held in pictures \? held : from;/);
  assert.match(panel, /onSwap: settle,/);
  // The scene: another form mid-play ends this one where it is; scrolled
  // back, or the scene stopped, it ends too; nothing is left held hidden.
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  assert.match(
    surge,
    /if \(burst && burst\.to !== form\) \{[\s\S]*?formOn = burst\.play\.swapped \? burst\.to : burst\.from;\s*endBurst\(\);/,
  );
  assert.match(surge, /if \(q < FORM_STRETCH\[0\]\) \{[\s\S]*?endBurst\(\);\s*formOn = "standard";/);
  assert.match(surge, /endBurst\(\);\s*formOn = "";\s*\/\/ \(A leave cut short[^\n]*\n\s*endLeave\(true\);/);
  assert.match(surge, /const endBurst = \(\) => \{\s*if \(!burst\) return;\s*burst\.play\.cancel\(\);\s*burst = null;\s*redraw = true;/);
  assert.match(surge, /showClassic\(bursting \? 0 : growing\.classic\)/);
  assert.match(surge, /else if \(bursting\) showClassic\(0\);\s*else showClassic\(1\);/);
  // The scene's stretch is the engine's own, which is not touched.
  const [, from, to] = surge.match(/const FORM_STRETCH = \[([\d.]+), ([\d.]+)\] as const;/);
  assert.deepEqual([Number(from), Number(to)], ASSEMBLY_BEATS.form);
});

test("reduced motion and economy: no play, a short cross-fade", () => {
  assert.equal(formBurstBudget(media(["reduce"])), null);
  assert.ok(FORM_BURST_FADE_MS >= 150 && FORM_BURST_FADE_MS <= 300);
  const loader = read("src/lib/rexonance-form-burst-loader.ts");
  assert.match(
    loader,
    /formBurstCalm = \(\) =>\s*Boolean\(globalThis\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches\) \|\|\s*globalThis\.document\?\.documentElement\.dataset\.worldEffects === "economy"/,
  );
  const stage = read("src/lib/rexonance-form-burst-stage.ts");
  assert.match(stage, /const budget = formBurstBudget\(\);[\s\S]*?if \(!budget \|\| [^)]*\) return null;/);
  const panel = read("src/components/rexonance-saga/rexonance-form-burst.tsx");
  assert.match(panel, /const stage = formBurstCalm\(\) \? null : formBurst\.stage;\s*if \(!stage\) \{/);
  assert.match(
    panel,
    /over\.animate\(\[\{ opacity: 1 \}, \{ opacity: 0 \}\], \{\s*duration: FORM_BURST_FADE_MS,/,
  );
  // The chunk is not even asked for.
  assert.match(panel, /if \(!mounted \|\| !element \|\| formBurstCalm\(\)/);
  // The scene is never live in those tiers: its layer does not run.
  assert.match(
    read("src/components/rexonance-saga/rexonance-suit-surge.tsx"),
    /runway\.dataset\.rznState === "live" && !document\.hidden && visible && !reducedMotion\(\)/,
  );
  assert.match(read("src/styles-rexonance-zenith.css"), /forced-colors: active[\s\S]*?:is\(\.rxf-burst, \.rxf-fade\) \{\s*display: none;/);
});

test("the play's chunk is fetched on demand, by Rexonance's own pages only", async () => {
  // Nothing imports the stage or the play statically: only the loader, lazily.
  const sources = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = `${directory}/${name}`;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|jsx?|css)$/.test(name)) sources.push(path);
    }
  };
  walk(`${root}src`);
  const mentions = sources
    .filter((path) => /rexonance-form-burst|rxf-burst|formBurst/.test(readFileSync(path, "utf8")))
    .map((path) => path.slice(root.length))
    .sort();
  assert.deepEqual(mentions, [
    "src/components/rexonance-saga/rexonance-form-burst.tsx",
    "src/components/rexonance-saga/rexonance-saga.tsx",
    "src/components/rexonance-saga/rexonance-suit-surge.tsx",
    "src/lib/rexonance-form-burst-loader.ts",
    "src/lib/rexonance-form-burst-stage.ts",
    "src/lib/rexonance-form-burst.ts",
    "src/lib/rexonance-suit-skin.ts",
    "src/styles-rexonance-zenith.css",
  ]);
  for (const path of mentions) {
    if (path === "src/lib/rexonance-form-burst-stage.ts") continue;
    const source = read(path);
    assert.doesNotMatch(source, /from ["'][^"']*rexonance-form-burst-stage["']/, path);
    assert.doesNotMatch(source, /from ["']@\/lib\/rexonance-form-burst["']/, path);
  }
  const loader = read("src/lib/rexonance-form-burst-loader.ts");
  assert.match(loader, /createFormBurstLoader\(\(\) => import\("\.\/rexonance-form-burst-stage"\)\)/);
  assert.equal([...loader.matchAll(/^import /gm)].length, 0, "the loader itself imports nothing");
  // Asked for only where a change may play: near the panel, or the scene
  // past its middle with a form to change to.
  assert.match(
    read("src/components/rexonance-saga/rexonance-form-burst.tsx"),
    /new IntersectionObserver\([\s\S]*?void formBurst\.load\(\)[\s\S]*?\{ rootMargin: "100% 0px" \}/,
  );
  assert.match(
    read("src/components/rexonance-saga/rexonance-suit-surge.tsx"),
    /if \(q > 0\.4 && \(form !== "standard" \|\| \(formOn && formOn !== form\)\)\)\s*askBurst\(/,
  );
  // The loader: one import shared, a failure may be retried.
  let imports = 0;
  const stage = { playFormBurst: () => null };
  const loaded = createFormBurstLoader(async () => {
    imports += 1;
    if (imports === 1) throw new Error("offline");
    return stage;
  });
  assert.equal(loaded.stage, null);
  assert.equal(imports, 0);
  assert.equal(await loaded.load(), null);
  assert.equal(loaded.stage, null);
  assert.deepEqual(await Promise.all([loaded.load(), loaded.load()]), [stage, stage]);
  assert.equal(loaded.stage, stage);
  assert.equal(imports, 2);
});

test("particles are sheet sprites and nothing else: no path, no stroke, no trail", () => {
  for (const environment of [desktop, phone, low]) {
    const particles = cast(environment);
    for (const kind of ["max", "ultra", "release"]) {
      let most = 0;
      for (let ms = 0; ms <= FORM_BURST_MS[kind] + 100; ms += 16) {
        // (The context throws on anything but setTransform and drawImage.)
        const calls = frameCalls(particles, kind, ms);
        const sprites = calls.filter((call) => call[0] === "d");
        most = Math.max(most, sprites.length);
        // Every sprite: a sheet cell to a unit square under its own transform.
        for (const call of sprites) {
          assert.equal(call.length, 10);
          assert.deepEqual(call.slice(6), [-0.5, -0.5, 1, 1]);
          assert.ok(call[1] >= 0 && call[1] <= 1, "alpha");
        }
        assert.equal(calls.filter((call) => call[0] === "t").length, sprites.length + 1);
        assert.deepEqual(calls.at(-1), ["t", 1, 0, 0, 1, 0, 0]);
      }
      assert.ok(most > 0, `${kind} draws`);
    }
  }
  // A sprite is where its clock puts it: one frame on, a shard has moved by
  // its own speed and left nothing where it was (the canvas is cleared whole).
  const stage = read("src/lib/rexonance-form-burst-stage.ts");
  assert.match(
    stage,
    /context\.setTransform\(1, 0, 0, 1, 0, 0\);\s*context\.clearRect\(0, 0, air\.width, air\.height\);[\s\S]{0,400}?particles\.draw\(/,
  );
  for (const path of ["src/lib/rexonance-form-burst.ts", "src/lib/rexonance-form-burst-stage.ts"]) {
    const source = read(path);
    for (const banned of [/\.stroke\(/, /strokeStyle/, /lineWidth/, /shadowBlur/, /\.arc\(/, /lineCap/])
      assert.doesNotMatch(source, banned, `${path} ${banned}`);
  }
  // The play's own sheet is filled, once; the cells' is the suit-up's.
  const filled = [];
  const gradient = { addColorStop() {} };
  const sheet = buildFormBurstSheet((width, height) => ({
    width,
    height,
    getContext: () =>
      new Proxy(
        { fillStyle: "" },
        {
          get(target, key) {
            if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
            if (["beginPath", "moveTo", "lineTo", "closePath", "fill", "fillRect"].includes(key))
              return () => filled.push(key);
            if (key in target) return target[key];
            throw new Error(`the sheet used context.${String(key)}`);
          },
          set: (target, key, value) => key === "fillStyle" && ((target[key] = value), true),
        },
      ),
  }));
  assert.equal(sheet.width, FORM_BURST_SHEET.width);
  assert.equal(filled.filter((key) => key === "fill").length, FORM_BURST_SHEET.shards * 2);
  assert.match(stage, /cellSheet \?\?= buildSkinCellSheet\(makeCanvas\);/);
});

test("the fire is this change's alone: it never lingers on a figure", () => {
  const B = FORM_BURST_BEATS.max;
  // Alight for under two seconds, and off the body 200 ms after the blast.
  assert.ok(B.burst - B.ignite[0] < 2000);
  for (let ms = B.burst + 200; ms <= B.end + 400; ms += 20) assert.equal(at("max", ms).fire, 0);
  for (let ms = B.blast[1]; ms <= B.end + 400; ms += 20) assert.equal(at("max", ms).blastGain, 0);
  // No ember is born after the blast has thrown its own, and none outlives the play.
  const particles = cast();
  const embers = particles.embers;
  for (let n = 0; n < embers.length / 8; n += 1) {
    assert.ok(embers[n * 8 + 3] <= B.burst + 80, "born by the blast");
    assert.ok(embers[n * 8 + 3] + embers[n * 8 + 4] < B.end, "burnt out before the end");
    // None before the fire is there.
    if (!embers[n * 8 + 2]) assert.ok(embers[n * 8 + 3] >= B.engulf[0]);
  }
  for (const kind of ["ultra", "release"])
    for (let ms = 0; ms <= FORM_BURST_MS[kind]; ms += 50) assert.equal(at(kind, ms).fire, 0);
  // It is not the suit-up's fire brought back: neither file touches the
  // call's flame or its ignition, and the suit-up's scenes are as they were.
  for (const path of ["src/lib/rexonance-form-burst.ts", "src/lib/rexonance-form-burst-stage.ts"])
    assert.doesNotMatch(read(path), /rexonance-flame|rexonance-ignition|fire-renderer|fire-shaders/);
  assert.match(read("src/lib/rexonance-form-burst-stage.ts"), /from "\.\/rexonance-fire\/fire-noise\.js"/);
});

test("the flashes are local and capped, and a second apart", () => {
  assert.ok(FORM_BURST_FLASH <= 0.6);
  for (const kind of ["max", "ultra", "release"])
    for (let ms = 0; ms <= FORM_BURST_MS[kind]; ms += 5)
      assert.ok(at(kind, ms).flash <= FORM_BURST_FLASH + 1e-9);
  // MAX's blast comes more than a second after the page's card; ULTRA's
  // completion more than two.
  assert.ok(FORM_BURST_BEATS.max.burst >= 1000);
  assert.ok(FORM_BURST_BEATS.ultra.close - FORM_BURST_BEATS.ultra.burst >= 1000);
  // The light falls off from the reactor (never a lit rectangle), and the
  // canvas's own edge never shows.
  const stage = read("src/lib/rexonance-form-burst-stage.ts");
  assert.equal([...stage.matchAll(/float flash = uBlast\.w \* exp\(-fn \* fn \* (?:9|11)\.0\) \* window;/g)].length, 2);
  assert.match(stage, /float window = mix\(smoothstep\(0\.0, 0\.07, margin\.x\) \* smoothstep\(0\.0, 0\.07, margin\.y\), 1\.0, opaque\);/);
});

test("the body's field: the body, the air about it, and the lift above it", () => {
  const field = body();
  const { w, h, bytes, points } = field;
  const texel = (u, v) => {
    const n = (Math.floor(v * h) * w + Math.floor(u * w)) * 4;
    return [...bytes.subarray(n, n + 4)];
  };
  // On the trunk: the body, no distance out, some depth in.
  const [out, , depth, on] = texel(0.5, 0.3);
  assert.equal(out, 0);
  assert.ok(depth > 0 && on === 255);
  // Beside it: off the body, a distance out that grows.
  assert.equal(texel(0.02, 0.02)[3], 0);
  assert.ok(texel(0.02, 0.3)[0] > texel(0.1, 0.3)[0]);
  // Over the head the lift grows with height; under the feet there is none to rise from.
  assert.ok(texel(0.2, 0.02)[1] > texel(0.2, 0.1)[1] && texel(0.2, 0.1)[1] > 0);
  assert.equal(texel(0.5, 0.995)[1], 255);
  // The particles' points are on the body.
  assert.ok(points.length > 200);
  for (let n = 0; n < points.length; n += 2) assert.equal(texel(points[n], points[n + 1])[3] >= 128, true);
});

test("the budget steps down by device, and the governor sheds when frames run long", () => {
  const tiers = [desktop, tablet, phone, low].map((environment) => formBurstBudget(environment));
  for (const key of ["shards", "embers", "large", "fine"])
    for (let n = 1; n < tiers.length; n += 1) assert.ok(tiers[n][key] < tiers[n - 1][key], key);
  for (const tier of tiers) assert.ok(tier.ratio <= 2 && tier.air <= 2, "the backing stores are capped");
  assert.ok(tiers[3].ratio < 1.5);
  assert.equal(FORM_BURST_QUALITY.length, FORM_BURST_SHARE.length);
  const governor = new FormBurstGovernor();
  for (let n = 0; n < 40; n += 1) governor.sample(16.7);
  assert.equal(governor.level, 0);
  for (let n = 0; n < 8; n += 1) governor.sample(34);
  assert.equal(governor.level, 1);
  for (let n = 0; n < 60; n += 1) governor.sample(48);
  assert.equal(governor.level, FORM_BURST_QUALITY.length - 1);
  // A stall (a hidden tab) is not a slow frame.
  const fresh = new FormBurstGovernor();
  fresh.sample(900);
  assert.equal(fresh.level, 0);
  // Fewer particles at a lower share.
  const particles = cast();
  const ms = FORM_BURST_BEATS.ultra.burst + 500;
  assert.ok(drawn(particles, "ultra", ms, 0.4).length < drawn(particles, "ultra", ms, 1).length * 0.6);
  const stage = read("src/lib/rexonance-form-burst-stage.ts");
  assert.match(stage, /Math\.min\(device, budget\.ratio, to\.naturalHeight \/ Math\.max\(1, artBox\.height\)\) \*\s*FORM_BURST_QUALITY\[level\]/);
  assert.match(stage, /FORM_BURST_SHARE\[governor\.level\]/);
});

test("the other sagas are not touched: the shared engine, its overwrite, their pages", () => {
  for (const path of [
    "src/lib/rexonance-resonance.js",
    "src/lib/rexonance-overwrite.js",
    "src/lib/rexonance-henshin.ts",
    "src/lib/far-from-form-shift.ts",
    "src/lib/illusionculum-form-change.ts",
    "src/lib/meta-unitas-assembly.ts",
    "src/components/transformation-lab/lab-stage.tsx",
  ])
    assert.doesNotMatch(read(path), /form-burst|formBurst|rxf-/, path);
  // The page's own overwrite is still there, for wherever the play is not.
  const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
  assert.match(page, /function FormMorph\(\{/);
  // The new rules are Rexonance's page's only.
  const css = read("src/styles-rexonance-zenith.css");
  for (const rule of css.match(/[^{}]*(?:rxf-burst|rxf-fade|data-rxf-burst)[^{}]*\{/g))
    assert.match(rule, /\.rxs-rexonance-page/);
});
