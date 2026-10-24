import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  createMetaUnitasEntryPlayback,
  META_UNITAS_ENTRY_PREPARE_MS,
} from "../src/lib/meta-unitas-entry-playback.ts";

function setup() {
  let now = 0;
  let id = 0;
  const jobs = new Map();
  const clock = {
    setTimeout(run, ms) {
      const token = ++id;
      jobs.set(token, { run, at: now + ms });
      return token;
    },
    clearTimeout(token) {
      jobs.delete(token);
    },
  };
  return {
    playback: createMetaUnitasEntryPlayback(clock),
    jobs,
    advance(ms) {
      now += ms;
      for (const [token, job] of jobs)
        if (job.at <= now) {
          jobs.delete(token);
          job.run();
        }
    },
  };
}

// Owner (2026-10-24): 「他と同じく、事前にデータを読み込む方式にして」 — the clock
// starts on the first frame (no readiness hold); completion still waits.
test("the clock starts on the renderer's first frame, ready or not", async () => {
  const { playback, jobs } = setup();
  assert.equal(playback.state, "preparing");
  assert.equal(playback.frame(6000), 0);
  assert.equal(playback.state, "playing");
  assert.equal(playback.frame(7000), 1000);
  assert.equal(playback.frame(9090), 3090);
  assert.equal(playback.state, "playing", "the final frame must paint before the cover releases");
  playback.complete();
  assert.equal(await playback.promise, "complete");
  assert.equal(jobs.size, 0);
});

test("timestamp zero is a valid first frame", () => {
  const { playback } = setup();
  assert.equal(playback.frame(0), 0);
  assert.equal(playback.frame(100), 100);
  playback.cancel();
});

for (const stage of ["preparing", "playing"]) {
  for (const [action, result] of [
    ["skip", "skipped"],
    ["cancel", "cancelled"],
    ["fail", "unavailable"],
  ]) {
    test(`${action} during ${stage} settles once and rejects stale readiness/completion`, async () => {
      const { playback, jobs, advance } = setup();
      if (stage === "playing") playback.frame(100);
      playback[action]();
      assert.equal(await playback.promise, result);
      assert.equal(playback.frame(9000), null);
      playback.complete();
      advance(60_000);
      assert.equal(playback.state, result);
      assert.equal(jobs.size, 0);
    });
  }
}

test("stalled preparation is bounded and reports failure, never a completed or skipped call", async () => {
  const { playback, advance, jobs } = setup();
  playback.complete();
  advance(META_UNITAS_ENTRY_PREPARE_MS - 1);
  assert.equal(playback.state, "preparing");
  advance(1);
  assert.equal(await playback.promise, "unavailable");
  assert.equal(jobs.size, 0);
});

// Owner (2026-10-24): a scene held for a slow engine is bounded from its start.
test("the watchdog bounds a held scene from its first frame", async () => {
  const { playback, advance } = setup();
  playback.frame(0);
  advance(META_UNITAS_ENTRY_PREPARE_MS - 1);
  assert.equal(playback.state, "playing");
  advance(1);
  assert.equal(await playback.promise, "unavailable");
});

test("the route gate awaits scene completion and the renderer waits for a painted engine", () => {
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const gate = read("src/components/load-gate.tsx");
  const entry = read("src/components/meta-unitas-saga/meta-unitas-entry-sequence.tsx");
  assert.match(gate, /await metaUnitasPlayback\.promise/);
  assert.match(gate, /!metaUnitasPlayback && coverTimeLeft > 0/);
  assert.match(gate, /metaUnitasPlayback\.skip/);
  assert.match(gate, /metaUnitasTransition\.current !== null/);
  // Owner (2026-10-24): readiness gates completion, never the first motion.
  assert.match(entry, /rznState === "live" && !runway\.dataset\.rznArming/);
  assert.match(entry, /playback\.frame\(now\)/);
  assert.match(entry, /elapsed < META_UNITAS_ENTRY_DURATION_MS \|\| !ready/);
  assert.doesNotMatch(entry, /READY_WAIT_MS/);
});
