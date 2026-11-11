// Rexonance's leave (owner, 2026-11-11): the retract over the finished suit
// (or the short fade where there is no skin to play it) and every way out of
// it — over, the reader moving the playhead (a scroll, the auto movie's
// scrubber, the lab's slider) slowly or fast, the one who asked calling it
// off, the scene stopping. The one who asked is answered exactly once and
// nothing of the leave is left behind (src/lib/rexonance-suit-leave.ts, the
// surge layer's wiring, the movie's and the lab's side of the question).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LEAVE_FADE_MS,
  LEAVE_FROM,
  LEAVE_HOLD_MS,
  LEAVE_SLACK,
  SEEK_JUMP,
  SuitLeave,
  isSeek,
} from "../src/lib/rexonance-suit-leave.ts";
import { SKIN_RETRACT_FADE_MS, SKIN_RETRACT_MS } from "../src/lib/rexonance-suit-skin.ts";
import {
  MOVIE_LEAVE_CANCEL_EVENT,
  MOVIE_LEAVE_EVENT,
  MOVIE_SEEK_STEPS,
} from "../src/lib/assembly-movie.ts";
import {
  LAB_LEAVE_CANCEL_EVENT,
  LAB_LEAVE_EVENT,
  LAB_LEAVE_FROM,
  LAB_LEAVE_WAIT_MS,
  createLabLeave,
} from "../src/lib/transformation-lab-leave.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MS = SKIN_RETRACT_MS;
/** A leave and the answers it gave. */
const asked = (mode = "retract", now = 1000) => {
  const leave = new SuitLeave();
  const answers = [];
  assert.equal(leave.begin(mode, now, (ok) => answers.push(ok)), true);
  return { leave, answers };
};

test("the retract runs its length, answers once, and stands until the page has moved", () => {
  const { leave, answers } = asked();
  assert.equal(leave.active, true);
  assert.equal(leave.mode, "retract");
  // A second question while it plays starts nothing.
  assert.equal(leave.begin("retract", 1100, () => answers.push("second")), false);
  for (let now = 1000; now < 1000 + MS; now += 16) {
    assert.equal(leave.step(now, 1, true, MS), "play");
    assert.equal(leave.ms, now - 1000);
    assert.deepEqual(answers, []);
  }
  // Over: the one who asked goes on; the bare body stands (the page is moving).
  assert.equal(leave.step(1000 + MS, 1, true, MS), "hold");
  assert.deepEqual(answers, [true]);
  assert.equal(leave.over, true);
  assert.equal(leave.step(1000 + MS + 16, 1, true, MS), "hold");
  // The page moved: the scene is the playhead's again, and nothing is asked twice.
  assert.equal(leave.step(1000 + MS + 32, 0, true, MS), "moved");
  assert.equal(leave.active, false);
  assert.equal(leave.over, false);
  assert.equal(leave.step(1000 + MS + 48, 0, true, MS), "");
  assert.deepEqual(answers, [true]);
  // The next leave is a new one.
  assert.equal(leave.begin("retract", 5000, (ok) => answers.push(ok)), true);
  assert.equal(leave.step(5016, 0.99, true, MS), "play");
  assert.equal(leave.ms, 16);
});

test("a page that never moves is not held: the scene is the playhead's again", () => {
  const { leave, answers } = asked();
  assert.equal(leave.step(1000 + MS, 1, true, MS), "hold");
  assert.equal(leave.step(1000 + MS + LEAVE_HOLD_MS, 1, true, MS), "hold");
  assert.equal(leave.step(1000 + MS + LEAVE_HOLD_MS + 1, 1, true, MS), "moved");
  assert.equal(leave.active, false);
  assert.deepEqual(answers, [true]);
});

test("the seek slider moved during a retract: it ends at once, answered no, and nothing is stuck", () => {
  const { leave, answers } = asked();
  assert.equal(leave.step(1016, 1, true, MS), "play");
  assert.equal(leave.step(1400, 1, true, MS), "play");
  // The scrubber: the playhead is somewhere else.
  assert.equal(leave.step(1416, 0.42, true, MS), "moved");
  assert.deepEqual(answers, [false], "no play behind the reader's back");
  assert.equal(leave.active, false);
  assert.equal(leave.mode, "");
  // The frames after it are the scrub's own; a late end is nothing.
  assert.equal(leave.step(1432, 0.43, true, MS), "");
  assert.equal(leave.end(true), false);
  leave.finish();
  assert.deepEqual(answers, [false]);
});

test("a scroll's settling is not the reader; a playhead given directly has no such slack", () => {
  // The page's scroll: within the slack the retract plays on.
  {
    const { leave, answers } = asked();
    assert.equal(leave.step(1016, 0.995, true, MS), "play");
    assert.equal(leave.step(1032, 0.995 - LEAVE_SLACK * 0.9, true, MS), "play");
    assert.equal(leave.step(1048, 0.995 - LEAVE_SLACK * 1.1, true, MS), "moved");
    assert.deepEqual(answers, [false]);
  }
  // The lab's slider: its smallest step (0.001) is the reader's hand.
  {
    const { leave, answers } = asked();
    assert.equal(leave.step(1016, 1, true, MS, 0), "play");
    assert.equal(leave.step(1032, 0.999, true, MS, 0), "moved");
    assert.deepEqual(answers, [false]);
  }
  // The movie's scrubber: one step of it is under the scroll's slack, which
  // is why the movie also calls the leave off itself (below).
  assert.ok(1 / MOVIE_SEEK_STEPS < LEAVE_SLACK);
  assert.equal(LEAVE_SLACK, 0.012);
});

test("scrubbing fast through a retract: one answer, no leave revived, whatever the path", () => {
  let seed = 20261111;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let round = 0; round < 200; round += 1) {
    const { leave, answers } = asked("retract", 0);
    const moveAt = Math.floor(random() * (MS + 400));
    let moved = false;
    let now = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      now += 4 + random() * 40;
      // Still until the reader's hand lands; then anywhere else, every frame.
      const target = now < moveAt ? 1 : random() * 0.9;
      const step = leave.step(now, target, true, MS);
      if (step === "moved") moved = true;
      if (moved) assert.equal(leave.active, false, "ended for good");
      if (step === "play") assert.ok(leave.ms < MS, "the retract never plays past its length");
    }
    assert.equal(answers.length, 1, `round ${round}: answered exactly once`);
    // Before it was over the answer is no; after, the yes it already gave
    // (frames are at most 44 ms apart).
    if (moveAt < MS - 50) assert.equal(answers[0], false, `round ${round}`);
    if (moveAt > MS + 50) assert.equal(answers[0], true, `round ${round}`);
    assert.equal(leave.active, false);
    assert.equal(leave.step(now + 16, random(), true, MS), "");
  }
});

test("the skin's context lost mid-retract: the page moves on, the classic scene carries it", () => {
  const { leave, answers } = asked();
  assert.equal(leave.step(1300, 1, true, MS), "play");
  assert.equal(leave.step(1316, 1, false, MS), "moved");
  assert.deepEqual(answers, [true]);
  assert.equal(leave.active, false);
});

test("called off, or the scene stopping: ended whatever its state, answered once", () => {
  // Called off by the one who asked (the scrubber, the slider): a no.
  {
    const { leave, answers } = asked();
    leave.step(1200, 1, true, MS);
    assert.equal(leave.end(false), true);
    assert.deepEqual(answers, [false]);
    assert.equal(leave.active, false);
    assert.equal(leave.end(false), false);
    assert.deepEqual(answers, [false]);
  }
  // The scene stops (off screen, hidden): the page moves on as it was asked.
  {
    const { leave, answers } = asked();
    leave.step(1200, 1, true, MS);
    assert.equal(leave.end(true), true);
    assert.deepEqual(answers, [true]);
  }
  // After it was over: the answer already given stands.
  {
    const { leave, answers } = asked();
    leave.step(1000 + MS, 1, true, MS);
    assert.deepEqual(answers, [true]);
    assert.equal(leave.end(false), true);
    assert.deepEqual(answers, [true]);
    assert.equal(leave.over, false);
  }
});

test("the fade: over when its animations are, called off by a moved playhead before that", () => {
  assert.equal(LEAVE_FADE_MS, 250);
  assert.equal(SKIN_RETRACT_FADE_MS, LEAVE_FADE_MS);
  // The fade's end is its animations' (finish); the frames only watch the playhead.
  {
    const { leave, answers } = asked("fade");
    assert.equal(leave.step(1100, 1, true, Number.POSITIVE_INFINITY), "play");
    assert.equal(leave.step(1400, 1, true, Number.POSITIVE_INFINITY), "play");
    leave.finish();
    assert.deepEqual(answers, [true]);
    leave.finish();
    assert.deepEqual(answers, [true]);
    assert.equal(leave.step(1416, 1, true, Number.POSITIVE_INFINITY), "hold");
    // The page moved: the figure can be raised again.
    assert.equal(leave.step(1432, 0, true, Number.POSITIVE_INFINITY), "moved");
    assert.equal(leave.active, false);
    assert.deepEqual(answers, [true]);
  }
  // The reader's hand during the 250 ms.
  {
    const { leave, answers } = asked("fade");
    assert.equal(leave.step(1100, 1, true, Number.POSITIVE_INFINITY), "play");
    assert.equal(leave.step(1116, 0.6, true, Number.POSITIVE_INFINITY), "moved");
    assert.deepEqual(answers, [false]);
    leave.finish();
    assert.deepEqual(answers, [false]);
  }
  // The still tiers have no frames: the animations' end, then let go.
  {
    const { leave, answers } = asked("fade");
    leave.finish();
    assert.equal(leave.end(true), true);
    assert.deepEqual(answers, [true]);
    assert.equal(leave.active, false);
  }
});

test("a seek is told from a played frame", () => {
  assert.equal(isSeek(-1, 0.5), false, "the first frame is not a seek");
  // The auto movie at 2× and the lab at 2× move under a hundredth a frame.
  assert.equal(isSeek(0.5, 0.5 + (2 * 50) / 12000), false);
  assert.equal(isSeek(0.5, 0.5 + SEEK_JUMP * 1.01), true);
  assert.equal(isSeek(0.5, 0.5 - SEEK_JUMP * 1.01), true);
  assert.equal(isSeek(1, 0), true);
  assert.ok(SEEK_JUMP > (2 * 50) / 12000 && SEEK_JUMP <= 0.05);
});

test("the surge layer: one way out of a leave, and nothing of it left behind", () => {
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  // Every end goes through one place: answered, the streams dropped, the
  // fade's hold on the figure released.
  assert.match(
    surge,
    /const endLeave = \(ok: boolean\) => \{\s*if \(leave\.end\(ok\)\) \{\s*skin\?\.torrent\.clear\(\);\s*redraw = true;\s*\}\s*releaseFade\(\);\s*\};/,
  );
  // A leave that ends with the playhead where it was (called off on the
  // spot, or the page never moved) is drawn over at once: its last frame
  // never stays on the canvases with the scene hidden under it.
  assert.match(surge, /const due =\s*redraw \|\| moving \|\| busy \|\| leaving \|\|/);
  assert.match(surge, /if \(due\) \{\s*redraw = false;/);
  assert.match(
    surge,
    /const releaseFade = \(\) => \{\s*if \(fadeTimer\) window\.clearTimeout\(fadeTimer\);\s*if \(fadeFrame\) cancelAnimationFrame\(fadeFrame\);\s*fadeTimer = fadeFrame = 0;\s*for \(const animation of fading\) animation\.cancel\(\);\s*fading = \[\];\s*\};/,
  );
  // The reader's playhead ends it inside the frame: no stream in flight, and
  // a faded figure is raised only a frame after the scene has drawn.
  assert.match(
    surge,
    /if \(step === "moved"\) \{[\s\S]*?grown\?\.torrent\.clear\(\);\s*redraw = true;\s*if \(fading\.length && !fadeFrame\) fadeFrame = requestAnimationFrame\(releaseFade\);/,
  );
  // Over, the bare body stands with nothing in the air.
  assert.match(surge, /\} else if \(step === "hold" && retracting\) \{[\s\S]*?grown\?\.torrent\.clear\(\);/);
  // Called off by the one who asked.
  assert.match(surge, new RegExp(`const RETRACT_CANCEL_EVENT = "${MOVIE_LEAVE_CANCEL_EVENT}";`));
  assert.match(
    surge,
    /const onLeaveCancel = \(\) => \{\s*if \(!leave\.active\) return;\s*endLeave\(false\);\s*wake\(\);\s*\};/,
  );
  assert.match(surge, /runway\.addEventListener\(RETRACT_CANCEL_EVENT, onLeaveCancel\);/);
  assert.match(surge, /runway\.removeEventListener\(RETRACT_CANCEL_EVENT, onLeaveCancel\);/);
  // One at a time.
  assert.match(surge, /if \(typeof detail\?\.done !== "function" \|\| leave\.active\) return;/);
  // A seek drops the streams aimed at the front that was; with the skin off
  // screen none is kept alive (a stream counted live kept the scene drawing).
  assert.match(surge, /if \(isSeek\(lastQ, q\)\) grown\?\.torrent\.clear\(\);\s*lastQ = q;/);
  assert.match(surge, /\} else if \(grown\.torrent\.live\) grown\.torrent\.clear\(\);/);
  // The scene stopping, and the layer going (the lab's stage outlives it):
  // the leave ended, the flags and the canvases' opacity handed back.
  const stopAt = surge.indexOf("const stop = () => {");
  const stop = surge.slice(stopAt, surge.indexOf("const tick = (now: number) => {", stopAt));
  assert.match(stop, /skin\?\.torrent\.clear\(\);[\s\S]*?endLeave\(true\);\s*flagSkin\(false\);\s*showClassic\(1\);/);
  assert.match(
    surge,
    /runway\.removeEventListener\(RETRACT_CANCEL_EVENT, onLeaveCancel\);[\s\S]*?stop\(\);\s*flagCovered\(false\);/,
  );
  // Raised whole from under the skin (a seek to the finished suit, a leave
  // called off), the scene's canvases come back at once: the sheet's own
  // 240 ms fade-in would show the figure empty, the skin being gone already.
  assert.match(surge, /const snap = next === "" && Number\(classicShown\) < 0\.5;/);
  assert.match(surge, /element\.style\.transition = next \|\| snap \? "none" : "";/);
  assert.match(
    surge,
    /if \(classicShown === ""\) for \(const element of classicLayers\(\)\) element\.style\.transition = "";/,
  );
  assert.match(
    read("src/styles-rexonance-zenith.css"),
    /> :is\(\.rzn-canvas, \.rzn-field\) \{\s*transition: opacity 240ms/,
  );
  assert.match(
    surge,
    /stop\(\);\s*flagCovered\(false\);\s*if \(snapFrame\) cancelAnimationFrame\(snapFrame\);\s*for \(const element of classicLayers\(\)\) element\.style\.transition = "";/,
  );
  // Nothing holds the classic canvases' opacity against showClassic any more.
  assert.match(surge, /if \(next === classicShown\) return;/);
  assert.doesNotMatch(surge, /classicShown \|\| fadeTimer|=== classicShown \|\| fadeTimer/);
});

test("reduced motion and economy: the fade is an animation the reduced-motion sheet cannot cut", () => {
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  const fade = surge.slice(surge.indexOf("const fadeOut = ("), surge.indexOf("if (!live()) {\n        // The still tiers"));
  assert.ok(fade.length > 200);
  // (The sheet zeroes every transition's duration under reduced motion: an
  // inline transition was an instant hide.)
  assert.match(
    fade,
    /element\.animate\(\[\{ opacity: getComputedStyle\(element\)\.opacity \}, \{ opacity: 0 \}\], \{\s*duration: RETRACT_FADE_MS,\s*easing: "ease-out",\s*fill: "forwards",\s*\}\)/,
  );
  assert.doesNotMatch(fade, /style\.transition|style\.opacity/);
  // It ends with its own animations (a timer of the same length cut a late
  // start short), then the page moves; an animation that never runs is not
  // waited for.
  assert.match(fade, /void mine\[0\]\.finished\.then\(fadedOut, \(\) => undefined\);/);
  assert.match(fade, /fadeTimer = window\.setTimeout\(fadedOut, RETRACT_FADE_MS \+ 400\);/);
  assert.match(fade, /leave\.finish\(\);\s*fadeTimer = window\.setTimeout\(\(\) => endLeave\(true\), live\(\) \? 600 : 34\);/);
  // The still tiers answer only for the finished figure in view.
  assert.match(surge, /if \(!visible \|\| !still \|\| !reducedMotion\(\)\) return;/);
  assert.match(
    surge,
    /const reducedMotion = \(\) =>\s*Boolean\(globalThis\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\.matches\) \|\|\s*document\.documentElement\.dataset\.worldEffects === "economy";/,
  );
});

test("the auto movie's scrubber during the suit's leave: the play is dropped and the runway told", async () => {
  assert.equal(MOVIE_LEAVE_CANCEL_EVENT, "rexonance:assembly-leave-cancel");
  assert.notEqual(MOVIE_LEAVE_CANCEL_EVENT, MOVIE_LEAVE_EVENT);
  const movie = read("src/lib/assembly-movie.ts");
  assert.match(
    movie,
    /const dropLeave = \(\) => \{\s*if \(!leaving\) return;\s*leaving = 0;\s*cancelLater\(leaveTimer\);\s*leaveTimer = 0;\s*send\(MOVIE_LEAVE_CANCEL_EVENT\);\s*\};/,
  );
  const seek = movie.slice(movie.indexOf("const onSeekInput = () => {"), movie.indexOf("const onSeekDown"));
  assert.match(seek, /dropLeave\(\);\s*measure\(\);/);
  const reader = movie.slice(movie.indexOf("const yieldToReader = () => {"), movie.indexOf("const onWheel"));
  assert.match(reader, /dropLeave\(\);/);
});

test("the lab's replay asks the stage, waits for the suit, and is called off by the reader's hand", () => {
  assert.equal(LAB_LEAVE_EVENT, MOVIE_LEAVE_EVENT);
  assert.equal(LAB_LEAVE_CANCEL_EVENT, MOVIE_LEAVE_CANCEL_EVENT);
  assert.equal(LAB_LEAVE_FROM, LEAVE_FROM);
  let timers = [];
  const clock = {
    setTimeout: (callback, ms) => {
      const id = { callback, ms };
      timers.push(id);
      return id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((timer) => timer !== id);
    },
  };
  // A stage that does not take the question (every other rider): at once.
  {
    const leave = createLabLeave(clock);
    const stage = new EventTarget();
    const seen = [];
    stage.addEventListener(LAB_LEAVE_EVENT, (event) => seen.push(event));
    let ran = 0;
    assert.equal(leave.ask(stage, () => (ran += 1)), false);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].cancelable, true);
    assert.equal(typeof seen[0].detail.done, "function");
    assert.equal(leave.pending, false);
    assert.equal(ran, 0, "the caller moves, not the leave");
    assert.equal(timers.length, 0);
    // A late answer from a stage that did not take it is nothing.
    seen[0].detail.done(true);
    assert.equal(ran, 0);
    assert.equal(leave.ask(null, () => (ran += 1)), false);
  }
  // Rexonance's stage: waited for, then the lab moves — once.
  {
    const leave = createLabLeave(clock);
    const stage = new EventTarget();
    let done = null;
    let cancelled = 0;
    stage.addEventListener(LAB_LEAVE_EVENT, (event) => {
      event.preventDefault();
      done = event.detail.done;
    });
    stage.addEventListener(LAB_LEAVE_CANCEL_EVENT, () => (cancelled += 1));
    let ran = 0;
    assert.equal(leave.ask(stage, () => (ran += 1)), true);
    assert.equal(leave.pending, true);
    assert.equal(ran, 0);
    // A second press while it leaves asks nothing more.
    const first = done;
    assert.equal(leave.ask(stage, () => (ran += 100)), true);
    assert.equal(done, first);
    done(true);
    assert.equal(ran, 1);
    assert.equal(leave.pending, false);
    assert.equal(timers.length, 0, "no timer left");
    done(true);
    assert.equal(ran, 1, "an answer twice is one answer");
    // Nothing to call off any more.
    leave.cancel();
    assert.equal(cancelled, 0);
  }
  // The slider during the retract: called off, the stage told, no move after.
  {
    const leave = createLabLeave(clock);
    const stage = new EventTarget();
    let done = null;
    let cancelled = 0;
    stage.addEventListener(LAB_LEAVE_EVENT, (event) => {
      event.preventDefault();
      done = event.detail.done;
    });
    stage.addEventListener(LAB_LEAVE_CANCEL_EVENT, () => {
      cancelled += 1;
      // (The stage answers its leave as it ends it.)
      done(false);
    });
    let ran = 0;
    assert.equal(leave.ask(stage, () => (ran += 1)), true);
    leave.cancel();
    assert.equal(cancelled, 1);
    assert.equal(leave.pending, false);
    assert.equal(timers.length, 0);
    done(true);
    assert.equal(ran, 0, "the playhead stays under the reader's hand");
    // Scrubbing on: nothing more to call off.
    leave.cancel();
    leave.cancel();
    assert.equal(cancelled, 1);
    // The next replay asks again.
    assert.equal(leave.ask(stage, () => (ran += 1)), true);
    done(true);
    assert.equal(ran, 1);
  }
  // The stage says the reader moved (its own check): no move.
  {
    const leave = createLabLeave(clock);
    const stage = new EventTarget();
    let done = null;
    stage.addEventListener(LAB_LEAVE_EVENT, (event) => {
      event.preventDefault();
      done = event.detail.done;
    });
    let ran = 0;
    leave.ask(stage, () => (ran += 1));
    done(false);
    assert.equal(ran, 0);
    assert.equal(leave.pending, false);
  }
  // A stage that took the question and never answers is not waited for.
  {
    const leave = createLabLeave(clock);
    const stage = new EventTarget();
    stage.addEventListener(LAB_LEAVE_EVENT, (event) => event.preventDefault());
    let ran = 0;
    leave.ask(stage, () => (ran += 1));
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, LAB_LEAVE_WAIT_MS);
    assert.ok(LAB_LEAVE_WAIT_MS > SKIN_RETRACT_MS + 1000);
    timers[0].callback();
    assert.equal(ran, 1);
    assert.equal(leave.pending, false);
  }
});

test("the lab plays Rexonance's suit-up as the page does: the page's own layer, loaded for that rider only", () => {
  const stage = read("src/components/transformation-lab/lab-stage.tsx");
  // The page's surge layer itself (never a copy), on the lab's playhead.
  assert.match(
    stage,
    /if \(rider !== "rexonance"\) return;\s*void import\("@\/components\/rexonance-saga\/rexonance-suit-surge"\)\.then\(\s*\(layer\) => \{\s*if \(cancelled\) return;\s*dropSurge = layer\.mountScrollSurge\(runway, \{\s*box: runway\.querySelector<HTMLElement>\("\.lab-viewport"\),\s*progress: \(\) => playhead\.current,\s*\}\);/,
  );
  // Fetched on demand: no static import of the layer, the skin or the
  // crescendo anywhere in the lab, so no other rider's stage (and no other
  // route) downloads them.
  for (const path of [
    "src/components/transformation-lab/lab-stage.tsx",
    "src/components/transformation-lab/transformation-lab.tsx",
    "src/lib/transformation-lab-engine.ts",
    "src/lib/transformation-lab-rexonance.ts",
    "src/lib/transformation-lab-leave.ts",
    "src/routes/transformation-lab.tsx",
  ])
    assert.doesNotMatch(
      read(path),
      /^import [^;]*(rexonance-suit-surge|rexonance-suit-skin|rexonance-suit-crescendo)/m,
      path,
    );
  assert.equal(stage.match(/import\(/g).length, 2, "the engine's and the layer's, both dynamic");
  // Its canvases are on the stage only for Rexonance, round the scene's own.
  assert.match(stage, /const surge = rider === "rexonance";/);
  assert.match(
    stage,
    /\{surge && \(\s*<canvas className="rzn-surge is-back" aria-hidden="true" width=\{0\} height=\{0\} \/>\s*\)\}\s*<canvas\s*className="rzn-canvas"[\s\S]*?\/>\s*\{surge && \(\s*<>\s*<i className="rzn-surge is-skin" aria-hidden="true">\s*<canvas width=\{0\} height=\{0\} \/>\s*<\/i>\s*<canvas className="rzn-surge is-front" aria-hidden="true" width=\{0\} height=\{0\} \/>/,
  );
  // The layer goes before the engine: the scene's canvases are handed back
  // as they were for the next rider.
  assert.match(stage, /dropSurge\?\.\(\);\s*dispose\?\.\(\);/);
  // The layer itself: the page's hook is the same mount with no options.
  const surge = read("src/components/rexonance-saga/rexonance-suit-surge.tsx");
  assert.match(
    surge,
    /export function useScrollSurge\(runwayRef: RefObject<HTMLDivElement \| null>\) \{\s*useEffect\(\(\) => \{\s*const runway = runwayRef\.current;\s*return runway \? mountScrollSurge\(runway\) : undefined;\s*\}, \[runwayRef\]\);\s*\}/,
  );
  assert.match(surge, /const layerBox = options\.box \?\? frameBox;/);
  // A playhead given directly is read as it is: no scroll, no easing.
  assert.match(surge, /const raw = direct\s*\? Math\.min\(1, Math\.max\(0, Number\(direct\(\)\) \|\| 0\)\)/);
  assert.match(surge, /if \(direct \|\| shown < 0 \|\| Math\.abs\(target - shown\) > 0\.2\) shown = target;/);
  // The lab holds the figure at one size (its zooms, its side-by-side): the
  // page's lean in is the page's.
  assert.match(surge, /const push = coarse \|\| direct \? 1 : scrollPush\(q\);/);
  // The page's own pin is never scrolled back for a stage that has none.
  assert.match(surge, /if \(!direct && box\.top < -0\.4 \* box\.height && travel > 0\)/);
  // The safeguards are the layer's own, so the lab has them too: live only
  // (never under reduced motion or economy), paused off screen and hidden.
  assert.match(
    surge,
    /const live = \(\) =>\s*runway\.dataset\.rznState === "live" && !document\.hidden && visible && !reducedMotion\(\);/,
  );
  // The lab's sheet places the layer's canvases; no other rider has them.
  const sheet = read("src/styles-transformation-lab.css");
  assert.match(sheet, /\.lab-engine \.rzn-surge \{\s*position: absolute;\s*inset: 0;[\s\S]*?pointer-events: none;\s*\}/);
});

test("the lab's replays over the finished suit: 最初へ, 再生 from the end, the loop's wrap", () => {
  const lab = read("src/components/transformation-lab/transformation-lab.tsx");
  // A comparison stands still on both sides and asks nothing.
  assert.match(
    lab,
    /const leaveThen = useCallback\(\s*\(then: \(\) => void\) => \{\s*if \(current\.current\.compare\) return false;\s*const stage = stages\.current\?\.querySelector<HTMLElement>\("\.lab-side-a \.lab-engine"\) \?\? null;\s*return leave\.ask\(stage, then\);/,
  );
  // 最初へ over the finished suit.
  assert.match(
    lab,
    /const rewind = \(\) => \{\s*if \(state\.progress >= LAB_LEAVE_FROM && leaveThen\(\(\) => change\(\{ progress: 0 \}\)\)\) \{\s*setPlaying\(false\);\s*return;\s*\}\s*change\(\{ progress: 0 \}\);\s*\};/,
  );
  assert.match(lab, /<button onClick=\{rewind\}>最初へ<\/button>/);
  // 再生 from the end, forward.
  assert.match(lab, /if \(direction > 0 && leaveThen\(restart\)\) return;\s*restart\(\);/);
  // The loop's wrap, forward: the playhead held at the end meanwhile.
  assert.match(
    lab,
    /if \(\s*direction > 0 &&\s*leaveThen\(\(\) => \{\s*wrap\(\);\s*if \(stopped\) return;\s*previous = 0;\s*frame = requestAnimationFrame\(tick\);\s*\}\)\s*\)\s*return;\s*wrap\(\);/,
  );
  // The reader's hand on the playhead or the stage calls it off first.
  assert.match(
    lab,
    /if \("progress" in patch \|\| "rider" in patch \|\| "compare" in patch\) leave\.cancel\(\);/,
  );
  assert.match(lab, /writer\.cancel\(\);\s*leave\.cancel\(\);\s*setState\(parseLabState\(location\.search\)\);/);
  assert.match(lab, /useEffect\(\(\) => \(\) => leave\.cancel\(\), \[leave\]\);/);
});
