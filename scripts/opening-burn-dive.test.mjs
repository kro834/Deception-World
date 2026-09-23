import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hasConstrainedResources } from "../src/lib/rendering-profile.js";
import {
  OPENING_BURN,
  OPENING_DIVE,
  OPENING_DIVE_READY_TIMEOUT_MS,
  OPENING_SEQUENCE_SECONDS,
  burnUniformsAt,
  diveUniformsAt,
  openingFramesPerDraw,
  pickOpeningTier,
} from "../src/components/cinematic/opening-timing.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const sample = (from, to, step = 1 / 60) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, index) => from + index * step);

test("the title's clock, the burn and the sequence agree", async () => {
  const title = await read("src/components/cinematic/title-sequence.tsx");
  const styles = await read("src/styles.css");
  const sequenceMs = Number(title.match(/const SEQUENCE_MS = (\d+);/)[1]);
  assert.equal(sequenceMs, OPENING_SEQUENCE_SECONDS * 1000);
  assert.match(styles, new RegExp(`--seq: ${OPENING_SEQUENCE_SECONDS}s;`));
  // The burn starts once the ice logo has arrived (frosted-title-arrival:
  // 0.34 s + 1.8 s) and hands over to the prism logo before the title completes.
  assert.ok(OPENING_BURN.start >= 0.34 + 1.8);
  assert.ok(OPENING_BURN.start + OPENING_BURN.end < OPENING_SEQUENCE_SECONDS);
  assert.ok(OPENING_BURN.front[1] < OPENING_BURN.handOff[0]);
  // The shine sweeps the prism logo after the hand-over.
  const shine = Number(
    styles.match(
      /\.is-playing \.cine-logo-shine \{\s*animation: shine-sweep 1s ease-in-out ([\d.]+)s/,
    )[1],
  );
  assert.ok(shine >= OPENING_BURN.start + OPENING_BURN.handOff[0]);
});

test("the burn's schedule is monotonic where a swing would read as a flash", () => {
  const times = sample(0, OPENING_BURN.end);
  const frames = times.map((T) => burnUniformsAt(T));
  for (const key of ["uHeat", "uBurn", "uCool"]) {
    frames.forEach((frame, index) => {
      if (index) assert.ok(frame[key] >= frames[index - 1][key] - 1e-9, `${key} only rises`);
    });
  }
  const at = (T) => burnUniformsAt(T);
  assert.deepEqual(at(0), { uHeat: 0, uBurn: 0, uFlame: 0, uCool: 0 });
  // One swell of flame: it rises, holds and falls, never twice.
  let turns = 0;
  for (let index = 2; index < frames.length; index += 1) {
    const a = frames[index - 1].uFlame - frames[index - 2].uFlame;
    const b = frames[index].uFlame - frames[index - 1].uFlame;
    if (a > 1e-6 && b < -1e-6) turns += 1;
  }
  assert.ok(turns <= 1);
  const handOff = at(OPENING_BURN.handOff[0]);
  assert.equal(handOff.uBurn, 1);
  assert.ok(
    handOff.uCool > 0.99 && handOff.uFlame < 0.01,
    "the canvas is the DOM prism logo at the swap",
  );
});

test("the dive swells amber once, grades ice only upwards, and lands still", async () => {
  const frames = sample(0, OPENING_DIVE.glEnd).map((T) => ({ T, ...diveUniformsAt(T) }));
  frames.forEach((frame, index) => {
    if (!index) return;
    assert.ok(frame.uIce >= frames[index - 1].uIce, "the ice grade only rises");
    assert.ok(frame.uLand >= frames[index - 1].uLand);
  });
  const peak = frames.reduce((best, frame) => (frame.uWarp > best.uWarp ? frame : best));
  assert.ok(Math.abs(peak.T - OPENING_DIVE.cut) < 0.02, "the bloom peaks at the breakthrough");
  // Rising before the peak, falling after it: one swell (never a strobe).
  for (let index = 1; index < frames.length; index += 1) {
    const delta = frames[index].uWarp - frames[index - 1].uWarp;
    if (frames[index].T <= peak.T) assert.ok(delta >= -1e-9);
    else assert.ok(delta <= 1e-9);
  }
  const first = diveUniformsAt(0);
  assert.deepEqual(
    {
      zoom: first.uZoom,
      blur: first.uBlur,
      world: first.uWorld,
      bars: first.uBars,
      ice: first.uIce,
    },
    { zoom: 1, blur: 0, world: 0, bars: 1, ice: 0 },
    "frame 0 is the title's own framing",
  );
  const last = diveUniformsAt(OPENING_DIVE.glEnd);
  assert.deepEqual(
    {
      blur: last.uBlur,
      warp: last.uWarp,
      dive: last.uDive,
      zoom: last.uWorldZoom,
      land: last.uLand,
    },
    { blur: 0, warp: 0, dive: 0, zoom: 1, land: 1 },
    "the landing frame is still",
  );
  // The shader phase fits LoadGate's covered fail-safe with GL latency.
  const gate = await read("src/components/load-gate.tsx");
  const failSafe = Number(gate.match(/runtime\.covered\.promise, wait\((\d+)\)/)[1]);
  assert.ok(OPENING_DIVE_READY_TIMEOUT_MS + OPENING_DIVE.glEnd * 1000 < failSafe - 300);
});

test("tiers are chosen by capability, never by device model", () => {
  const android = { userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9)", hardwareConcurrency: 8 };
  assert.equal(
    pickOpeningTier({ reducedMotion: false, constrained: hasConstrainedResources(android) }),
    "webgl",
  );
  assert.equal(
    pickOpeningTier({
      reducedMotion: false,
      constrained: hasConstrainedResources({ connection: { saveData: true } }),
    }),
    "css",
  );
  assert.equal(pickOpeningTier({ reducedMotion: true, constrained: false }), "reduced");
  assert.equal(openingFramesPerDraw(1000 / 60), 1);
  assert.equal(openingFramesPerDraw(1000 / 90), 1);
  assert.equal(openingFramesPerDraw(1000 / 120), 2);
  assert.equal(openingFramesPerDraw(0), 1);
});

test("the GL passes follow RISING's renderer rules without touching RISING", async () => {
  const kit = await read("src/components/cinematic/opening-gl.ts");
  const noise = await read("src/components/cinematic/opening-noise.glsl");
  const burn = await read("src/components/cinematic/opening-burn.ts");
  const dive = await read("src/components/cinematic/opening-dive.ts");
  assert.match(kit, /failIfMajorPerformanceCaveat: true/);
  assert.match(kit, /KHR_parallel_shader_compile/);
  assert.match(kit, /WEBGL_lose_context"\)\?\.loseContext\(\)/);
  assert.match(kit, /premultiplyAlpha: "premultiply"/);
  assert.match(kit, /resizeQuality = "low"/);
  assert.match(noise, /#ifdef GL_FRAGMENT_PRECISION_HIGH\s+precision highp float;/);
  assert.match(burn, /alpha: true/, "the burn canvas is premultiplied over the scene");
  assert.match(dive, /alpha: false/, "the dive canvas is opaque");
  for (const source of [kit, burn, dive]) {
    assert.doesNotMatch(source, /from "\.\.\/world\/rising/, "RISING stays untouched");
  }
  // GLSL ES 1.00: no smoothstep(e0, e1) with e0 >= e1 (fall() is used instead).
  for (const path of [
    "src/components/cinematic/opening-noise.glsl",
    "src/components/cinematic/opening-burn.frag.glsl",
    "src/components/cinematic/opening-dive.frag.glsl",
  ]) {
    const glsl = await read(path);
    for (const [, a, b] of glsl.matchAll(/smoothstep\((-?[\d.]+),\s*(-?[\d.]+),/g)) {
      assert.ok(Number(a) < Number(b), `${path}: smoothstep(${a}, ${b})`);
    }
  }
});

test("the CSS tiers animate compositor properties only", async () => {
  const styles = await read("src/styles.css");
  const handoff = await read("src/components/cinematic/opening-handoff.tsx");
  for (const [, name, body] of styles.matchAll(/@keyframes (cine-burn-[\w-]+) \{([\s\S]*?)\n\}/g)) {
    const properties = [...body.matchAll(/^\s*([\w-]+):/gm)].map((match) => match[1]);
    assert.deepEqual(
      [...new Set(properties)].filter((property) => !["opacity", "transform"].includes(property)),
      [],
      name,
    );
  }
  const cssDive = handoff.slice(
    handoff.indexOf("const startCssDive"),
    handoff.indexOf("let tierLabel"),
  );
  const keys = [...cssDive.matchAll(/\{\s*((?:\w+:[^,}]+,?\s*)+)\}/g)].flatMap((match) =>
    [...match[1].matchAll(/(\w+):/g)].map((key) => key[1]),
  );
  assert.deepEqual(
    [...new Set(keys)].filter((key) => !["transform", "opacity", "offset", "easing"].includes(key)),
    [],
  );
});

test("only existing words appear in the opening and its handoff", async () => {
  const title = await read("src/components/cinematic/title-sequence.tsx");
  const handoff = await read("src/components/cinematic/opening-handoff.tsx");
  // JSX text nodes: between a tag's `>` and the next `<`, on one line, not code.
  const words = (source) =>
    [...source.matchAll(/>[ \t]*\n?[ \t]*([^<>{}();=\n]+?)[ \t]*\n?[ \t]*</g)]
      .map((match) => match[1].trim())
      .filter(
        (word) =>
          /[\p{L}\d]/u.test(word) &&
          !/&&|\|\||\?\?|\w\.\w/.test(word) &&
          !/^(?:null|string|number|Animation|HTMLElement|Promise)$/.test(word),
      );
  assert.deepEqual(words(handoff), ["DW // OPENING HANDOFF", "WORLD LINK"]);
  for (const word of words(title)) {
    assert.ok(
      [
        "KAMEN RIDER SAGA",
        "WORLD FILE / 02",
        "DECEPTION",
        "WORLD",
        "THE WORLD IS MADE OF DECEPTION.",
        "35°41′ // REALITY",
        "SIGNAL 07 // LOCKED",
        "DW // OPENING 02",
        "WORLD SIGNAL 07",
        "THE SECOND SAGA",
        "DECEPTION WORLD",
        "INITIALIZE SIGNAL",
        "TRACE DECEPTION",
        "WORLD LOCKED",
        "Opening",
        "スキップ",
        "ESC",
        "ENTER THE WORLD",
        "もう一度",
      ].includes(word),
      word,
    );
  }
});
