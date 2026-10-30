import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  ILLUSIONCULUM_ACCENT_BEATS,
  ILLUSIONCULUM_ACCENT_GROUPS,
  createIllusionculumAccents,
  decodeIllusionculumSeam,
  illusionculumAccentBudget,
} from "../src/lib/illusionculum-assembly-accents.ts";
import { ASSEMBLY_BEATS } from "../src/lib/rexonance-resonance.js";
import {
  ILLUSIONCULUM_SUIT_MARKS,
  ILLUSIONCULUM_SUIT_PIECES,
  ILLUSIONCULUM_SUIT_SEAMS,
  ILLUSIONCULUM_SUIT_SIZE,
} from "../src/lib/illusionculum-suit.ts";
import { ILLUSIONCULUM_ENTRY_CLOCK } from "../src/lib/illusionculum-entry.ts";

/** A 2D context that records what is drawn (enough for the accents). */
function recorder() {
  const log = [];
  const gradient = { addColorStop() {} };
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    beginPath() {},
    closePath() {},
    moveTo(x, y) {
      log.push(["m", Math.round(x * 100), Math.round(y * 100)]);
    },
    lineTo(x, y) {
      log.push(["l", Math.round(x * 100), Math.round(y * 100)]);
    },
    rect(x, y, w) {
      log.push(["r", Math.round(x * 100), Math.round(y * 100), Math.round(w * 100)]);
    },
    ellipse(x, y, rx) {
      log.push(["e", Math.round(x), Math.round(y), Math.round(rx)]);
    },
    fill() {
      log.push(["fill", this.globalAlpha.toFixed(3)]);
    },
    stroke() {
      log.push(["stroke", this.globalAlpha.toFixed(3)]);
    },
    fillRect(x, y, w, h) {
      log.push(["fillRect", this.globalAlpha.toFixed(3), Math.round(w), Math.round(h)]);
    },
    createRadialGradient() {
      return gradient;
    },
  };
  return { context, log };
}

const make = (motes = 400) =>
  createIllusionculumAccents({
    size: ILLUSIONCULUM_SUIT_SIZE,
    pieces: ILLUSIONCULUM_SUIT_PIECES,
    core: ILLUSIONCULUM_SUIT_MARKS.core,
    seams: ILLUSIONCULUM_SUIT_SEAMS,
    budget: { motes, sparks: 12 },
  });

const frame = (accents, progress, calm = false) => {
  const { context, log } = recorder();
  accents.back(context, progress, calm, 693, 1040);
  accents.front(context, progress, calm, 693, 1040);
  assert.equal(context.globalCompositeOperation, "source-over");
  assert.equal(context.globalAlpha, 1);
  return log;
};

test("the accents read the engine's beats", () => {
  assert.deepEqual([...ILLUSIONCULUM_ACCENT_BEATS.deus], ASSEMBLY_BEATS.deus);
  assert.deepEqual([...ILLUSIONCULUM_ACCENT_BEATS.rexonance], ASSEMBLY_BEATS.rexonance);
  assert.equal(ILLUSIONCULUM_ACCENT_BEATS.clamp, ASSEMBLY_BEATS.clamp);
  assert.ok(ILLUSIONCULUM_ACCENT_BEATS.end <= ASSEMBLY_BEATS.form[1]);
  // Every plate of the suit belongs to one of the lock groups.
  const groups = new Set(ILLUSIONCULUM_ACCENT_GROUPS.flatMap((group) => group.groups));
  for (const piece of ILLUSIONCULUM_SUIT_PIECES) assert.ok(groups.has(piece.group), piece.id);
});

test("every plate's seam decodes to an outline inside the frame", () => {
  let loops = 0;
  for (const piece of ILLUSIONCULUM_SUIT_PIECES) {
    for (const loop of decodeIllusionculumSeam(ILLUSIONCULUM_SUIT_SEAMS[piece.id])) {
      loops += 1;
      assert.ok(loop.length >= 6, piece.id);
      for (let k = 0; k < loop.length; k += 2) {
        assert.ok(loop[k] >= -2 && loop[k] <= ILLUSIONCULUM_SUIT_SIZE.width + 2, piece.id);
        assert.ok(loop[k + 1] >= -2 && loop[k + 1] <= ILLUSIONCULUM_SUIT_SIZE.height + 2, piece.id);
      }
    }
  }
  assert.ok(loops >= 30);
  assert.deepEqual(decodeIllusionculumSeam(undefined), []);
  assert.deepEqual(decodeIllusionculumSeam("!!"), []);
});

test("the budget scales with the device", () => {
  const env = (cores, memory) => ({
    navigator: { hardwareConcurrency: cores, deviceMemory: memory },
  });
  const desktop = illusionculumAccentBudget(env(8, 8), { compact: false, entry: false });
  const phone = illusionculumAccentBudget(env(6, 6), { compact: true, entry: false });
  const phoneEntry = illusionculumAccentBudget(env(6, 6), { compact: true, entry: true });
  const low = illusionculumAccentBudget(env(4, 2), { compact: true, entry: true });
  assert.ok(
    desktop.motes > phone.motes && phone.motes > phoneEntry.motes && phoneEntry.motes > low.motes,
  );
  assert.ok(phone.motes <= 500 && desktop.motes <= 1200);
  assert.ok(phone.sparks < desktop.sparks);
});

test("closed-form in the progress: the same frame however it was reached", () => {
  const a = make();
  const b = make();
  for (const p of [0.05, 0.3, 0.6, 0.85, 0.9]) frame(a, p);
  for (const p of [0.2, 0.388, 0.5, 0.87]) {
    assert.deepEqual(frame(a, p), frame(b, p));
  }
});

test("nothing is drawn before the start or after the form changes", () => {
  const accents = make();
  assert.equal(frame(accents, 0).length, 0);
  assert.equal(frame(accents, ILLUSIONCULUM_ACCENT_BEATS.end).length, 0);
  assert.equal(frame(accents, 1).length, 0);
  assert.ok(frame(accents, 0.3).length > 100);
});

test("the locks' glows are local, rare and absent from a resting frame", () => {
  const accents = make();
  const W = ILLUSIONCULUM_SUIT_SIZE.width;
  const glowAt = (p, calm = false) =>
    frame(accents, p, calm).filter((entry) => entry[0] === "fillRect");
  // The entry clock's time for a progress (the inverse of its table).
  const msOf = (p) => {
    const clock = ILLUSIONCULUM_ENTRY_CLOCK;
    for (let i = 1; i < clock.length; i += 1) {
      const [t1, p1] = clock[i];
      const [t0, p0] = clock[i - 1];
      if (p <= p1) return t0 + ((t1 - t0) * (p - p0)) / (p1 - p0);
    }
    return clock[clock.length - 1][0];
  };
  const starts = [];
  let was = false;
  for (let p = 0; p < 1; p += 0.0005) {
    const glows = glowAt(p);
    for (const [, alpha, w] of glows) {
      assert.ok(Number(alpha) <= 0.45, `glow alpha at ${p}`);
      // Local: a group's glow under the figure's width; the seal's at most 1.25 W.
      assert.ok(w <= W * 1.25, `glow size at ${p}`);
    }
    const now = glows.length > 0;
    if (now && !was) starts.push(p);
    was = now;
  }
  assert.equal(starts.length, 5, `glows: ${starts}`);
  for (let i = 1; i < starts.length; i += 1)
    assert.ok(msOf(starts[i]) - msOf(starts[i - 1]) >= 600, "glows apart on the entry clock");
  // Only one is larger than the figure's half width: the seal's.
  for (const p of starts.slice(0, 4)) assert.ok(glowAt(p + 0.001).every(([, , w]) => w < W * 1.25));
  assert.equal(glowAt(starts[4] + 0.001, true).length, 0);
});

test("the engine mounts the accents at the device's budget", () => {
  const source = readFileSync(
    new URL("../src/lib/illusionculum-assembly-engine.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /config\.accents = createIllusionculumAccents\(/);
  assert.match(
    source,
    /illusionculumAccentBudget\(environment, \{ compact, entry: Boolean\(options\.entry\) \}\)/,
  );
});
