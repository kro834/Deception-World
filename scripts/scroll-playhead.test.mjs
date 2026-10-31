import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PLAYHEAD, ScrollPlayhead } from "../src/lib/scroll-playhead.js";

/* The scroll suit-up's playhead (owner, 2026-10-23: 「スクロールに伴ってより
   滑らかに変身されるようにし」): a critically damped spring, integrated in
   closed form each frame, that the engine (rexonance-resonance.js) draws in
   place of the scroll's own progress. These pin its contract: it converges
   and settles exactly on the target, it is frame-rate independent, its
   velocity is continuous across notches, a fling is followed within the lag
   and a cut snaps, a hitch slows instead of jumping, and a frame's step
   allocates nothing. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const FRAME = 1000 / 60;

/** Steps the head toward `target` for `ms` at `hz`; the positions drawn. */
function run(head, target, ms, hz, omega = PLAYHEAD.omega) {
  const dt = 1000 / hz;
  const positions = [];
  for (let k = 0; k < Math.round(ms / dt); k += 1) positions.push(head.follow(target, dt, omega));
  return positions;
}

test("a notch converges on its target and settles exactly there, at rest, from then on", () => {
  const head = new ScrollPlayhead();
  head.snap(0.3);
  const notch = 0.034;
  const positions = run(head, 0.3 + notch, 400, 60);
  // Monotone toward the target, never past it (critically damped, from rest).
  for (let k = 1; k < positions.length; k += 1)
    assert.ok(positions[k] >= positions[k - 1] - 1e-12 && positions[k] <= 0.3 + notch + 1e-12);
  assert.equal(head.x, 0.3 + notch, "lands on the target itself");
  assert.equal(head.v, 0, "at rest");
  assert.ok(head.settled);
  const landed = positions.findIndex((x) => x === 0.3 + notch);
  assert.ok(landed > 3 && landed <= 12, `settled over ${landed} frames (about 170 ms)`);
  // 95% of the notch within about 150 ms.
  const at150 = positions[Math.round(150 / FRAME) - 1];
  assert.ok(at150 >= 0.3 + notch * 0.9, `${at150}`);
  // Resting frames return the target exactly, unchanged.
  assert.equal(head.follow(0.3 + notch, FRAME), 0.3 + notch);
  assert.ok(head.settled);
});

test("the integration is exact in time: 30, 60, 120 and 240 Hz draw the same positions at the same instants", () => {
  const reference = new ScrollPlayhead();
  reference.snap(0.2);
  const target = 0.245;
  const ms = 100;
  const at120 = run(reference, target, ms, 240);
  for (const hz of [30, 60, 120]) {
    const head = new ScrollPlayhead();
    head.snap(0.2);
    const positions = run(head, target, ms, hz);
    const stride = 240 / hz;
    positions.forEach((x, k) => {
      const same = at120[(k + 1) * stride - 1];
      assert.ok(Math.abs(x - same) < 1e-9, `${hz} Hz frame ${k}: ${x} vs ${same}`);
    });
  }
});

test("velocity is continuous: a second notch mid-flight continues the motion instead of restarting it", () => {
  const head = new ScrollPlayhead();
  head.snap(0);
  const first = run(head, 0.034, 60, 60);
  const before = first.at(-1) - first.at(-2);
  // The second notch lands: the next frame's step is near the last one's,
  // not a fresh start from rest (no sawtooth).
  const x = head.follow(0.068, FRAME);
  const after = x - first.at(-1);
  assert.ok(after > before * 0.8, `${after} after ${before}`);
  // Two notches 60 ms apart still arrive as one motion: steps never jump.
  const rest = run(head, 0.068, 300, 60);
  const steps = [after, ...rest.map((v, k) => v - (k ? rest[k - 1] : x))];
  assert.ok(Math.max(...steps) < 0.012, `largest step ${Math.max(...steps)}`);
  assert.equal(head.x, 0.068);
});

test("a fling is followed within the lag and caught up in one ease; a cut snaps", () => {
  const head = new ScrollPlayhead();
  head.snap(0.1);
  // A fling: the scroll gains .03 a frame for ten frames.
  let target = 0.1;
  for (let k = 0; k < 10; k += 1) {
    target += 0.03;
    const x = head.follow(target, FRAME);
    assert.ok(target - x <= PLAYHEAD.lag + 1e-12, `trails by ${target - x}`);
    assert.ok(x > head.x - 1e-12);
  }
  assert.ok(target - head.x > 0.03, "trailing the fling by more than a frame's worth");
  // The scroll stops: the head arrives without a jump and settles.
  const positions = run(head, target, 500, 60);
  for (let k = 1; k < positions.length; k += 1)
    assert.ok(positions[k] - positions[k - 1] < 0.02, `step ${positions[k] - positions[k - 1]}`);
  assert.equal(head.x, target);
  // A cut (a link, a restore): the head snaps there, at rest.
  assert.equal(head.follow(0.9, FRAME), 0.9);
  assert.equal(head.v, 0);
  assert.ok(head.settled);
  // Nothing shown yet snaps too.
  const fresh = new ScrollPlayhead();
  assert.equal(fresh.follow(0.42, FRAME), 0.42);
  fresh.reset();
  assert.equal(fresh.x, -1);
  assert.equal(fresh.follow(0.1, FRAME), 0.1);
});

test("a hitch advances the head by at most dtMax of motion, and a sub-millisecond frame still moves it", () => {
  const slow = new ScrollPlayhead();
  slow.snap(0);
  const clamped = new ScrollPlayhead();
  clamped.snap(0);
  slow.follow(0.05, 400);
  clamped.follow(0.05, PLAYHEAD.dtMax);
  assert.equal(slow.x, clamped.x, "a 400 ms frame moves as a 50 ms one");
  const quick = new ScrollPlayhead();
  quick.snap(0);
  const tiny = quick.follow(0.05, 0.2);
  const min = new ScrollPlayhead();
  min.snap(0);
  assert.equal(tiny, min.follow(0.05, PLAYHEAD.dtMin));
  assert.ok(tiny > 0);
});

test("touch screens chase faster, and the engine draws the playhead in place of the scroll", () => {
  assert.ok(PLAYHEAD.omegaTouch > PLAYHEAD.omega);
  const fine = new ScrollPlayhead();
  fine.snap(0);
  const touch = new ScrollPlayhead();
  touch.snap(0);
  fine.follow(0.04, FRAME, PLAYHEAD.omega);
  touch.follow(0.04, FRAME, PLAYHEAD.omegaTouch);
  assert.ok(touch.x > fine.x);
  const engine = read("src/lib/rexonance-resonance.js");
  assert.match(engine, /import \{ PLAYHEAD, ScrollPlayhead \} from "\.\/scroll-playhead\.js";/);
  assert.match(engine, /const head = new ScrollPlayhead\(\);/);
  assert.match(
    engine,
    /shown = head\.follow\(progress, dt, coarse\.matches \? PLAYHEAD\.omegaTouch : PLAYHEAD\.omega\);/,
  );
  // The first live frame and a relayout snap; a still scene forgets the head.
  assert.match(engine, /\} else head\.snap\(progress\);/);
  assert.match(engine, /head\.reset\(\);/);
  // The HUD keeps reading the scroll itself; only the drawn frame is the playhead's.
  assert.match(engine, /draw\(shown, false, config\.directProgress \? 0 : step\);/);
  assert.match(engine, /updateHud\(progress\);/);
  // The old first-order chase and its snap from the ignition on are gone.
  assert.doesNotMatch(engine, /Math\.exp\(-dt \/ tau\)/);
  assert.doesNotMatch(engine, /lastProgress < ASSEMBLY_BEATS\.light\[0\]/);
});

test("a frame's step allocates nothing and reads no clock", () => {
  const source = read("src/lib/scroll-playhead.js");
  const start = source.indexOf("  follow(target, dtMs, omega = this.omega) {");
  assert.ok(start > 0);
  const body = source.slice(start, source.indexOf("\n  }\n", start));
  assert.doesNotMatch(body, /\bnew\b|\[\s*\]|\{\s*\}|=>|\.\.\.|\bmap\(|\bslice\(|`/);
  assert.doesNotMatch(body, /performance|Date\.now|requestAnimationFrame/);
  // Every frame is still closed-form in the progress it is drawn at: the
  // head holds only its position, velocity and target.
  const head = new ScrollPlayhead();
  assert.deepEqual(Object.keys(head).sort(), ["omega", "target", "v", "x"]);
});
