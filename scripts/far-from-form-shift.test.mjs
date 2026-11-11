import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ASSEMBLY_BEATS } from "../src/lib/rexonance-resonance.js";
import {
  FAR_FROM_SHIFT,
  createFarFromFormShift,
  farFromShiftPlan,
  farFromShiftProgress,
  farFromShiftUnder,
} from "../src/lib/far-from-form-shift.ts";
import { FAR_FROM_FORM_CHAIN, farFromAssemblyConfig } from "../src/lib/far-from-assembly-engine.ts";
import { FAR_FROM_MIST, createFarFromMist, farFromMistCurl } from "../src/lib/far-from-nanite-mist.ts";
import { FAR_FROM_TIDE, farFromTidePath, prepareFarFromTide } from "../src/lib/far-from-nanite-tide.ts";

/* FAR FROM SAGA — the form change on the suit-up's runway and the nanite
   tide (owner, 2026-11-11: 「ナノマシン装着アニメーションを強化して。また、
   5つの形態のうち1つを開いた後、別の形態に移動する時、現在の形態のアーマーの
   ナノマシンが消散し、そのアンダースーツから遷移アニメーションが始まるように」).
   These pin the change's sequence (dissolve → build from the undersuit →
   settle), every way it can be interrupted, and the draw layers' contracts. */

const steps = (form) => FAR_FROM_FORM_CHAIN.indexOf(form) + 1;
const machine = () => createFarFromFormShift({ beats: ASSEMBLY_BEATS, steps });
const ask = (shift, to, now, over = {}) =>
  shift.request({ now, to, shown: 1, scroll: 1, visible: true, motion: true, ...over });
/** Runs the clock in 16 ms frames from `from` for `ms`; the frames' copies. */
const run = (shift, from, ms, scroll = 1) => {
  const frames = [];
  for (let t = from; t <= from + ms; t += 16) {
    const frame = shift.frame(t, scroll);
    frames.push(frame ? { ...frame, at: t } : null);
    if (!frame) break;
  }
  return frames;
};

test("the change runs dissolve, the build from the undersuit, then the settle", () => {
  const shift = machine();
  assert.equal(shift.active, false);
  assert.equal(shift.frame(0, 1), null);
  assert.equal(ask(shift, "max", 1000), "start");
  assert.equal(shift.phase, "dissolve");
  assert.equal(shift.target, "max");
  const frames = run(shift, 1000, 20000);
  assert.equal(frames.at(-1), null, "the change ends by itself");
  assert.equal(shift.active, false);
  const live = frames.filter(Boolean);
  const phases = [...new Set(live.map((frame) => frame.phase))];
  assert.deepEqual(phases, ["dissolve", "build", "settle"]);
  // Never from the start of the runway: no scan, no fire (the fire is spent
  // by the undersuit's window), and never backwards.
  const [under0, under1] = FAR_FROM_SHIFT.under;
  assert.ok(under0 > ASSEMBLY_BEATS.scan[1] && under1 < ASSEMBLY_BEATS.deus[0]);
  assert.ok(Math.abs(live[0].progress - under0) < 1e-6);
  for (let i = 1; i < live.length; i += 1)
    assert.ok(live[i].progress >= live[i - 1].progress - 1e-9, `monotone at frame ${i}`);
  // No uniform crawl and no jump: a frame never moves more than a notch.
  for (let i = 1; i < live.length; i += 1)
    assert.ok(live[i].progress - live[i - 1].progress < 0.012, `no jump at frame ${i}`);
  const dissolve = live.filter((frame) => frame.phase === "dissolve");
  assert.ok(dissolve.every((frame) => frame.progress <= under1 + 1e-9));
  assert.ok(dissolve.every((frame) => frame.mist >= 0 && frame.mist <= 1));
  // The mist lingers into the build, then is gone for good.
  const build = live.filter((frame) => frame.phase === "build");
  assert.ok(build[0].mist >= 1 && build[0].mist < 1 + FAR_FROM_SHIFT.mistTail);
  assert.equal(build.at(-1).mist, -1);
  assert.ok(1 + FAR_FROM_SHIFT.mistTail <= FAR_FROM_MIST.end, "the picture outlives its mist");
  // The settle is the scroll's own frame, flashing once.
  const settle = live.filter((frame) => frame.phase === "settle");
  assert.ok(settle.every((frame) => frame.progress === 1 && frame.mist === -1));
  assert.ok(settle[0].settle >= 0 && settle.at(-1).settle < 1);
  // Its length: the dissolve, the plan, the settle.
  const total = FAR_FROM_SHIFT.dissolveMs + farFromShiftPlan(steps("max")).total + FAR_FROM_SHIFT.settleMs;
  assert.ok(Math.abs(live.at(-1).at - 1000 - total) <= 32);
});

test("the build's timeline: one base figure for every form, the chain by its length", () => {
  const middle = farFromShiftPlan(steps("standard"));
  const ultra = farFromShiftPlan(steps("ultra"));
  assert.equal(steps("standard"), 0);
  assert.equal(steps("ultra"), FAR_FROM_FORM_CHAIN.length);
  assert.equal(middle.base, ultra.base);
  assert.ok(ultra.chain > middle.chain && ultra.chain <= FAR_FROM_SHIFT.chainMaxMs);
  assert.ok(middle.chain >= FAR_FROM_SHIFT.chainMinMs);
  const [a, b] = ASSEMBLY_BEATS.form;
  for (const plan of [middle, ultra]) {
    assert.equal(farFromShiftProgress(plan, ASSEMBLY_BEATS, 0), FAR_FROM_SHIFT.under[1]);
    assert.ok(Math.abs(farFromShiftProgress(plan, ASSEMBLY_BEATS, plan.base) - a) < 1e-9);
    assert.ok(Math.abs(farFromShiftProgress(plan, ASSEMBLY_BEATS, plan.base + plan.chain) - b) < 1e-9);
    assert.equal(farFromShiftProgress(plan, ASSEMBLY_BEATS, plan.total, 1), 1);
    assert.equal(farFromShiftProgress(plan, ASSEMBLY_BEATS, plan.total + 5000, 0.99), 0.99);
  }
  // Until the chain, every plan draws the same frames.
  for (let t = 0; t < middle.base; t += 100)
    assert.equal(farFromShiftProgress(middle, ASSEMBLY_BEATS, t), farFromShiftProgress(ultra, ASSEMBLY_BEATS, t));
  // It eases in: the first tenth of the time covers less than a tenth.
  const tenth = farFromShiftProgress(middle, ASSEMBLY_BEATS, middle.base / 10);
  assert.ok(tenth - FAR_FROM_SHIFT.under[1] < (a - FAR_FROM_SHIFT.under[1]) * 0.08);
  assert.equal(farFromShiftUnder(0), FAR_FROM_SHIFT.under[0]);
  assert.equal(farFromShiftUnder(1), FAR_FROM_SHIFT.under[1]);
});

test("a change only starts from a finished form, on screen, with motion", () => {
  const mid = machine();
  assert.equal(ask(mid, "max", 0, { shown: 0.5, scroll: 0.5 }), "ignore");
  assert.equal(mid.active, false, "mid-runway the scroll plays the change");
  const hidden = machine();
  assert.equal(ask(hidden, "max", 0, { visible: false }), "ignore");
  const reduced = machine();
  assert.equal(ask(reduced, "max", 0, { motion: false }), "ignore");
  assert.equal(reduced.active, false);
  const done = machine();
  assert.equal(ask(done, "high", 0, { shown: ASSEMBLY_BEATS.form[1], scroll: ASSEMBLY_BEATS.form[1] }), "start");
});

test("a second choice during the dissolve or the base build only retargets", () => {
  const shift = machine();
  ask(shift, "max", 0);
  run(shift, 0, 400);
  assert.equal(shift.phase, "dissolve");
  assert.equal(ask(shift, "high", 400), "retarget");
  assert.equal(shift.target, "high");
  assert.equal(shift.phase, "dissolve", "the dissolve is not started over");
  const before = shift.frame(416, 1).mist;
  assert.ok(before > 0.3, "the mist keeps its clock");
  // On into the base build: still the same figure, so still a retarget.
  run(shift, 432, FAR_FROM_SHIFT.dissolveMs + 800);
  assert.equal(shift.phase, "build");
  const at = 432 + FAR_FROM_SHIFT.dissolveMs + 816;
  const progress = shift.frame(at, 1).progress;
  assert.equal(ask(shift, "ultra", at), "retarget");
  assert.equal(shift.phase, "build");
  assert.ok(Math.abs(shift.frame(at + 16, 1).progress - progress) < 0.012, "no jump on a retarget");
  // The same form again changes nothing.
  assert.equal(ask(shift, "ultra", at + 32), "ignore");
  // It ends on the last choice.
  const frames = run(shift, at + 48, 20000);
  assert.equal(frames.at(-1), null);
  assert.equal(shift.active, false);
});

test("a choice once the chain or the settle is on screen dissolves what is there", () => {
  const shift = machine();
  ask(shift, "max", 0);
  const chainAt = FAR_FROM_SHIFT.dissolveMs + farFromShiftPlan(steps("max")).base + 300;
  run(shift, 0, chainAt);
  assert.equal(shift.phase, "build");
  assert.ok(shift.frame(chainAt + 16, 1).progress > ASSEMBLY_BEATS.form[0]);
  assert.equal(ask(shift, "standard", chainAt + 32), "restart");
  assert.equal(shift.phase, "dissolve");
  assert.equal(shift.target, "standard");
  const first = shift.frame(chainAt + 48, 1);
  assert.equal(first.phase, "dissolve");
  assert.ok(first.mist < 0.05, "the new dissolve starts at its beginning");
  assert.ok(Math.abs(first.progress - FAR_FROM_SHIFT.under[0]) < 1e-3);
  // …and from the settle too.
  const frames = run(shift, chainAt + 64, 20000);
  assert.equal(frames.at(-1), null);
  const again = machine();
  ask(again, "high", 0);
  const settleAt = FAR_FROM_SHIFT.dissolveMs + farFromShiftPlan(steps("high")).total + 100;
  run(again, 0, settleAt);
  assert.equal(again.phase, "settle");
  assert.equal(ask(again, "xhigh", settleAt + 16), "restart");
  assert.equal(again.phase, "dissolve");
});

test("rapid re-selection always ends idle on the last choice, with no layer left", () => {
  const shift = machine();
  const picks = ["max", "high", "ultra", "standard", "xhigh", "max", "standard", "ultra"];
  let now = 0;
  // Every cadence from a double tap to a slow browse.
  for (const gap of [40, 90, 250, 700, 1500, 2600, 4200, 6000]) {
    for (const to of picks) {
      const answer = ask(shift, to, now);
      assert.ok(["start", "retarget", "restart", "ignore"].includes(answer));
      if (answer !== "ignore") assert.equal(shift.target, to);
      for (const frame of run(shift, now, gap)) {
        if (!frame) continue;
        assert.ok(frame.progress >= FAR_FROM_SHIFT.under[0] - 1e-9 && frame.progress <= 1);
        // Never two of its layers at once past the mist's tail.
        if (frame.phase === "settle") assert.equal(frame.mist, -1);
        if (frame.phase !== "settle") assert.equal(frame.settle, -1);
      }
      now += gap + 16;
    }
  }
  const frames = run(shift, now, 20000);
  assert.equal(frames.at(-1), null);
  assert.equal(shift.active, false);
  assert.equal(shift.phase, "idle");
  assert.equal(shift.target, "");
  assert.equal(shift.frame(now + 30000, 1), null);
});

test("the scroll, a stalled clock, the frame leaving and motion going off hand the scene back", () => {
  const scrolled = machine();
  ask(scrolled, "max", 0);
  run(scrolled, 0, 300);
  assert.ok(scrolled.frame(316, 1 - FAR_FROM_SHIFT.scrollSlack / 2), "a jitter of the scroll is not a move");
  assert.equal(scrolled.frame(332, 0.9), null);
  assert.equal(scrolled.active, false);

  const stalled = machine();
  ask(stalled, "max", 0);
  run(stalled, 0, 300);
  assert.equal(stalled.frame(320 + FAR_FROM_SHIFT.stallMs + 50, 1), null, "a hidden tab's gap ends it");
  assert.equal(stalled.active, false);

  // A slow device is not a stall: every beat plays, a step at a time.
  const slow = machine();
  ask(slow, "max", 0);
  const seen = new Set();
  let frames = 0;
  let previous = 0;
  for (let now = 0; now < 200000; now += 400) {
    const frame = slow.frame(now, 1);
    if (!frame) break;
    seen.add(frame.phase);
    assert.ok(frame.progress - previous < 0.04 || frame.phase === "dissolve", "no beat is skipped");
    previous = frame.progress;
    frames += 1;
  }
  assert.deepEqual([...seen], ["dissolve", "build", "settle"]);
  assert.equal(slow.active, false);
  assert.ok(frames > 50);

  const left = machine();
  ask(left, "max", 0);
  run(left, 0, 300);
  assert.equal(ask(left, "high", 316, { visible: false }), "cancel");
  assert.equal(left.active, false);

  const reduced = machine();
  ask(reduced, "max", 0);
  run(reduced, 0, 300);
  assert.equal(ask(reduced, "high", 316, { motion: false }), "cancel");
  assert.equal(reduced.frame(332, 1), null);

  const cancelled = machine();
  ask(cancelled, "max", 0);
  cancelled.cancel();
  assert.equal(cancelled.frame(16, 1), null);
});

test("the clock starts on the first frame drawn, whatever clock the request read", () => {
  const shift = machine();
  // The request's clock is far from the frames' (two time origins).
  ask(shift, "max", 987654);
  const first = shift.frame(120, 1);
  assert.ok(first && first.phase === "dissolve" && first.mist === 0);
  const next = shift.frame(136, 1);
  assert.ok(next.mist > 0 && next.mist < 0.05);
});

/* ---- the draw layers ---- */

// A 2D context that records what it is asked and can be read back as a
// picture of solid cells.
const fakeContext = (calls) =>
  new Proxy(
    {},
    {
      get: (target, name) => {
        if (name in target) return target[name];
        if (name === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return (...args) => {
          calls.push([name, ...args]);
        };
      },
      set: (target, name, value) => {
        target[name] = value;
        calls.push([`set ${String(name)}`, value]);
        return true;
      },
    },
  );
const fakeDocument = (pixel) => ({
  createElement: () => {
    const canvas = { width: 0, height: 0 };
    canvas.getContext = () => {
      const calls = [];
      const context = fakeContext(calls);
      context.getImageData = (x, y, width, height) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i += 1) data.set(pixel(i % width, Math.floor(i / width), width, height), i * 4);
        return { data };
      };
      canvas.calls = calls;
      return context;
    };
    return canvas;
  },
});

test("the mist: every solid cell is cut once, in order; armour flies, the body does not", () => {
  const size = { width: 693, height: 1040 };
  // The picture: a body column, armour (another colour) over its top half.
  let armoured = false;
  const pixel = (x, y, width, height) => {
    if (x < width * 0.3 || x > width * 0.7) return [0, 0, 0, 0];
    return armoured && y < height / 2 ? [40, 120, 255, 255] : [60, 60, 70, 255];
  };
  const document = fakeDocument(pixel);
  const mist = createFarFromMist({ document, size, core: [346, 300], coarse: true, undersuit: {} });
  assert.ok(mist);
  // (The undersuit's sample was read at once, with no armour on it.)
  assert.equal(mist.live, false);
  mist.draw(fakeContext([]), 0.5, 1);
  armoured = true;
  assert.equal(mist.capture({}, { a: 0.9, d: 0.9, e: 12, f: 30 }), true);
  assert.equal(mist.live, true);
  assert.ok(mist.count > 500, "the armour's cells fly");
  assert.ok(mist.count <= FAR_FROM_MIST.budget.coarse, "within the touch budget");
  const cell = FAR_FROM_MIST.cell.coarse;
  const solid = Math.ceil(size.width / cell) * Math.ceil(size.height / cell) * 0.4;
  assert.ok(mist.count < solid * 0.62, "the body's cells never fly");
  // Drawn forward: rects grow in number, then the mist thins to nothing.
  const rects = (u) => {
    const calls = [];
    mist.draw(fakeContext(calls), u, 1);
    return calls.filter(([name]) => name === "rect").length;
  };
  assert.ok(rects(0.02) < rects(0.4));
  assert.ok(rects(0.4) > 300);
  assert.ok(rects(1.35) < rects(0.6));
  assert.equal(mist.live, true);
  rects(FAR_FROM_MIST.end);
  assert.equal(mist.live, false, "gone for good at its end");
  assert.equal(rects(0.5), 0, "nothing is drawn after it");
  // A new capture starts it over (an interrupted change).
  assert.equal(mist.capture({}, { a: 0.9, d: 0.9, e: 12, f: 30 }), true);
  assert.equal(mist.live, true);
  assert.ok(rects(0.3) > 0);
  mist.release();
  assert.equal(mist.live, false);
  // An empty picture is no dissolve.
  const empty = createFarFromMist({ document: fakeDocument(() => [0, 0, 0, 0]), size, core: [346, 300], coarse: false });
  assert.equal(empty.capture({}, { a: 1, d: 1, e: 0, f: 0 }), false);
  assert.equal(empty.live, false);
});

test("the curl field is divergence-free and bounded", () => {
  const out = [0, 0];
  const at = (x, y) => {
    farFromMistCurl(x, y, 0.4, out);
    return [out[0], out[1]];
  };
  for (const [x, y] of [
    [100, 200],
    [346, 520],
    [600, 900],
  ]) {
    const h = 0.01;
    const div = (at(x + h, y)[0] - at(x - h, y)[0]) / (2 * h) + (at(x, y + h)[1] - at(x, y - h)[1]) / (2 * h);
    assert.ok(Math.abs(div) < 1e-6, `divergence at ${x}, ${y}`);
    assert.ok(Math.hypot(...at(x, y)) < 3);
  }
});

test("the tide: every tile docks ahead of its landing, flashes, charges and locks", () => {
  const tiles = [];
  for (let i = 0; i < 400; i += 1)
    tiles.push({ sx: (i % 20) * 16, sy: Math.floor(i / 20) * 16, cx: (i % 20) * 16 + 8, cy: Math.floor(i / 20) * 16 + 8, tw: 16, th: 16, t1: 0.2 + (i / 400) * 0.1, pieceId: "plate" });
  tiles.push({ sx: 0, sy: 0, t1: 0.25, pieceId: null });
  const tide = prepareFarFromTide({ tiles, tile: 16, core: [160, 160], coarse: false, until: ASSEMBLY_BEATS.clamp });
  assert.equal(tide.count, 400 * FAR_FROM_TIDE.split ** 2, "the plates' tiles only, each split");
  const draw = (q, calm = false) => {
    const calls = [];
    tide.draw(fakeContext(calls), q, calm, 1);
    return { calls, ...tide.drawn };
  };
  // Before the first nanite flies, and after the last lock: nothing.
  assert.equal(draw(0.2 - FAR_FROM_TIDE.lead - FAR_FROM_TIDE.flight - FAR_FROM_TIDE.stagger - 0.001).calls.length, 0);
  assert.equal(draw(0.31 + FAR_FROM_TIDE.lock).calls.filter(([name]) => name === "rect").length, 0);
  // Ahead of the first landing: streams only.
  const early = draw(0.2 - FAR_FROM_TIDE.lead - FAR_FROM_TIDE.stagger - 0.004);
  assert.ok(early.stream > 0 && early.coat === 0 && early.lock === 0);
  // Mid-wave: the coat with a lit edge ahead and locks behind.
  const mid = draw(0.25);
  assert.ok(mid.coat > 0 && mid.dock > 0 && mid.lock > 0 && mid.stream > 0);
  assert.ok(mid.dock < mid.coat, "the lit edge is the front, not the coat");
  // The coat is a band of the wave, never the whole plate at once.
  assert.ok(mid.coat < tide.count * 0.5);
  // A calm frame keeps the coat and drops the transients.
  const calm = draw(0.25, true);
  assert.equal(calm.coat, mid.coat);
  assert.equal(calm.dock + calm.lock + calm.stream, 0);
  // Closed form: the same frame whichever way it is reached.
  draw(0.29);
  assert.deepEqual(draw(0.25).calls, mid.calls);
  // Touch screens stream fewer nanites; the coat is whole.
  const touch = prepareFarFromTide({ tiles, tile: 16, core: [160, 160], coarse: true, until: ASSEMBLY_BEATS.clamp });
  const calls = [];
  touch.draw(fakeContext(calls), 0.25, false, 1);
  assert.equal(touch.drawn.coat, mid.coat);
  assert.ok(touch.drawn.stream < mid.stream);
});

test("a nanite eases into its place: quick at first, settling in, never a straight even move", () => {
  const out = [0, 0];
  const at = (a) => {
    farFromTidePath(300, 400, 0.6, 120, 1.8, a, 0.25, out);
    return [out[0], out[1]];
  };
  assert.deepEqual(at(1), [300, 400], "docked exactly on its tile");
  const far = Math.hypot(at(0)[0] - 300, at(0)[1] - 400);
  assert.ok(far > 90);
  const d = (a) => Math.hypot(at(a)[0] - 300, at(a)[1] - 400);
  // Ease out: the first half of the flight covers most of the way.
  assert.ok(d(0.5) < far * 0.35);
  const firstStep = Math.hypot(at(0.1)[0] - at(0)[0], at(0.1)[1] - at(0)[1]);
  const lastStep = Math.hypot(at(1)[0] - at(0.9)[0], at(1)[1] - at(0.9)[1]);
  assert.ok(lastStep < firstStep * 0.2, "it settles in");
  // Not a straight line: the mid-flight point is off the chord.
  const [x0, y0] = at(0);
  const [xm, ym] = at(0.35);
  const cross = Math.abs((300 - x0) * (ym - y0) - (400 - y0) * (xm - x0)) / far;
  assert.ok(cross > 6, "it turns in on its spiral");
});

test("the engine: FAR FROM alone has the form change; the scene's own beats are as they were", () => {
  const config = farFromAssemblyConfig();
  assert.equal(typeof config.formShift?.create, "function");
  assert.equal(config.formShift.visible, FAR_FROM_SHIFT.visible);
  const engine = readFileSync(new URL("../src/lib/rexonance-resonance.js", import.meta.url), "utf8");
  // Every hook is behind the kit: without it the engine never asks.
  assert.match(engine, /const formShiftKit = config\.formShift \?\? null;/);
  assert.match(engine, /if \(formShiftKit && requestFormShift\(\)\) return;/);
  assert.match(engine, /if \(formShift\?\.active\) \{/);
  for (const page of ["rexonance-saga/rexonance-saga.tsx"])
    assert.doesNotMatch(readFileSync(new URL(`../src/components/${page}`, import.meta.url), "utf8"), /formShift/);
  for (const other of ["illusionculum-assembly-engine.ts", "meta-unitas-rx-engine.ts"])
    assert.doesNotMatch(readFileSync(new URL(`../src/lib/${other}`, import.meta.url), "utf8"), /formShift/);
  // The beats the change is built on.
  assert.deepEqual(ASSEMBLY_BEATS.form, [0.915, 0.975]);
  assert.deepEqual(ASSEMBLY_BEATS.motes, [0.07, 0.16]);
});
