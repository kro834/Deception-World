import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_CALLS,
  REXONANCE_ENTRY_BLACKOUT_MS,
  REXONANCE_ENTRY_CALLS,
  REXONANCE_ENTRY_STILL,
  REXONANCE_ENTRY_SUIT_COVER_MS,
  REXONANCE_ENTRY_TIMINGS,
  REXONANCE_SUIT_BEATS,
  REXONANCE_STAGE_DURATION_MS,
  REXONANCE_STAGE_LABELS,
  REXONANCE_SUIT_SYSTEMS,
} from "../src/lib/rexonance-calls.ts";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const component = read("components/rexonance-saga/rexonance-call-sequence.tsx");
const styles = read("styles-rexonance-calls.css");
const rider = read("components/world/rider-page.tsx");

// Owner (2026-11-23): the call is exactly these four lines.
const publishedCalls = [
  "REXONANCE！",
  "SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！",
  "REXONANCE！REXONANCE！REXONANCE！REXONANCE！",
  "REXONANCE DEUS！",
];

const entryCalls = publishedCalls;

test("canonical calls stay exact and the entry plays one beat per line", () => {
  assert.deepEqual(REXONANCE_CALLS, publishedCalls);
  assert.deepEqual(REXONANCE_ENTRY_CALLS, entryCalls);
  assert.equal(REXONANCE_CALL_BEATS.length, entryCalls.length);
  assert.deepEqual(REXONANCE_SUIT_SYSTEMS[2], ["KHAOS DeuX", "50,000〜YOPS / ∞Core"]);

  const riderBlockStart = rider.indexOf('name: "レクソナンスサーガ"');
  const riderBlockEnd = rider.indexOf("stats: [", riderBlockStart);
  const riderBlock = rider.slice(riderBlockStart, riderBlockEnd);
  assert.match(rider, /import \{ REXONANCE_CALLS \} from "@\/lib\/rexonance-calls"/);
  assert.match(riderBlock, /calls: \[\.\.\.REXONANCE_CALLS\]/);

  assert.ok(!component.includes("AudioContext"));
  assert.ok(!component.includes("new Audio"));
  assert.ok(!component.includes("speechSynthesis"));
  assert.match(component, /REXONANCE_ENTRY_CALLS\.map\(\(call, index\)/);
  assert.match(component, /data-call=\{call\}/);
  // The first line is REXONANCE！ alone, the blackout's (data-call too).
  assert.match(component, /if \(index === 0\) return <span>REXONANCE！<\/span>;/);
  assert.match(
    component,
    /className="rx-call-blackout-line" data-call=\{REXONANCE_ENTRY_CALLS\[0\]\}>\s*<CallLines index=\{0\} \/>/,
  );
  assert.ok(!component.includes("Ultra DEUS"));
  assert.ok(!component.includes("<span>RIDER！</span>"));
  // 2026-10-05 (owner): each chant line is SA-GA！ with DEUS！ as its
  // answer; the line's text is still SA-GA！DEUS！, four times.
  assert.equal(
    (
      component.match(
        /<span>\s*SA-GA！<span className="rx-call-answer">DEUS！<\/span>\s*<\/span>/g,
      ) ?? []
    ).length,
    4,
  );
  // One opening REXONANCE！ plus the following four-call repetition.
  assert.equal((component.match(/<span>REXONANCE！<\/span>/g) ?? []).length, 5);
  assert.match(component, /if \(index === 2\)[\s\S]*?(?:<span>REXONANCE！<\/span>\s*){4}<\/>/);
  assert.match(
    component,
    /if \(index === 3\)[\s\S]*?<span>REXONANCE<\/span>[\s\S]*?<span>DEUS！<\/span>/,
  );
});

test("entry and stage timings stay bounded and stage labels are not new calls", () => {
  // Preserve the authored face hold while the preceding flame gains 360 ms.
  // Owner (2026-10-22): the fire's hold is 360 ms (cover 2730 + 360) to fit the hand-over budget.
  assert.equal(REXONANCE_ENTRY_SUIT_COVER_MS, 3090);
  // Owner (2026-11-23): REXONANCE！ on a blackout first, then the suit-up:
  // the cover is the blackout plus the suit-up's own, unchanged.
  assert.equal(REXONANCE_ENTRY_BLACKOUT_MS, 720);
  assert.equal(REXONANCE_ENTRY_TIMINGS.cover, REXONANCE_ENTRY_BLACKOUT_MS + 3090);
  assert.equal(REXONANCE_ENTRY_TIMINGS.reveal, 480);
  // The four lines' beats: the blackout, then the suit-up's marks after it.
  assert.deepEqual(REXONANCE_CALL_BEATS, [
    { start: 0, duration: 720 },
    { start: 720 + 650, duration: 650 },
    { start: 720 + 1300, duration: 680 },
    { start: 720 + 1980, duration: 750 },
  ]);
  // The suit-up's own marks keep their clocks.
  assert.deepEqual(REXONANCE_SUIT_BEATS, [
    { start: 0, duration: 330 },
    { start: 330, duration: 320 },
    { start: 650, duration: 650 },
    { start: 1300, duration: 680 },
    { start: 1980, duration: 750 },
  ]);
  // The still tiers: the line briefly, then the still, inside a short cover.
  assert.ok(REXONANCE_ENTRY_STILL.line > 0);
  assert.ok(REXONANCE_ENTRY_STILL.cover > REXONANCE_ENTRY_STILL.line);
  assert.ok(REXONANCE_ENTRY_STILL.cover < 1000);
  assert.equal(REXONANCE_STAGE_DURATION_MS, 650);
  assert.deepEqual(REXONANCE_STAGE_LABELS, {
    standard: "HIGH",
    max: "MAX",
    ultra: "ULTRA",
    excelsior: "EXCELSIOR",
  });

  let previousEnd = 0;
  for (const beat of REXONANCE_CALL_BEATS) {
    assert.ok(beat.duration > 0);
    assert.ok(beat.start >= previousEnd, "call beats must not overlap");
    previousEnd = beat.start + beat.duration;
  }
  assert.ok(previousEnd <= REXONANCE_ENTRY_TIMINGS.cover);
  assert.match(component, /data-mode=\{mode\}/);
  assert.match(component, /data-phase=\{phase\}/);
  assert.match(component, /data-tier=\{tier\}/);
  assert.match(component, /data-stage=\{stage\}/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(
    component,
    /className="rx-call-operating-stage"[\s\S]*?<b>\{REXONANCE_STAGE_LABELS\[stage\]\}<\/b>/,
  );
});

test("the sequence is SSR-stable, decorative, finite, and compositor-only", () => {
  assert.match(component, /function RexonanceCallSequence\(/);
  for (const browserOnly of ["window", "document", "setTimeout", "requestAnimationFrame"]) {
    assert.equal(
      component.includes(browserOnly),
      false,
      `${browserOnly} must not be read during render`,
    );
  }
  assert.match(styles, /\.rx-call-sequence\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.match(styles, /\.rx-call-sequence\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(styles, /\.rx-call-beat\s*\{[\s\S]*?font-size:\s*clamp\(24px, 6\.5vw, 116px\)/);
  // The words carry no opening beat: REXONANCE！ is the blackout's line.
  assert.doesNotMatch(component, /rx-call-opening/);
  assert.match(styles, /\.rx-call-opening\s*\{\s*font-size:\s*clamp\(36px, 10\.5vw, 156px\)/);
  assert.match(styles, /\.rx-call-opening\s*\{\s*font-size:\s*min\(10\.5vw, 22vh\)/);
  assert.match(
    styles,
    /\.rx-call-chant,\s*\.rx-call-repetition\s*\{[\s\S]*?font-size:\s*clamp\(24px, 5\.75vw, 100px\)/,
  );
  assert.match(
    styles,
    /\.rx-call-repetition\s*\{[\s\S]*?font-size:\s*clamp\(24px, 5\.75vw, 100px\)/,
  );
  assert.match(
    styles,
    /orientation: landscape\).*?\.rx-call-beat\s*\{\s*font-size:\s*min\(6\.5vw, 16vh\)/s,
  );
  assert.match(
    styles,
    /\.rx-call-chant,\s*\.rx-call-repetition\s*\{\s*font-size:\s*min\(5\.75vw, 10vh\)/,
  );
  assert.match(styles, /\.rx-call-final > span:nth-child\(2\)[\s\S]*?font-size:\s*0\.8em/);
  assert.doesNotMatch(styles, /\binfinite\b|touch-action:\s*none|backdrop-filter|\bfilter:/);
  assert.doesNotMatch(styles, /rxCallGroundIn/);
  assert.match(
    styles,
    /body:has\(\.rx-call-sequence\[data-mode="stage"\]\) \.zeus-button\s*\{\s*visibility:\s*hidden !important;[\s\S]*?pointer-events:\s*none !important/,
  );

  const keyframes = [...styles.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
  assert.ok(keyframes.length >= 8, "the complete finite choreography should be present");
  for (const [, name, body] of keyframes) {
    const properties = [...body.matchAll(/(?:^|[;{}])\s*([a-z-]+)\s*:/g)].map((match) => match[1]);
    assert.ok(properties.length > 0, `${name} should define keyframes`);
    // suitup2: a keyframe may carry its own easing (a timing function for
    // the next segment, not an animated property).
    assert.ok(
      properties.every((property) =>
        ["opacity", "transform", "animation-timing-function"].includes(property),
      ),
      `${name} should animate only opacity/transform, found ${properties.join(", ")}`,
    );
  }
});

test("full, calm, reduced, and reveal states preserve the final call without delaying handoff", () => {
  assert.match(
    styles,
    /data-mode="entry"\]\[data-tier="full"\]\[data-phase="covering"\][\s\S]*?\.rx-call-beat\s*\{/,
  );
  assert.match(
    styles,
    /data-phase="revealing"\] \.rx-call-beat:not\(\.rx-call-final\)\s*\{\s*display:\s*none/,
  );
  assert.match(styles, /:is\(\[data-tier="calm"\], \[data-tier="reduced"\]\)/);
  assert.match(styles, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /data-world-effects="economy"/);
  assert.ok(
    styles.includes(
      '.rx-call-sequence:is([data-tier="calm"], [data-tier="reduced"])[data-phase="revealing"]',
    ),
  );
  assert.match(styles, /\.rx-call-sequence\[data-phase="revealing"\]\s*\{\s*opacity:\s*0/);
  assert.match(styles, /\.rx-call-sequence \*\s*\{\s*animation:\s*none !important/);
  assert.match(component, /index === 3 \? " rx-call-final"/);
  assert.match(component, /index === 1 \? " rx-call-chant"/);
  assert.match(component, /index === 2 \? " rx-call-repetition"/);
});

test("the blackout: REXONANCE！ alone on the dark, then the suit-up on its own clock", () => {
  // Until LoadGate lifts the blackout, the entry renders only the line: no
  // suit, ground, HUD, canvases or meter (the suit-up's clock).
  const blackout = component.slice(
    component.indexOf("if (entry && blackout) {"),
    component.indexOf("\n  return (", component.indexOf("if (entry && blackout) {")),
  );
  assert.match(blackout, /className="rx-call-blackout"/);
  for (const absent of ["<Suit", "rx-call-ground", "rx-call-meter", "rx-call-words", "EntrySurge"])
    assert.ok(!blackout.includes(absent), `${absent} waits for the suit-up`);
  // Its suit-up lines sit on the suit-up's clock (after the blackout).
  assert.match(component, /start: beat\.start - REXONANCE_ENTRY_BLACKOUT_MS/);
  assert.match(component, /"--rx-call-cover": `\$\{REXONANCE_ENTRY_SUIT_COVER_MS\}ms`/);
  // The sheet: the line punches in, holds and fades within the blackout;
  // the suit-up fades up under the veil; the still tiers show it unmoving.
  assert.match(
    styles,
    /\[data-tier="full"\]\[data-phase="covering"\]\s*\.rx-call-blackout-line\s*\{\s*animation: rxCallBlackoutLine var\(--rx-call-blackout, 720ms\)/,
  );
  assert.match(
    styles,
    /\[data-tier="full"\]\[data-phase="covering"\]\s*\.rx-call-veil\s*\{\s*display: block;\s*animation: rxCallVeil 240ms ease-out both;/,
  );
  assert.match(styles, /\.rx-call-veil\s*\{[^}]*display: none;/);
  assert.match(styles, /@keyframes rxCallBlackoutLine\s*\{[\s\S]*?100% \{\s*opacity: 0;/);
});
