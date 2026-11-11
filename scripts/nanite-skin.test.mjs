import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NANITE_SKIN,
  NANITE_SKIN_BEAT_ORDER,
  NANITE_SKIN_GROUP_BEAT,
  NANITE_SKIN_PARTS,
  NANITE_SKIN_SCENE_BEATS,
  createNaniteGovernor,
  createNaniteSkinGeneration,
  naniteBodyKnots,
  naniteGeodesicSteps,
  naniteKnotTime,
  naniteLiveBudget,
  naniteSkinTimeline,
  prepareNaniteSkin,
} from "../src/lib/nanite-skin.ts";
import { ASSEMBLY_BEATS } from "../src/lib/rexonance-resonance.js";

/* The nanite skin (owner, 2026-11-11: 「ナノマシン感が全くない」; then: as
   smooth and fine as a nanotech suit growing from one housing on the
   chest): one liquid front from the reactor over the body, the armour
   resolving behind it in bands; nothing laid as tiles. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const run = (steps) => {
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
};

// A 2D context that records what it is asked; its pictures are `pixel`.
const fakeContext = (calls, pixel) =>
  new Proxy(
    {},
    {
      get: (target, name) => {
        if (name in target) return target[name];
        if (name === "getImageData")
          return (x, y, width, height) => {
            const data = new Uint8ClampedArray(width * height * 4);
            for (let i = 0; i < width * height; i += 1)
              data.set(pixel(i % width, Math.floor(i / width), width, height), i * 4);
            return { data };
          };
        if (name === "createImageData")
          return (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height });
        if (name === "createLinearGradient") return () => ({ addColorStop() {} });
        return (...args) => {
          calls.push([name, ...args]);
        };
      },
      set: (target, name, value) => {
        target[name] = value;
        return true;
      },
    },
  );
const fakeDocument = (pixel) => {
  const canvases = [];
  return {
    canvases,
    createElement: () => {
      const canvas = { width: 0, height: 0, calls: [] };
      let context = null;
      canvas.getContext = () => (context ??= fakeContext(canvas.calls, pixel));
      canvases.push(canvas);
      return canvas;
    },
  };
};

// A figure 240 × 400: a trunk, two arms, two legs, a head; the reactor on
// the chest. Tiles of 10 px by group.
const SIZE = { width: 240, height: 400 };
const partAt = (x, y) => {
  if (y >= 20 && y < 70 && x >= 100 && x < 140) return 5; // head
  if (y >= 80 && y < 170 && x >= 80 && x < 160) return 2; // chest
  if (y >= 170 && y < 210 && x >= 80 && x < 160) return 3; // waist
  if (y >= 80 && y < 240 && ((x >= 40 && x < 70) || (x >= 170 && x < 200))) return 1; // arms
  if (y >= 210 && y < 390 && ((x >= 80 && x < 115) || (x >= 125 && x < 160))) return 0; // legs
  if (y >= 80 && y < 100 && ((x >= 70 && x < 80) || (x >= 160 && x < 170))) return 2; // shoulders
  return -1;
};
const figureTiles = () => {
  const tiles = [];
  for (let y = 0; y < SIZE.height; y += 10)
    for (let x = 0; x < SIZE.width; x += 10) {
      const beat = partAt(x + 5, y + 5);
      if (beat >= 0) tiles.push({ sx: x, sy: y, tw: 10, th: 10, beat, pieceId: `p${beat}` });
    }
  return tiles;
};
const figurePixel = (x, y, width, height) =>
  partAt(((x + 0.5) * SIZE.width) / width, ((y + 0.5) * SIZE.height) / height) >= 0
    ? [120, 130, 150, 255]
    : [0, 0, 0, 0];
const STYLE = {
  steel: "rgb(20 26 34)",
  steelAlpha: 0.84,
  line: "rgb(150 236 255)",
  glint: [226, 248, 255],
  motes: ["rgb(150 170 190)", "rgb(255 215 122)", "rgb(244 251 255)"],
  cell: 9,
  triangles: true,
};
const makeSkin = (overrides = {}) => {
  const document = fakeDocument(figurePixel);
  const clock = { now: 0 };
  const layer = run(
    prepareNaniteSkin({
      document,
      size: SIZE,
      tiles: figureTiles(),
      tile: 10,
      core: [120, 120],
      visor: [120, 45],
      coarse: false,
      art: {},
      style: STYLE,
      timeline: naniteSkinTimeline(ASSEMBLY_BEATS),
      now: () => clock.now,
      ...overrides,
    }),
  );
  return { layer, document, clock };
};

test("the scene's beats are the engine's, and the skin's order runs out from the reactor", () => {
  assert.deepEqual([...NANITE_SKIN_SCENE_BEATS.deus], [...ASSEMBLY_BEATS.deus]);
  assert.deepEqual([...NANITE_SKIN_SCENE_BEATS.rexonance], [...ASSEMBLY_BEATS.rexonance]);
  assert.equal(NANITE_SKIN_SCENE_BEATS.clamp, ASSEMBLY_BEATS.clamp);
  // Chest, waist, arms, legs — the plan's beats 2, 3, 1, 0.
  assert.deepEqual([...NANITE_SKIN_BEAT_ORDER], [2, 3, 1, 0]);
  assert.deepEqual([...NANITE_SKIN_PARTS], ["CHEST", "WAIST", "ARMS", "LEGS"]);
  assert.equal(NANITE_SKIN_GROUP_BEAT.chest, 2);
  assert.equal(NANITE_SKIN_GROUP_BEAT.shoulders, 2);
  assert.equal(NANITE_SKIN_GROUP_BEAT.legs, 0);
  assert.equal(NANITE_SKIN_GROUP_BEAT.helm, 5);
  const timeline = naniteSkinTimeline(ASSEMBLY_BEATS);
  assert.deepEqual(
    timeline.body.map((value) => Number(value.toFixed(4))),
    [0.16, 0.275, 0.39, 0.505, 0.62],
  );
  // Every cell has clicked before the seal.
  const T = NANITE_SKIN.front;
  assert.ok(timeline.helm[1] + T.lag + T.click + T.pop < ASSEMBLY_BEATS.clamp);
  assert.ok(timeline.ornaments[1] + T.lag + T.click + T.pop < ASSEMBLY_BEATS.clamp);
  assert.ok(timeline.helm[0] > timeline.body[4], "the helmet is last");
});

test("the bands stay narrow: a front, never a crossfade", () => {
  const T = NANITE_SKIN.front;
  const body = ASSEMBLY_BEATS.deus[1] - ASSEMBLY_BEATS.deus[0];
  // From liquid to the armour's colours within a fifth of the body's run.
  assert.ok(T.lag + T.click + T.pop < body * 0.2);
  assert.ok(T.lip < 0.01 && T.soft < 0.01, "a thin lip");
  assert.ok(T.pop < T.click / 4, "a cell clicks; it does not fade");
  const C = NANITE_SKIN.change;
  assert.ok(C.lag + C.click + C.pop < 0.2);
  assert.ok(NANITE_SKIN.grid >= 2, "the field is baked below the figure's size");
});

test("the geodesic field flows along the body and pays for air", () => {
  // A U of body round a gap: the far arm is reached round the bend.
  const gw = 30;
  const gh = 30;
  const body = new Uint8Array(gw * gh);
  for (let y = 5; y < 25; y += 1) {
    body[y * gw + 5] = 1;
    body[y * gw + 20] = 1;
  }
  for (let x = 5; x <= 20; x += 1) body[24 * gw + x] = 1;
  const seed = 5 * gw + 5;
  const { dist, parent } = run(naniteGeodesicSteps(body, gw, gh, seed, 50));
  assert.equal(dist[seed], 0);
  assert.equal(parent[seed], -1);
  assert.equal(dist[10 * gw + 5], 5);
  // The top of the other arm: down, across, up — not straight over.
  const far = 5 * gw + 20;
  assert.ok(dist[far] > 19 + 15 + 19 - 3 && dist[far] < 19 + 15 + 19 + 1, String(dist[far]));
  // With cheap air it cuts across.
  const cheap = run(naniteGeodesicSteps(body, gw, gh, seed, 1));
  assert.ok(cheap.dist[far] <= 15.001);
  // Parents lead back to the seed.
  let at = far;
  let hops = 0;
  while (parent[at] >= 0 && hops < 1000) {
    at = parent[at];
    hops += 1;
  }
  assert.equal(at, seed);
  // Every cell is reached.
  assert.ok(dist.every((value) => Number.isFinite(value)));
});

test("the body's knots: a group whole on each beat, the front never standing still", () => {
  const times = [0.16, 0.275, 0.39, 0.505, 0.62];
  const knots = naniteBodyKnots([40, 60, 120, 200], times);
  assert.deepEqual(knots, [
    [0, 0.16],
    [40, 0.275],
    [60, 0.39],
    [120, 0.505],
    [200, 0.62],
  ]);
  assert.equal(naniteKnotTime(knots, 0), 0.16);
  assert.equal(naniteKnotTime(knots, 40), 0.275);
  assert.ok(Math.abs(naniteKnotTime(knots, 20) - 0.2175) < 1e-9);
  assert.equal(naniteKnotTime(knots, 999), 0.62);
  // A waist the chest already covers, and a suit with no arms: no knot of
  // their own, and the body still ends on its last time.
  const short = naniteBodyKnots([80, 60, NaN, 200], times);
  assert.deepEqual(short, [
    [0, 0.16],
    [80, 0.275],
    [200, 0.62],
  ]);
  for (let d = 0, last = 0; d <= 200; d += 5) {
    const t = naniteKnotTime(short, d);
    assert.ok(t >= last);
    if (d > 0) assert.ok(t > last, "the front keeps moving");
    last = t;
  }
  assert.equal(naniteBodyKnots([NaN, NaN, NaN, NaN], times).at(-1)[1], 0.62);
});

test("the governor steps down on a run of slow frames and back on a long quick run", () => {
  const governor = createNaniteGovernor();
  const G = NANITE_SKIN.governor;
  assert.equal(governor.level, 0);
  // A single slow frame, or slow frames broken by quick ones, change nothing.
  for (let i = 0; i < G.slowFrames - 1; i += 1) governor.feed(G.slowMs + 5);
  governor.feed(1);
  for (let i = 0; i < G.slowFrames - 1; i += 1) governor.feed(G.slowMs + 5);
  assert.equal(governor.level, 0);
  governor.feed(G.slowMs + 5);
  assert.equal(governor.level, 1);
  for (let i = 0; i < G.slowFrames * 10; i += 1) governor.feed(G.slowMs + 5);
  assert.equal(governor.level, NANITE_SKIN.levels.length - 1, "never past the leanest");
  // Frames between the two marks hold the level.
  for (let i = 0; i < 500; i += 1) governor.feed((G.slowMs + G.fastMs) / 2);
  assert.equal(governor.level, NANITE_SKIN.levels.length - 1);
  for (let i = 0; i < G.fastFrames - 1; i += 1) governor.feed(G.fastMs - 1);
  assert.equal(governor.level, NANITE_SKIN.levels.length - 1);
  governor.feed(G.fastMs - 1);
  assert.equal(governor.level, NANITE_SKIN.levels.length - 2);
  governor.feed(Number.NaN);
  assert.equal(governor.level, NANITE_SKIN.levels.length - 2);
  assert.ok(G.fastFrames > G.slowFrames * 4, "slow to come back: no flicker");
});

test("the droplets' budget: few, by pointer, and never cut to nothing", () => {
  assert.equal(naniteLiveBudget(false), NANITE_SKIN.live.fine);
  assert.equal(naniteLiveBudget(true), NANITE_SKIN.live.coarse);
  assert.ok(NANITE_SKIN.live.coarse <= 250 && NANITE_SKIN.live.fine <= 600);
  for (const coarse of [false, true]) {
    let last = Infinity;
    for (let level = 0; level < NANITE_SKIN.levels.length; level += 1) {
      const budget = naniteLiveBudget(coarse, level);
      assert.ok(budget <= last);
      assert.ok(budget >= 80, "the lip still glitters at the leanest level");
      last = budget;
    }
    assert.equal(naniteLiveBudget(coarse, 99), naniteLiveBudget(coarse, NANITE_SKIN.levels.length - 1));
  }
  // The leanest level keeps the surface whole: only droplets and the ripple go.
  assert.equal(NANITE_SKIN.levels.at(-1).ripple, false);
  assert.equal(NANITE_SKIN.levels[0].ripple, true);
});

test("the field: out from the reactor — chest, waist, arms, legs — the helmet last", () => {
  const { layer } = makeSkin();
  assert.ok(layer);
  const { width, height, time } = layer.field;
  assert.equal(width, Math.ceil(SIZE.width / NANITE_SKIN.grid));
  assert.equal(height, Math.ceil(SIZE.height / NANITE_SKIN.grid));
  const at = (x, y) => time[Math.floor(y / NANITE_SKIN.grid) * width + Math.floor(x / NANITE_SKIN.grid)];
  // Off the armour: no time.
  assert.ok(Number.isNaN(at(5, 5)));
  const slack = 0.03;
  // The reactor first; the chest whole by the first beat's end.
  assert.ok(at(120, 120) < 0.19);
  assert.ok(at(85, 165) < 0.275 + slack);
  // Down the trunk, then the limbs' ends last of the body.
  assert.ok(at(120, 200) > at(120, 130));
  assert.ok(at(100, 380) > at(100, 230));
  assert.ok(at(100, 385) <= 0.62 + slack && at(100, 385) > 0.5);
  assert.ok(at(50, 235) > at(50, 100), "down the arm");
  assert.ok(at(50, 235) < at(100, 385), "the arms before the legs");
  // The helmet after the body: up from the neck.
  assert.ok(at(120, 65) > 0.62);
  assert.ok(at(120, 25) > at(120, 65) || at(120, 45) > at(120, 65));
  let last = -Infinity;
  for (const value of time) if (value === value && value > last) last = value;
  assert.ok(last + NANITE_SKIN.front.lag + NANITE_SKIN.front.click < ASSEMBLY_BEATS.clamp);
  assert.ok(layer.stats.pixels > 2000);
  layer.release();
});

test("a frame touches only the bands, draws in batches, and is a closed form of the progress", () => {
  const { layer, document } = makeSkin();
  const calls = [];
  const context = fakeContext(calls, figurePixel);
  // Before the front leaves: nothing.
  layer.draw(context, 0.1, false, 1, 1);
  assert.equal(calls.length, 0);
  layer.draw(context, 0.3, false, 1.5, 2);
  const band = layer.stats.band;
  assert.ok(band > 0 && band < layer.stats.pixels * 0.6, "only the bands' pixels");
  const mid = calls.length;
  assert.ok(mid > 0);
  // A dozen draws and a few fills — never one per pixel or per droplet.
  assert.ok(calls.filter(([name]) => name === "drawImage").length <= 6);
  assert.ok(calls.filter(([name]) => name === "fill").length <= 3);
  assert.ok(layer.stats.drawn > 0, "droplets at the lip");
  assert.ok(layer.stats.drawn <= NANITE_SKIN.live.fine * 2.4);
  // The same moment again, and after a scrub away and back: the same calls.
  const again = [];
  layer.draw(fakeContext(again, figurePixel), 0.3, false, 1.5, 2);
  assert.deepEqual(again, calls.slice(0, mid));
  layer.draw(fakeContext([], figurePixel), 0.7, false, 1.5, 2);
  layer.draw(fakeContext([], figurePixel), 0.2, false, 1.5, 2);
  const back = [];
  layer.draw(fakeContext(back, figurePixel), 0.3, false, 1.5, 2);
  assert.deepEqual(back, calls.slice(0, mid));
  assert.equal(layer.stats.band, band);
  // Whole: the bands are gone, the armour is one masked draw, no droplets.
  const whole = [];
  layer.draw(fakeContext(whole, figurePixel), ASSEMBLY_BEATS.seal[1] + 0.05, false, 1.5, 2);
  assert.equal(layer.stats.band, 0);
  assert.equal(layer.stats.drawn, 0);
  assert.equal(whole.filter(([name]) => name === "drawImage").length, 1);
  // Nothing is read back in a frame (the masks are written, never read).
  for (const canvas of document.canvases)
    assert.ok(!canvas.calls.slice(-40).some(([name]) => name === "getImageData"));
  layer.release();
});

test("slow frames thin the droplets; the surface stays whole", () => {
  const { layer, clock } = makeSkin();
  const context = () => {
    const calls = [];
    // Each draw of the scene's context costs 3 ms on this clock.
    const made = fakeContext(calls, figurePixel);
    return new Proxy(made, {
      get(target, name) {
        const value = target[name];
        if (name !== "drawImage") return value;
        return (...args) => {
          clock.now += 3;
          return value(...args);
        };
      },
    });
  };
  layer.draw(context(), 0.3, false, 1, 1);
  const full = layer.stats.drawn;
  const band = layer.stats.band;
  assert.equal(layer.level, 0);
  for (let i = 0; i < NANITE_SKIN.governor.slowFrames * NANITE_SKIN.levels.length; i += 1)
    layer.draw(context(), 0.3, false, 1, 1);
  assert.equal(layer.level, NANITE_SKIN.levels.length - 1);
  assert.ok(layer.stats.drawn < full * 0.6, `${layer.stats.drawn} of ${full}`);
  assert.ok(layer.stats.drawn > full * 0.2, "never to nothing");
  assert.equal(layer.stats.band, band, "the bands are the same");
  layer.release();
});

test("a change of form and the retract run on the same front, from and to the reactor", () => {
  const { layer } = makeSkin();
  const from = { width: SIZE.width, height: SIZE.height };
  const to = { width: SIZE.width, height: SIZE.height };
  const start = [];
  assert.equal(layer.form(fakeContext(start, figurePixel), from, to, "standard", "high", 0, "#fff", false, 1, 1), true);
  // At 0 the last form stands whole.
  assert.deepEqual(start.filter(([name]) => name === "drawImage").map((call) => call[1]), [from]);
  const mid = [];
  layer.form(fakeContext(mid, figurePixel), from, to, "standard", "high", 0.5, "#fff", false, 1, 1);
  assert.ok(layer.stats.band > 0);
  assert.ok(mid.filter(([name]) => name === "drawImage").length <= 7);
  const end = [];
  layer.form(fakeContext(end, figurePixel), from, to, "standard", "high", 1, "#fff", false, 1, 1);
  assert.equal(layer.stats.band, 0, "every cell has clicked at the end");
  // The retract: nothing until a picture is held; one copy, nothing read.
  const idle = [];
  layer.retract(fakeContext(idle, figurePixel), 0.3, 1, 1);
  assert.equal(idle.length, 0);
  assert.equal(layer.hold({ width: 10, height: 10 }, 2, 12, 30), true);
  const early = [];
  layer.retract(fakeContext(early, figurePixel), 0.05, 1, 1);
  const half = [];
  layer.retract(fakeContext(half, figurePixel), 0.6, 1, 1);
  assert.ok(half.length > 0 && early.length > 0);
  // Gone at 1, and it stays gone.
  const gone = [];
  layer.retract(fakeContext(gone, figurePixel), 1, 1, 1);
  layer.retract(fakeContext(gone, figurePixel), 0.5, 1, 1);
  assert.equal(gone.length, 0);
  layer.release();
});

test("the generation hook replaces the armour's build and lends its layer", () => {
  let lent;
  const own = { form: () => true };
  const generation = createNaniteSkinGeneration({
    style: STYLE,
    beats: ASSEMBLY_BEATS,
    changes: own,
    onLayer(layer) {
      lent = layer;
    },
  });
  assert.equal(generation.overlay, false, "in place of the swarm, not over it");
  const layer = run(
    generation.prepare({
      document: fakeDocument(figurePixel),
      size: SIZE,
      plan: { tiles: figureTiles(), tile: 10 },
      core: [120, 120],
      visor: [120, 45],
      coarse: true,
      unlit: {},
    }),
  );
  assert.ok(layer);
  assert.equal(lent, layer);
  // A page's own changes of form are drawn by the page.
  assert.equal(layer.form({}, {}, {}, "a", "b", 0.5, "", false, 1, 1), true);
  layer.release();
  assert.equal(lent, null);
});

test("the three suit-ups grow as a nanite skin, each in its own light", () => {
  const farFrom = read("src/lib/far-from-assembly-engine.ts");
  assert.match(farFrom, /generation: farFromSkinGeneration/);
  assert.match(farFrom, /farFromSkin\?\.hold\(canvas, vs, vx, vy\)/);
  assert.match(farFrom, /farFromSkin\?\.retract\(context, state\.mist, vs, ratio\)/);
  const style = read("src/lib/far-from-skin-style.ts");
  assert.match(style, /triangles: true/);
  const metaUnitas = read("src/lib/meta-unitas-rx-engine.ts");
  assert.match(metaUnitas, /generation: metaUnitasSkinGeneration/);
  assert.match(metaUnitas, /line: "rgb\(120 226 220\)"/);
  const illusionculum = read("src/lib/illusionculum-assembly-engine.ts");
  assert.match(illusionculum, /generation: createNaniteSkinGeneration\(\{/);
  assert.match(illusionculum, /changes: formChange/);
  // The entry of FAR FROM, on its own clock.
  const entry = read("src/components/far-from-saga/far-from-entry-engine.ts");
  assert.match(entry, /skin\.draw\(flight, farFromEntrySkinProgress\(t\), false, s, scale\)/);
  assert.match(entry, /const exploded = skinState === "failed";/);
  // Rexonance is not touched: no skin in its own modules.
  for (const path of ["src/lib/rexonance-resonance.js", "src/lib/rexonance-assembly-nanites.js"])
    assert.doesNotMatch(read(path), /nanite-skin/);
  // The skin's draw passes allocate nothing.
  const skin = read("src/lib/nanite-skin.ts");
  const passes = skin.slice(
    skin.indexOf("/* -- draw passes: allocation-free from here -- */"),
    skin.indexOf("/* -- end of the draw passes -- */"),
  );
  assert.ok(passes.length > 2000);
  assert.doesNotMatch(passes, /\bnew \w|\.map\(|\.filter\(|\[\.\.\.|Array\.from|getImageData|shadowBlur|\.filter =/);
});
