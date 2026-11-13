import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createEntryPlayback, ENTRY_PREPARE_MS } from "../src/lib/entry-playback.ts";
import {
  EXTREME_ENTRY_TIMINGS,
  EXTREME_SUITUP_BEATS,
  EXTREME_SUITUP_END_MS,
  EXTREME_SUITUP_WIDTHS,
  extremeSuitupDpr,
  extremeSuitupSource,
  pickExtremeSuitupWidth,
} from "../src/lib/extreme-entry.ts";
import {
  SUITUP_GEMS,
  SUITUP_HORNS,
  SUITUP_REGIONS,
  buildSuitupPlates,
} from "../src/lib/extreme-suitup-geometry.ts";

/* EXTREME SAGA's entry suit-up (owner, 2026-11-11): mechanical plates
   deploying in the route transition screen only. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const gate = read("src/components/load-gate.tsx");
const sequence = read("src/components/extreme-saga/extreme-entry-sequence.tsx");
const engine = read("src/lib/extreme-suitup-engine.ts");
const page = read("src/components/extreme-saga/extreme-saga.tsx");

test("the gate plays the suit-up on the extreme dive, full tier only, held by its playback", () => {
  assert.match(
    gate,
    /import \{ ExtremeEntrySequence \} from "@\/components\/extreme-saga\/extreme-entry-sequence"/,
  );
  assert.match(
    gate,
    /if \(diveVariant === "extreme" && tier === "full"\) \{\s*extremePlayback = createEntryPlayback\(\);\s*rexonanceCoverCancel\.current = extremePlayback\.cancel;/,
  );
  assert.match(gate, /const result = await clock\.wait\(extremePlayback\.promise\);/);
  assert.match(gate, /!extremePlayback &&\s*!clock\.skipped/);
  assert.match(gate, /extremePlayback\?\.cancel\(\);/);
  assert.match(gate, /<ExtremeEntrySequence phase=\{phase\} playback=\{extremePlayback\} \/>/);
  assert.match(gate, /extreme: EXTREME_ENTRY_TIMINGS,/);
  // The page itself carries no suit-up: transition only.
  assert.doesNotMatch(page, /ExtremeEntrySequence|extreme-suitup/);
});

test("the suit-up is skippable: the button, Escape and the skip all end the playback", () => {
  assert.match(gate, /if \(extremePlayback\) farFromSkip\.current = extremePlayback\.skip;/);
  assert.match(gate, /const extremeSkippable = extreme && !revealing;/);
  assert.match(gate, /illusionculumSkippable \|\| extremeSkippable/);
  assert.match(gate, /\(gate\.variant === "extreme" && Boolean\(gate\.extremePlayback\)\)/);
  assert.match(
    gate,
    /<ExtremeEntrySequence[^]*?\{extremeSkippable \? \([^]*?className="ffe-skip"[^]*?onClick=\{onSkip\}/,
  );
});

test("reduced motion and economy never mount it: the gate's short fade instead", () => {
  // Only the full tier creates the playback; the reduced tier takes the
  // gate's 100 ms / 160 ms fade.
  assert.match(gate, /const timings = reduceMotion\s*\? \{ cover: 100, reveal: 160 \}/);
  assert.match(
    gate,
    /variant === "extreme" && scene\?\.tier === "full" && Boolean\(extremePlayback\)/,
  );
  assert.equal(EXTREME_ENTRY_TIMINGS.reveal > 0, true);
});

test("the playback pauses its watchdog while hidden, and the renderer its clock", () => {
  let now = 0;
  const jobs = new Map();
  let id = 0;
  const playback = createEntryPlayback({
    setTimeout(run, ms) {
      jobs.set(++id, { run, at: now + ms });
      return id;
    },
    clearTimeout(token) {
      jobs.delete(token);
    },
  });
  playback.frame(0);
  playback.pause();
  assert.equal(jobs.size, 0, "no watchdog while hidden");
  now += ENTRY_PREPARE_MS * 2;
  playback.resume();
  assert.equal(jobs.size, 1);
  assert.equal(playback.state, "playing");
  playback.skip();
  assert.equal(playback.state, "skipped");
  assert.match(engine, /visibilitychange/);
  assert.match(engine, /playback\.pause\(\)/);
  assert.match(engine, /t \+= Math\.min\(64, delta\)/);
  // A device that cannot keep up drops to 1x (smooth on slow phones).
  assert.match(engine, /dprLimit = 1;/);
});

test("the art and the engine load only when the sequence mounts (no eager download elsewhere)", () => {
  // The gate's chunk holds the light layer; the engine is a dynamic import.
  assert.match(sequence, /import\("@\/lib\/extreme-suitup-engine"\)/);
  assert.doesNotMatch(sequence, /from "@\/lib\/extreme-suitup-engine"/);
  assert.doesNotMatch(gate, /extreme-suitup-engine|extreme-suitup-20261111|expreme-/);
  // Nothing preloads the suit art: no <link rel=preload>, no route head, no
  // warm-up list, no service worker or asset manifest names it.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|jsx?|mjs|css|json|html)$/.test(entry)) {
        const text = readFileSync(path, "utf8");
        if (/extreme-suitup-20261111|expreme-(768|1024)\.webp/.test(text)) offenders.push(path);
      }
    }
  };
  walk(fileURLToPath(new URL("../src", import.meta.url)));
  // The address lives in one light module (the sequence names it in prose).
  assert.deepEqual(offenders.map((path) => path.replace(/^.*\/src\//, "src/")).sort(), [
    "src/components/extreme-saga/extreme-entry-sequence.tsx",
    "src/lib/extreme-entry.ts",
  ]);
  assert.doesNotMatch(sequence, /src=|<img|preload/);
  assert.match(engine, /extremeSuitupSource\(width\)/);
});

test("the suit art ships at its widths, with alpha", () => {
  for (const width of EXTREME_SUITUP_WIDTHS) {
    const file = new URL(`../public${extremeSuitupSource(width)}`, import.meta.url);
    assert.ok(existsSync(file), extremeSuitupSource(width));
    const bytes = readFileSync(file);
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    // VP8X with the alpha flag (bit 4), or a lossless stream.
    const chunk = bytes.toString("ascii", 12, 16);
    assert.ok(chunk === "VP8L" || (chunk === "VP8X" && (bytes[20] & 0x10) !== 0), "keeps alpha");
    assert.ok(bytes.length < 320_000, `${width}: ${bytes.length} bytes`);
  }
  assert.equal(pickExtremeSuitupWidth(500, 1.5), 768);
  assert.equal(pickExtremeSuitupWidth(900, 2), 1024);
  assert.equal(extremeSuitupDpr(3, true), 1.5);
  assert.equal(extremeSuitupDpr(3, false), 2);
  assert.equal(extremeSuitupDpr(Number.NaN, false), 1);
});

test("the choreography: belt first, then chest, shoulders/arms, legs/boots, gauntlets, helmet, cape", () => {
  const b = EXTREME_SUITUP_BEATS;
  assert.ok(b.core[0] === 0 && b.belt[0] < b.chest[0]);
  assert.ok(b.chest[0] < b.shoulders[0] && b.shoulders[0] <= b.arms[0]);
  assert.ok(b.arms[0] < b.legs[0] && b.legs[0] < b.boots[0]);
  assert.ok(b.boots[0] < b.gauntlets[0] && b.gauntlets[1] <= b.gems[1]);
  assert.ok(b.gems[0] < b.helmet[0] && b.helmet[1] <= b.horns[1]);
  assert.ok(b.helmet[0] < b.cape[0] && b.cape[1] <= b.sweep[1]);
  assert.ok(EXTREME_SUITUP_END_MS >= 2500 && EXTREME_SUITUP_END_MS <= 4000);

  const plates = buildSuitupPlates();
  assert.ok(plates.length > 250 && plates.length < 1200, String(plates.length));
  for (const plate of plates) {
    const [begin, end] = b[plate.group];
    assert.ok(plate.start >= begin && plate.lock <= end, `${plate.region} in its beat`);
    assert.ok(plate.glow > plate.lock, "glow traces on after the lock");
  }
  // The same plates every time.
  assert.deepEqual(buildSuitupPlates().slice(0, 5), plates.slice(0, 5));
  assert.ok(SUITUP_GEMS.length >= 10 && SUITUP_HORNS.length === 2);
});

test("every region winds one way (the body's nonzero union has no holes)", () => {
  const area = (poly) =>
    poly.reduce((sum, [x, y], i) => {
      const [nx, ny] = poly[(i + 1) % poly.length];
      return sum + x * ny - nx * y;
    }, 0);
  for (const region of SUITUP_REGIONS) assert.ok(area(region.poly) > 0, region.id);
  for (const horn of SUITUP_HORNS) assert.ok(area(horn) > 0, "horn");
});

test("no borrowed assets or sound: the suit-up draws only the owner's art", () => {
  assert.doesNotMatch(engine, /new Audio|AudioContext|\.mp3|\.wav/);
  assert.doesNotMatch(engine + sequence, /iron ?man|marvel|stark/i);
});
