import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ILLUSIONCULUM_ENTRY_TIMINGS,
  ILLUSIONCULUM_ENTRY_CLOCK,
  ILLUSIONCULUM_ENTRY_HOLD_MS,
  ILLUSIONCULUM_ENTRY_CALL_TIMES,
  illusionculumEntryProgress,
} from "../src/lib/illusionculum-entry.ts";
import {
  ILLUSIONCULUM_ARMOUR_STAGING,
  illusionculumPlateDelay,
} from "../src/lib/illusionculum-choreography.ts";
import { planAssembly, planAssemblyGold } from "../src/lib/rexonance-resonance.js";
import { planAssemblyNanites, armorSeatLift } from "../src/lib/rexonance-assembly-nanites.js";
import {
  ILLUSIONCULUM_SUIT_PIECES,
  ILLUSIONCULUM_SUIT_SIZE,
  ILLUSIONCULUM_SUIT_MARKS,
  ILLUSIONCULUM_SUIT_TILE,
  ILLUSIONCULUM_SUIT_DRIVER,
  ILLUSIONCULUM_SUIT_GOLD_CELL,
  ILLUSIONCULUM_SUIT_GOLD_CELLS,
} from "../src/lib/illusionculum-suit.ts";
const pieces = ILLUSIONCULUM_SUIT_PIECES.map((p) => ({
  ...p,
  preset: ILLUSIONCULUM_SUIT_DRIVER.includes(p.id),
}));
const options = {
  size: ILLUSIONCULUM_SUIT_SIZE,
  pieces,
  core: ILLUSIONCULUM_SUIT_MARKS.core,
  visor: ILLUSIONCULUM_SUIT_MARKS.visor,
  maskTile: ILLUSIONCULUM_SUIT_TILE,
  tile: 12,
};
const plan = planAssembly(options);
const original = planAssemblyNanites({ ...options, plan });
const improved = planAssemblyNanites({ ...options, plan, staging: ILLUSIONCULUM_ARMOUR_STAGING });
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} ≈ ${expected}`);

test("the entry gives all four assembly beats 630ms and finishes before reveal, with a settled final hold", () => {
  const clock = ILLUSIONCULUM_ENTRY_CLOCK;
  assert.equal(illusionculumEntryProgress(-1), 0);
  for (const [ms, progress] of clock) close(illusionculumEntryProgress(ms), progress);
  for (let i = 3; i <= 6; i++) assert.equal(clock[i][0] - clock[i - 1][0], 630);
  assert.ok(clock.at(-1)[0] + ILLUSIONCULUM_ENTRY_HOLD_MS <= ILLUSIONCULUM_ENTRY_TIMINGS.cover);
  assert.equal(illusionculumEntryProgress(1e6), 0.95);
  let last = 0;
  for (let ms = 0; ms <= 5500; ms += 7) {
    const p = illusionculumEntryProgress(ms);
    assert.ok(Number.isFinite(p) && p >= last && p <= 0.95);
    last = p;
  }
  assert.equal(
    ILLUSIONCULUM_ENTRY_CALL_TIMES[3].start + ILLUSIONCULUM_ENTRY_CALL_TIMES[3].hold,
    clock.at(-1)[0],
  );
});

test("completed IC shells hold away from the body, then seat continuously and reversibly", () => {
  let staged = 0;
  for (let i = 0; i < improved.pieces.length; i++) {
    const p = improved.pieces[i],
      old = original.pieces[i];
    assert.equal(p.id, old.id);
    assert.equal(p.from, old.from);
    assert.equal(p.to, old.to);
    assert.equal(p.seatX, old.seatX);
    assert.equal(p.seatY, old.seatY);
    if (p.fixed || p.ornament) {
      assert.equal(p.contact, old.contact);
      assert.equal(p.lift, old.lift);
      continue;
    }
    staged++;
    close(p.depart - p.to, 0.012);
    close(p.contact - p.depart, 0.026);
    close(p.lift / old.lift, 1.65);
    close(armorSeatLift(p, (p.to + p.depart) / 2), 1 - p.seatHold);
    for (const boundary of [p.from, p.to, p.depart, p.contact])
      assert.ok(
        Math.abs(armorSeatLift(p, boundary - 1e-8) - armorSeatLift(p, boundary + 1e-8)) < 1e-5,
      );
    const positions = Array.from(
      { length: 101 },
      (_, n) => p.from + ((p.contact - p.from) * n) / 100,
    );
    const forward = positions.map((q) => armorSeatLift(p, q));
    assert.deepEqual(
      positions
        .reverse()
        .map((q) => armorSeatLift(p, q))
        .reverse(),
      forward,
    );
    assert.equal(armorSeatLift(p, p.contact), 0);
    assert.ok(p.contact < 0.86, `${p.id} seats before seal`);
    close(p.contact - old.contact, illusionculumPlateDelay(p));
  }
  assert.ok(staged >= 10);
});

test("IC gold waits for the longer seating stroke and retains a sorted deterministic plan", () => {
  const landed = new Map();
  for (const t of plan.tiles)
    if (t.pieceId) landed.set(t.pieceId, Math.max(landed.get(t.pieceId) ?? 0, t.t1));
  const gold = {
    atlas: "",
    cell: ILLUSIONCULUM_SUIT_GOLD_CELL,
    cells: ILLUSIONCULUM_SUIT_GOLD_CELLS,
    seatDelay: illusionculumPlateDelay,
  };
  const g = planAssemblyGold({ pieces, gold, landed });
  const nano = planAssemblyNanites({
    ...options,
    plan,
    gold: g,
    staging: ILLUSIONCULUM_ARMOUR_STAGING,
  });
  assert.ok(g.count > 0);
  for (let i = 1; i < g.count; i++) assert.ok(g.lock[i] >= g.lock[i - 1]);
  for (const p of nano.pieces)
    if (!p.fixed && !p.ornament && p.goldEnd > p.goldFirst) {
      assert.ok(p.g0 >= p.contact, `${p.id}: ${p.g0} >= ${p.contact}`);
      assert.ok(p.g1 < 0.9, `${p.id} completes gold before the seal is whole`);
    }
  assert.deepEqual(planAssemblyGold({ pieces, gold, landed }).lock, g.lock);
});

test("entry decorations share the renderer clock and the IC atlas remains opt-in", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const sequence = read("../src/components/illusionculum-saga/illusionculum-entry-sequence.tsx");
  assert.match(sequence, /animation\.startTime = now/);
  assert.doesNotMatch(sequence, /animation\.currentTime = elapsed|READY_WAIT/);
  assert.match(sequence, /playback\.complete\(\)/);
  assert.ok(
    sequence.indexOf('runway.dataset.rznLoad !== "ready"') <
      sequence.indexOf("playback.frame(now)"),
  );
  assert.match(sequence, /progress = illusionculumEntryProgress\(elapsed\)/);
  assert.match(sequence, /cancelAnimationFrame\(raf\)/);
  assert.match(
    read("../src/lib/illusionculum-assembly-engine.ts"),
    /cells: \{ \.\.\.kit\.REXONANCE_NANITE_CELLS, src: "\/illusionculum-nanites-20261027\/cells.webp" \}/,
  );
  assert.doesNotMatch(read("../src/lib/rexonance-nanites.ts"), /illusionculum-nanites/);
});

async function mountEntryClock({ ready = "preparing", failMount = false } = {}) {
  const { transpileModule, ModuleKind, ScriptTarget, JsxEmit } = await import("typescript");
  const { runInNewContext } = await import("node:vm");
  const entry = await import("../src/lib/illusionculum-entry.ts");
  const source = readFileSync(
    new URL(
      "../src/components/illusionculum-saga/illusionculum-entry-sequence.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const js = transpileModule(source + "\nexport { useEngineClock };", {
    compilerOptions: {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2022,
      jsx: JsxEmit.ReactJSX,
    },
  }).outputText;
  const queue = new Map();
  let next = 0,
    cleanup,
    disposed = 0,
    mounted = 0,
    engineProgress;
  const animation = {
    playCount: 0,
    pauseCount: 0,
    startTime: null,
    play() {
      this.playCount++;
    },
    pause() {
      this.pauseCount++;
    },
  };
  const runway = {
    dataset: { rznLoad: ready },
    frames: 0,
    dispatchEvent() {
      this.frames++;
    },
  };
  const scene = { getAnimations: () => [animation] };
  const playback = {
    state: "preparing",
    started: null,
    frames: 0,
    frame(now) {
      this.frames++;
      if (this.started === null) {
        this.started = now;
        this.state = "playing";
      }
      return now - this.started;
    },
    complete() {
      this.state = "complete";
    },
    skip() {
      this.state = "skipped";
    },
    fail() {
      this.state = "unavailable";
    },
  };
  const context = {
    exports: {},
    Event: class {},
    window: {
      requestAnimationFrame(fn) {
        queue.set(++next, fn);
        return next;
      },
      cancelAnimationFrame(id) {
        queue.delete(id);
      },
    },
    require(id) {
      if (id === "react")
        return {
          useEffect(fn) {
            cleanup = fn();
          },
        };
      if (id === "react/jsx-runtime") return {};
      if (id.includes("illusionculum-entry") && !id.includes("sequence")) return entry;
      if (id.includes("illusionculum-suit"))
        return { ILLUSIONCULUM_SUIT_SIZE: { width: 1000, height: 1500 } };
      if (id.includes("illusionculum-assembly-engine"))
        return {
          mountIllusionculumAssemblyEngine(_runway, _env, options) {
            if (failMount) throw new Error("renderer unavailable");
            mounted++;
            engineProgress = options.progress;
            return () => disposed++;
          },
        };
      throw new Error(`unexpected import ${id}`);
    },
  };
  runInNewContext(js, context);
  context.exports.useEngineClock({ current: runway }, { current: scene }, playback);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    runway,
    playback,
    animation,
    queue,
    step(now) {
      const callbacks = [...queue.values()];
      queue.clear();
      callbacks.forEach((fn) => fn(now));
    },
    cleanup: () => cleanup(),
    progress: () => engineProgress?.(),
    get disposed() {
      return disposed;
    },
    get mounted() {
      return mounted;
    },
  };
}

test("a cold renderer consumes no entry time; decorations start once and completion follows the final settled frame", async () => {
  const clock = await mountEntryClock();
  clock.step(10);
  clock.step(500);
  clock.step(2800);
  assert.equal(clock.playback.frames, 0);
  assert.equal(clock.animation.playCount, 0);
  assert.equal(clock.progress(), 0);
  clock.runway.dataset.rznLoad = "ready";
  clock.step(3000);
  assert.equal(clock.playback.started, 3000);
  assert.equal(clock.progress(), 0);
  assert.equal(clock.animation.startTime, 3000);
  clock.step(4430);
  close(clock.progress(), 0.275);
  clock.step(7740);
  assert.equal(clock.progress(), 0.95);
  assert.equal(clock.playback.state, "playing");
  clock.step(7880);
  assert.equal(clock.playback.state, "complete");
  assert.equal(clock.animation.playCount, 1);
  assert.equal(clock.queue.size, 0);
  clock.cleanup();
  assert.equal(clock.disposed, 1);
});

test("failed, static and cancelled entries release the renderer instead of jumping into mid-assembly", async () => {
  const error = await mountEntryClock({ failMount: true });
  assert.equal(error.playback.state, "unavailable");
  error.step(1000);
  assert.equal(error.playback.frames, 0);
  assert.equal(error.queue.size, 0);
  error.cleanup();
  for (const state of ["static", "cancelled"]) {
    const clock = await mountEntryClock({ ready: state === "static" ? "static" : "preparing" });
    if (state === "cancelled") clock.playback.state = "cancelled";
    clock.step(900);
    assert.equal(clock.playback.state, state === "static" ? "skipped" : "cancelled");
    assert.equal(clock.playback.frames, 0);
    assert.equal(clock.disposed, 1);
    clock.cleanup();
    assert.equal(clock.disposed, 1);
  }
});
