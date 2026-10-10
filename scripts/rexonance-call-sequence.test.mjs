import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_CALLS,
  REXONANCE_ENTRY_TIMINGS,
  REXONANCE_STAGE_DURATION_MS,
  REXONANCE_STAGE_LABELS,
} from "../src/lib/rexonance-calls.ts";

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const component = read("components/rexonance-saga/rexonance-call-sequence.tsx");
const styles = read("styles-rexonance-calls.css");
const rider = read("components/world/rider-page.tsx");

const publishedCalls = [
  "FAR UP！",
  "RIDER！",
  "SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！SA-GA！DEUS！",
  "REXONANCE！REXONANCE！REXONANCE！REXONANCE！",
  "REXONANCE DEUS！",
];

test("entry calls stay identical to the published five-call sequence and order", () => {
  assert.deepEqual(REXONANCE_CALLS, publishedCalls);
  assert.equal(REXONANCE_CALL_BEATS.length, publishedCalls.length);

  const riderBlockStart = rider.indexOf('name: "レクソナンスサーガ"');
  const riderBlockEnd = rider.indexOf("stats: [", riderBlockStart);
  const riderBlock = rider.slice(riderBlockStart, riderBlockEnd);
  assert.match(rider, /import \{ REXONANCE_CALLS \} from "@\/lib\/rexonance-calls"/);
  assert.match(riderBlock, /calls: \[\.\.\.REXONANCE_CALLS\]/);

  assert.ok(!component.includes("AudioContext"));
  assert.ok(!component.includes("new Audio"));
  assert.ok(!component.includes("speechSynthesis"));
  assert.match(component, /REXONANCE_CALLS\.map\(\(call, index\)/);
  assert.match(component, /data-call=\{call\}/);
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
  assert.equal((component.match(/<span>REXONANCE！<\/span>/g) ?? []).length, 4);
  assert.match(
    component,
    /if \(index === 4\)[\s\S]*?<span>REXONANCE<\/span>[\s\S]*?<span>DEUS！<\/span>/,
  );
});

test("entry and stage timings stay bounded and stage labels are not new calls", () => {
  // rx12: the face's pixel squares hold ~0.6 s on the last call (owner).
  assert.equal(REXONANCE_ENTRY_TIMINGS.cover, 2880);
  assert.equal(REXONANCE_ENTRY_TIMINGS.reveal, 480);
  assert.equal(REXONANCE_STAGE_DURATION_MS, 650);
  assert.deepEqual(REXONANCE_STAGE_LABELS, {
    standard: "HIGH",
    max: "MAX",
    ultra: "ULTRA",
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
  assert.match(component, /index < 2 \? " rx-call-opening"/);
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
  assert.match(component, /index === 4 \? " rx-call-final"/);
  assert.match(component, /index === 2 \? " rx-call-chant"/);
  assert.match(component, /index === 3 \? " rx-call-repetition"/);
});
