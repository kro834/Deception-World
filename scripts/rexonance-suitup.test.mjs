import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_ENTRY_TIMINGS,
  REXONANCE_SUIT_PARTS,
  REXONANCE_SUIT_SYSTEMS,
} from "../src/lib/rexonance-calls.ts";
import { REXONANCE_STAGE_CARD_LEAVE_MS } from "../src/lib/rexonance-stage-call.ts";

/* 2026-10-03 rx3: the suit-up. The henshin call sequence gains an armour
   assembly on its own clock: a HUD boots on FAR UP！, a blueprint traces on
   RIDER！, one plate group locks on each quarter-beat of SA-GA！DEUS！,
   resonance runs through the armour with the aperture's arcs on
   REXONANCE！, and on REXONANCE DEUS！ the faceplate shuts and the eyes and
   the core ignite, gold last, before the hand-over. Stage cards swap the
   helmet's crest per form. These pin the facts the HUD prints, the clock,
   the gates, the still tiers, forced colours and the 12px floor. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const sheet = strip(read("src/styles-rexonance-calls.css"));
const component = read("src/components/rexonance-saga/rexonance-call-sequence.tsx");
const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
const suitCss = sheet.slice(sheet.indexOf(".rx-call-sequence .rx-suit {"));

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

function parse(css) {
  const rules = [];
  const keyframes = new Map();
  const stack = [];
  let prelude = "";
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < css.length && depth > 0; end += 1) {
          if (css[end] === "{") depth += 1;
          if (css[end] === "}") depth -= 1;
        }
        keyframes.set(frames[1], css.slice(index + 1, end - 1));
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = css.indexOf("}", index);
      rules.push({ selector: head, body: flat(css.slice(index + 1, end)), context: [...stack] });
      index = end;
      continue;
    }
    if (character === "}") {
      stack.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
  }
  return { rules, keyframes };
}

const splitTopLevel = (value, separator = ",") => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()].filter(Boolean);
};

const declaration = (body, property) =>
  body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim();

const { rules, keyframes } = parse(suitCss);
const ENTRY_GATE =
  /^html:not\(\[data-world-effects="economy"\]\) \.rx-call-sequence\[data-mode="entry"\]\[data-tier="full"\]/;
const STAGE_GATE =
  /^html:not\(\[data-world-effects="economy"\]\) \.rx-call-sequence\[data-mode="stage"\]\[data-tier="full"\] \.rx-suit-(?:badge|crest)/;
const animates = (body) => {
  const value = declaration(body, "animation") ?? declaration(body, "animation-name");
  return Boolean(value) && value !== "none";
};

test("the HUD prints only facts the page states, with generic HUD words", () => {
  const generic = new Set(["ONLINE", "LINK"]);
  assert.equal(REXONANCE_SUIT_SYSTEMS.length, 6);
  for (const [name, status] of REXONANCE_SUIT_SYSTEMS) {
    assert.ok(page.includes(name), `the page states ${name}`);
    if (generic.has(status)) continue;
    // A reading keeps its system: the page prints them as one fact.
    assert.ok(page.includes(`${status} · ${name}`), `the page states ${status} · ${name}`);
  }
  assert.deepEqual([...REXONANCE_SUIT_PARTS], ["LEGS", "ARMS", "CHEST", "HEAD"]);
  // The only literal words in the component: the calls' lines, the caption,
  // the stage label and two HUD words. Everything else comes from the lib.
  const literals = [...component.matchAll(/(?<!=)>\s*([^<>{}]*?[^\s<>{}][^<>{}]*?)\s*</g)]
    .map((match) => match[1].trim())
    .filter((text) => /[A-Za-z]/.test(text));
  assert.deepEqual([...new Set(literals)].sort(), [
    "DEUS！",
    "LOCK",
    "OPERATING STAGE",
    "REXONANCE",
    "REXONANCE！",
    "SA-GA！DEUS！",
    "SYSTEM CHECK",
    "TRINITY RESONANCE",
  ]);
  assert.match(component, /REXONANCE_SUIT_SYSTEMS\.map\(\(\[name, status\], index\)/);
  assert.match(component, /REXONANCE_SUIT_PARTS\.map\(\(part, index\)/);
});

test("the suit is entry-only, the badge stage-only, both inside the aria-hidden root", () => {
  assert.match(component, /\{entry \? <Suit \/> : <SuitBadge \/>\}/);
  assert.match(component, /className="rx-call-sequence"[\s\S]*?aria-hidden="true"/);
  // The badge is textless: polygons only.
  const badge = component.match(/function SuitBadge\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(badge);
  assert.doesNotMatch(badge, /(?<!=)>\s*[^\s<>{}][^<>{}]*</);
  // Each plate group is its own small box so it moves on the compositor;
  // nothing animates inside an SVG (an outer <svg> is a box of its own).
  for (const { selector, body } of rules) {
    if (!animates(body)) continue;
    for (const part of splitTopLevel(selector)) {
      assert.doesNotMatch(part, /\b(?:polygon|path|g|use)$/, part);
    }
  }
  // One animation per property per box: Chrome only composites an element
  // whose animations do not share a property (two transform animations on a
  // faceplate half ran on the main thread).
  for (const { selector, body } of rules) {
    const layers = splitTopLevel(declaration(body, "animation") ?? "");
    if (layers.length < 2) continue;
    const seen = new Set();
    for (const layer of layers) {
      const name = splitTopLevel(layer, " ")[0];
      const frames = keyframes.get(name) ?? "";
      for (const property of ["opacity", "transform"]) {
        if (!new RegExp(`${property}:`).test(frames)) continue;
        assert.ok(!seen.has(property), `${selector}: two ${property} animations`);
        seen.add(property);
      }
    }
  }
});

// The call clock, as the component hands it to the sheet.
const CLOCK = {
  "--rx-call-rider-start": REXONANCE_CALL_BEATS[1].start,
  "--rx-call-chant-start": REXONANCE_CALL_BEATS[2].start,
  "--rx-call-chant-duration": REXONANCE_CALL_BEATS[2].duration,
  "--rx-call-response-start": REXONANCE_CALL_BEATS[3].start,
  "--rx-call-response-duration": REXONANCE_CALL_BEATS[3].duration,
  "--rx-call-final-start": REXONANCE_CALL_BEATS[4].start,
  "--rx-call-cover": REXONANCE_ENTRY_TIMINGS.cover,
  "--rx-call-reveal": REXONANCE_ENTRY_TIMINGS.reveal,
};
const derived = Object.fromEntries(
  rules
    .flatMap(({ body }) =>
      ["--rx-suit-lock", "--rx-suit-at"].map((name) => [name, declaration(body, name)]),
    )
    .filter(([, value]) => value && /--rx-suit-[ik]\b/.test(value)),
);
function ms(expression, element) {
  let value = expression;
  for (let pass = 0; pass < 4; pass += 1) {
    value = value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
      if (name in element) return String(element[name]);
      if (name in derived) return derived[name];
      if (name in CLOCK) return String(CLOCK[name]);
      throw new Error(`unknown ${name} in ${expression}`);
    });
  }
  const arithmetic = value.replace(/calc\(/g, "(").replace(/(\d)ms\b/g, "$1");
  assert.match(arithmetic, /^[\d\s.+\-*/()]+$/, expression);
  return Function(`return (${arithmetic});`)();
}
const layerTimes = (layer, element) => {
  const tokens = splitTopLevel(layer, " ");
  // Durations and delays: plain times, calc() or a clock variable (the
  // easing variable is a timing function, not a time).
  const times = tokens.filter(
    (token) => /^(?:\d|calc\()/.test(token) || /^var\(--rx-(?:suit|call)-(?!ease)/.test(token),
  );
  const duration = ms(times[0], element);
  const delay = times[1] ? ms(times[1], element) : 0;
  return { name: tokens[0], duration, delay, end: duration + delay };
};
const covering = (fragment) =>
  rules.find(
    ({ selector, body }) =>
      selector.includes('[data-phase="covering"]') && selector.endsWith(fragment) && animates(body),
  );

test("the suit keeps the call clock and is finished before the hand-over", () => {
  const cover = REXONANCE_ENTRY_TIMINGS.cover;
  const chant = REXONANCE_CALL_BEATS[2];
  const response = REXONANCE_CALL_BEATS[3];
  const final = REXONANCE_CALL_BEATS[4].start;
  // One plate group per quarter-beat of SA-GA！DEUS！, arriving on it: the
  // keyframe's arrival (80 %) lands on the beat, the bite starts there.
  const plate = covering(".rx-suit-plate");
  assert.match(keyframes.get("rxSuitPlate"), /80% \{\s*transform:/);
  for (const index of [0, 1, 2, 3]) {
    const lock = chant.start + (index * chant.duration) / 4;
    const { duration, delay } = layerTimes(declaration(plate.body, "animation"), {
      "--rx-suit-i": index,
    });
    assert.equal(delay + 0.8 * duration, lock, `plate group ${index}`);
    const bite = layerTimes(declaration(covering(".rx-suit-plate::before").body, "animation"), {
      "--rx-suit-i": index,
    });
    assert.equal(bite.delay, lock);
  }
  // Resonance: one phase per REXONANCE！ quarter-beat, with the arcs.
  for (const phase of [0, 1, 2]) {
    const at = response.start + (phase * response.duration) / 4;
    const ring = layerTimes(declaration(covering(".rx-suit-ring").body, "animation"), {
      "--rx-suit-k": phase,
    });
    assert.equal(ring.delay, at);
    const glow = layerTimes(declaration(covering(".rx-suit-glow").body, "animation"), {
      "--rx-suit-k": phase,
      "--rx-suit-z": 0,
    });
    assert.equal(glow.delay, at);
  }
  // REXONANCE DEUS！: the faceplate shuts on the beat, then the eyes ignite
  // ice, violet, gold; the core ignites with gold; all before the cover ends.
  const shut = declaration(covering(".rx-suit-face > svg").body, "animation");
  assert.match(shut, /^rxSuitFaceShut /);
  assert.equal(layerTimes(shut, {}).delay, final);
  const eyes = [0, 1, 2].map((phase) =>
    layerTimes(declaration(covering(".rx-suit-eyes").body, "animation"), {
      "--rx-suit-k": phase,
    }),
  );
  assert.ok(eyes[0].delay > final + 80 && eyes[0].delay < eyes[1].delay);
  assert.ok(eyes[1].delay < eyes[2].delay, "gold locks last");
  const core = layerTimes(declaration(covering(".rx-suit-core").body, "animation"), {});
  assert.ok(core.delay >= eyes[1].end && core.end <= cover, "the core ignites with gold");
  // The reticle acquires on FAR UP！, dims as the helmet locks inside it and
  // hands over to the gold lock on the last call (its keyframes on the clock).
  const reticle = layerTimes(declaration(covering(".rx-suit-lock::before").body, "animation"), {});
  const at = (offset) => reticle.delay + (offset / 100) * reticle.duration;
  const stops = [
    ...keyframes.get("rxSuitReticle").matchAll(/([\d.]+)% \{\s*opacity: ([\d.]+);/g),
  ].map(([, offset, opacity]) => [Math.round(at(Number(offset)) * 2) / 2, Number(opacity)]);
  assert.ok(reticle.delay < REXONANCE_CALL_BEATS[1].start, "acquired on FAR UP！");
  assert.deepEqual(
    stops.filter(([, opacity]) => opacity === 0.8).at(-1)[0],
    chant.start + (3 * chant.duration) / 4,
  );
  assert.deepEqual(stops.filter(([, opacity]) => opacity === 0.32).at(-1)[0], final);
  assert.equal(
    layerTimes(declaration(covering(".rx-suit-lock::after").body, "animation"), {}).delay,
    final,
  );
  // Every covering animation ends by the cover, for every element's index:
  // boot lines 0-6, plate groups and callouts 0-3, phases 0-2.
  let checked = 0;
  for (const { selector, body } of rules) {
    if (!selector.includes('[data-phase="covering"]') || !animates(body)) continue;
    const indices = /\.rx-suit-boot/.test(selector) ? 6 : 3;
    for (const layer of splitTopLevel(declaration(body, "animation"))) {
      for (let i = 0; i <= indices; i += 1) {
        for (const k of [0, 1, 2]) {
          const { end } = layerTimes(layer, {
            "--rx-suit-i": i,
            "--rx-suit-k": k,
            "--rx-suit-z": 2,
          });
          assert.ok(end <= cover, `${selector}: ${layer} ends at ${end}`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 100, String(checked));
  // The system check gives way before the first plates land.
  const boot = layerTimes(declaration(covering(".rx-suit-boot").body, "animation"), {});
  assert.ok(boot.delay < chant.start && boot.end <= chant.start + 40);
});

test("motion is gated by reduced motion, forced colours and economy, finite and scoped", () => {
  let moving = 0;
  for (const { selector, body, context } of rules) {
    for (const part of splitTopLevel(selector)) {
      assert.match(part, /\.rx-call-sequence\b/, `scoped: ${part}`);
    }
    if (!animates(body)) continue;
    moving += 1;
    assert.ok(
      context.some((at) => /prefers-reduced-motion:\s*no-preference/.test(at)) &&
        context.some((at) => /forced-colors:\s*none/.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.ok(ENTRY_GATE.test(part) || STAGE_GATE.test(part), part);
    }
  }
  assert.ok(moving >= 20, String(moving));
  assert.doesNotMatch(suitCss, /\binfinite\b|animation-iteration-count|will-change/);
  const suitFrames = [...keyframes].filter(([name]) => name.startsWith("rxSuit"));
  assert.ok(suitFrames.length >= 14);
  for (const [name, body] of suitFrames) {
    const properties = [...body.matchAll(/(?:^|[;{}])\s*([a-z-]+)\s*:/g)].map((m) => m[1]);
    assert.ok(properties.length > 0, name);
    for (const property of properties) assert.ok(["opacity", "transform"].includes(property), name);
  }
  // HUD pieces are hidden unless the full tier runs; calm, economy and
  // reduced never see a boot, a callout, a lock or a badge.
  for (const piece of [
    "rx-suit-rim",
    "rx-suit-heading",
    "rx-suit-callouts",
    "rx-suit-lock",
    "rx-suit-boot",
    "rx-suit-badge",
  ]) {
    const base = rules.find(
      ({ selector, context }) => selector === `.rx-call-sequence .${piece}` && context.length === 0,
    );
    assert.equal(declaration(base.body, "display"), "none", piece);
    // Any rule that shows the piece itself (its last compound) asks for the
    // full tier.
    const targets = new RegExp(`\\.${piece}(?![\\w-])[^\\s>]*$`);
    for (const { selector, body } of rules) {
      const display = declaration(body, "display");
      if (!display || display === "none") continue;
      for (const part of splitTopLevel(selector)) {
        if (targets.test(part)) assert.match(part, /\[data-tier="full"\]/, part);
      }
    }
  }
});

test("calm, economy and reduced rest on a still schematic placed without transforms", () => {
  const still = rules.filter(
    ({ selector, body }) =>
      selector.includes(".rx-suit-figure") && declaration(body, "opacity") === "0.5",
  );
  const selectors = still.map(({ selector }) => selector).join("\n");
  assert.match(selectors, /:is\(\[data-tier="calm"\], \[data-tier="reduced"\]\) \.rx-suit-figure/);
  assert.match(
    selectors,
    /html\[data-world-effects="economy"\] \.rx-call-sequence \.rx-suit-figure/,
  );
  assert.ok(
    still.some(({ context }) => context.some((at) => /prefers-reduced-motion:\s*reduce/.test(at))),
  );
  // The still tiers force transform: none on every descendant, so static
  // placement uses translate/rotate, never transform.
  for (const { selector, body } of rules) {
    if (animates(body)) continue;
    assert.equal(declaration(body, "transform"), undefined, selector);
  }
  assert.match(
    rules.find(({ selector }) => selector === ".rx-call-sequence .rx-suit-figure").body,
    /translate: -50% -50%/,
  );
});

test("forced colours drop the suit and the badge; text keeps its 12px floor", () => {
  const forced = rules.filter(({ context }) =>
    context.some((at) => /forced-colors:\s*active/.test(at)),
  );
  assert.ok(
    forced.some(
      ({ selector, body }) =>
        selector === ".rx-call-sequence[data-mode] :is(.rx-suit, .rx-suit-badge)" &&
        body === "display: none;",
    ),
  );
  let sizes = 0;
  for (const [, value] of suitCss.matchAll(/font-size:\s*([^;]+);/g)) {
    sizes += 1;
    const px = value.match(/^(\d+(?:\.\d+)?)px$/);
    assert.ok(px && Number(px[1]) >= 12, value);
  }
  assert.ok(sizes >= 2);
  assert.doesNotMatch(suitCss, /(?:^|[;{\s])font:/);
});

test("the stage badge swaps the crest per form inside the card's first beat", () => {
  const badge = rules.find(
    ({ selector }) => STAGE_GATE.test(selector) && selector.endsWith(".rx-suit-badge"),
  );
  // One opacity animation: in over 80 ms, out from the words' leave.
  const life = layerTimes(declaration(badge.body, "animation"), {});
  assert.equal(life.delay, 0);
  assert.equal(life.duration, REXONANCE_STAGE_CARD_LEAVE_MS + 80);
  const offsets = [
    ...keyframes.get("rxSuitBadgeLife").matchAll(/([\d.]+)% \{\s*opacity: ([\d.]+);/g),
  ].map(([, offset, opacity]) => ({
    at: (Number(offset) / 100) * life.duration,
    opacity: Number(opacity),
  }));
  assert.deepEqual(
    offsets.map(({ at, opacity }) => [Math.round(at), opacity]),
    [
      [0, 0],
      [80, 1],
      [REXONANCE_STAGE_CARD_LEAVE_MS, 1],
      [REXONANCE_STAGE_CARD_LEAVE_MS + 80, 0],
    ],
  );
  for (const fragment of [".rx-suit-crest", ".rx-suit-badge-eyes", ".rx-suit-badge::after"]) {
    const rule = rules.find(
      ({ selector }) => STAGE_GATE.test(selector) && selector.endsWith(fragment),
    );
    assert.ok(
      layerTimes(declaration(rule.body, "animation"), {}).end <= REXONANCE_STAGE_CARD_LEAVE_MS,
    );
  }
  // Only the crest's visibility follows data-stage, so a retarget swaps the
  // crest (its entrance restarts) and nothing else restarts.
  for (const { selector, body } of rules) {
    if (!/\[data-stage="(?:standard|max|ultra)"\]/.test(selector)) continue;
    assert.equal(body, "display: block;", selector);
    for (const part of splitTopLevel(selector)) assert.match(part, /\.rx-suit-crest\.is-/, part);
  }
  for (const form of ["standard", "max", "ultra"]) {
    assert.match(component, new RegExp(`${form}: \\[`));
  }
});
