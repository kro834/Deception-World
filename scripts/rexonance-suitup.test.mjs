import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import {
  REXONANCE_CALL_BEATS,
  REXONANCE_CHANT_ANSWER,
  REXONANCE_ENTRY_TIMINGS,
  REXONANCE_SUIT_ACCENTS,
  REXONANCE_SUIT_CASCADE,
  REXONANCE_SUIT_CLANK_MS,
  REXONANCE_SUIT_FIT,
  REXONANCE_SUIT_GATHER_MS,
  REXONANCE_SUIT_LATE_MS,
  REXONANCE_SUIT_PARTS,
  REXONANCE_SUIT_PIXELS,
  REXONANCE_SUIT_REVEAL_MS,
  REXONANCE_SUIT_SNAP,
  REXONANCE_SUIT_SYSTEMS,
} from "../src/lib/rexonance-calls.ts";
import {
  REXONANCE_SUIT_ASSETS,
  REXONANCE_SUIT_ATLAS,
  REXONANCE_SUIT_TILE,
  REXONANCE_SUIT_FACE_GLOW,
  REXONANCE_SUIT_FIGURE,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
} from "../src/lib/rexonance-suit.ts";
import { REXONANCE_STAGE_CARD_LEAVE_MS } from "../src/lib/rexonance-stage-call.ts";

/* 2026-10-11 rx13 (owner): finer pieces, formed by nanites right on the
   undersuit and fitted one after another. The figure is cut into 60 plates
   (one atlas), each assembled from its micro-tiles of the artwork that
   stream in along the body and lock, seam outward, in a cascade up the body
   (legs, waist, arms, chest and core, shoulders, the tail midway, the
   ribbons, the helmet last); each DEUS！ seats a group's last plate with the
   strongest clank and a jolt. The canvas engine
   (rexonance-suit-nanites.tsx) draws the tiles; the DOM plates (each grows
   from its seam through its gathered nanite mosaic) are its fallback and
   the clock these pins check.
   2026-10-10 rx12 (owner): the suit-up is the approved full-body artwork,
   cut into raster pieces by scripts/build-rexonance-suit.mjs. FAR UP！ scans
   the bare undersuit; RIDER！ seeds the P14 core and gathers nanite motes;
   on each SA-GA！ a group of pieces forms out of nanites floating a little
   off the body, and on its DEUS！ it snaps on (ガチャガチャ: a hard stop, a
   spark, a jolt); through REXONANCE！ the tail grows out, the ribbons stream
   and the helmet forms above the head and clamps down; on REXONANCE DEUS！
   the face's lights fill with pixel squares that scatter. Pins that
   described the SVG schematic (plates, grains, trims, eyes, faceplate) now
   describe the raster suit with the same intent; the safety pins (gates,
   finite motion, the clock, the still tiers, forced colours, the 12px floor,
   the badge) are unchanged.
   2026-10-04 suitup3: nanotech. The armour forms out of the P14 core: the
   seed gathers on RIDER！, a nanite front spreads one region per SA-GA！DEUS！
   line, each piece condensing out of its grains, and the helmet rises up
   the neck on REXONANCE DEUS！.
   2026-10-04 suitup2: the fitting. The helmet waits through REXONANCE！ and
   shuts on REXONANCE DEUS！, and wide landscape frames stand the figure
   beside the calls.
   2026-10-03 rx3: the suit-up. The henshin call sequence gains an armour
   assembly on its own clock: a HUD boots on FAR UP！, one group locks on
   each quarter-beat of SA-GA！DEUS！, resonance runs with the aperture's arcs
   on REXONANCE！, and the suit is finished before the hand-over. Stage cards
   swap the helmet's crest per form. These pin the facts the HUD prints, the
   clock, the gates, the still tiers, forced colours and the 12px floor. */

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
    // The chant's call; its answer, DEUS！, is listed above (2026-10-05).
    "SA-GA！",
    "SYSTEM CHECK",
    "TRINITY RESONANCE",
  ]);
  assert.match(component, /REXONANCE_SUIT_SYSTEMS\.map\(\(\[name, status\], index\)/);
  // suitup3: each label lands on the line its region forms. rx12: the
  // groups now fit legs, arms, chest (the owner's order), each label on its
  // group's DEUS！ (the helmet's on the last call).
  assert.match(component, /REXONANCE_SUIT_PARTS\.map\(\(part\)[\s\S]*?SUIT_PART_LINE\[part\]/);
  // rx13: the cascade fits legs, waist, arms, then the chest; the labels
  // land on their groups' DEUS！.
  assert.match(component, /SUIT_PART_LINE = \{ LEGS: 0, ARMS: 2, CHEST: 3, HEAD: 3 \}/);
  assert.match(
    sheet,
    /--rx-suit-lock: calc\(var\(--rx-call-chant-start\) \+ 230ms \+ var\(--rx-suit-i\) \* 120ms\)/,
  );
});

test("the suit is entry-only, the badge stage-only, both inside the aria-hidden root", () => {
  // rx12: the entry suit takes the gate's readiness (build, or whole);
  // rx13: and plays its nanite engine only in the full tier.
  assert.match(
    component,
    /\{entry \? <Suit suit=\{suit\} animate=\{tier === "full"\} \/> : <SuitBadge \/>\}/,
  );
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
    value = value.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_, name, fallback) => {
      if (name in element) return String(element[name]);
      if (name in derived) return derived[name];
      if (name in CLOCK) return String(CLOCK[name]);
      if (fallback !== undefined) return fallback;
      throw new Error(`unknown ${name} in ${expression}`);
    });
  }
  const arithmetic = value.replace(/calc\(/g, "(").replace(/(\d)(?:ms|deg|px)\b/g, "$1");
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

// rx13: a plate's clock as the component sets it: --rx-suit-t, when it
// starts to grow (its fit, its clank, REVEAL later); --rx-suit-s, its fit.
const pieceClocks = REXONANCE_SUIT_PIECES.map((piece) => ({
  piece,
  t: REXONANCE_SUIT_FIT[piece.id] - REXONANCE_SUIT_REVEAL_MS,
  s: REXONANCE_SUIT_FIT[piece.id],
}));
const vars = ({ t, s }) => ({ "--rx-suit-t": t, "--rx-suit-s": s });

test("the suit keeps the call clock and is finished before the hand-over", () => {
  const cover = REXONANCE_ENTRY_TIMINGS.cover;
  const chant = REXONANCE_CALL_BEATS[2];
  const response = REXONANCE_CALL_BEATS[3];
  const final = REXONANCE_CALL_BEATS[4].start;
  // The accents land on the chant's DEUS！ answers, as the call sheet strikes
  // them (rxCallAnswer: 230 ms in, then every 120 ms).
  assert.match(
    sheet,
    new RegExp(
      `animation-delay: calc\\(var\\(--rx-call-start\\) \\+ ${REXONANCE_CHANT_ANSWER.first}ms \\+ var\\(--rx-call-answer-n\\) \\* ${REXONANCE_CHANT_ANSWER.every}ms\\)`,
    ),
  );
  const deus = (n) => chant.start + REXONANCE_CHANT_ANSWER.first + n * REXONANCE_CHANT_ANSWER.every;
  assert.deepEqual(
    ["legs", "waist", "arms", "chest"].map((group) => REXONANCE_SUIT_SNAP[group]),
    [0, 1, 2, 3].map(deus),
  );
  // rx13: every plate is in the cascade exactly once, and the plates fit one
  // after another: legs, waist, arms, chest (each group's last plate on its
  // DEUS！, the accent), shoulders, the tail midway, the ribbons, the helmet
  // last (its crest clamping near the end of REXONANCE！).
  const ids = REXONANCE_SUIT_CASCADE.flatMap(({ order }) => order);
  assert.deepEqual([...ids].sort(), REXONANCE_SUIT_PIECES.map(({ id }) => id).sort());
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(REXONANCE_SUIT_PIECES.length >= 40, String(REXONANCE_SUIT_PIECES.length));
  for (const { group, order } of REXONANCE_SUIT_CASCADE) {
    const fits = order.map((id) => REXONANCE_SUIT_FIT[id]);
    for (let k = 1; k < fits.length; k += 1) {
      const gap = fits[k] - fits[k - 1];
      assert.ok(gap >= 10 && gap <= 80, `${group}: one after another (${gap} ms)`);
    }
    if (group in REXONANCE_SUIT_SNAP) assert.equal(fits.at(-1), REXONANCE_SUIT_SNAP[group]);
  }
  assert.deepEqual(REXONANCE_SUIT_ACCENTS, [
    "thigh-top-r",
    "belt-jewel",
    "arm-fist-r",
    "core-disc",
    "helmet-crest",
  ]);
  const span = (group) => {
    const fits = REXONANCE_SUIT_CASCADE.find((entry) => entry.group === group).order.map(
      (id) => REXONANCE_SUIT_FIT[id],
    );
    return [Math.min(...fits), Math.max(...fits)];
  };
  const sequence = ["legs", "waist", "arms", "chest", "shoulders", "tail", "helm"].map(span);
  for (let k = 1; k < sequence.length; k += 1) {
    assert.ok(sequence[k][0] > sequence[k - 1][1], "group after group");
  }
  assert.ok(
    span("legs")[0] - REXONANCE_SUIT_REVEAL_MS - REXONANCE_SUIT_GATHER_MS >=
      REXONANCE_CALL_BEATS[1].start,
  );
  assert.ok(
    span("tail")[0] >= response.start && span("tail")[1] < span("helm")[0],
    "the tail midway",
  );
  assert.ok(span("ribbon")[0] >= response.start && span("ribbon")[1] < span("helm")[0]);
  assert.ok(REXONANCE_SUIT_SNAP.helm >= response.start + (3 * response.duration) / 4);
  assert.ok(REXONANCE_SUIT_SNAP.helm + REXONANCE_SUIT_CLANK_MS <= final);
  // The layers on a plate's clock: its nanites gather from GATHER before it
  // grows and go once it seats; it grows from its seam over REVEAL (its
  // window and its art on one easing, so the art holds still) and clanks
  // over CLANK; the spark bites on the fit.
  const piece = { "--rx-suit-t": 1000, "--rx-suit-s": 1100 };
  const gather = layerTimes(declaration(covering(".rx-suit-mote").body, "animation"), piece);
  const wipe = layerTimes(declaration(covering(".rx-suit-plate").body, "animation"), piece);
  const artHold = layerTimes(
    declaration(covering(".rx-suit-plate > .rx-suit-art").body, "animation"),
    piece,
  );
  assert.deepEqual(
    [gather.delay, gather.end],
    [1000 - REXONANCE_SUIT_GATHER_MS, 1100 + REXONANCE_SUIT_CLANK_MS],
  );
  assert.deepEqual(
    [wipe.name, wipe.delay, wipe.duration],
    ["rxSuitWipe", 1000, REXONANCE_SUIT_REVEAL_MS + REXONANCE_SUIT_CLANK_MS],
  );
  assert.deepEqual([artHold.delay, artHold.duration], [1000, REXONANCE_SUIT_REVEAL_MS]);
  const wipeFrames = keyframes.get("rxSuitWipe");
  const reveal =
    (REXONANCE_SUIT_REVEAL_MS / (REXONANCE_SUIT_REVEAL_MS + REXONANCE_SUIT_CLANK_MS)) * 100;
  assert.match(wipeFrames, new RegExp(`${reveal.toFixed(3)}% \\{`), "grown at the fit");
  const easing = (frames) =>
    frames.match(/animation-timing-function: (cubic-bezier\([^)]*\))/)?.[1];
  assert.equal(
    easing(wipeFrames),
    declaration(covering(".rx-suit-plate > .rx-suit-art").body, "animation").match(
      /cubic-bezier\([^)]*\)/,
    )[0],
  );
  assert.match(keyframes.get("rxSuitWipe"), /scale\(var\(--rx-suit-k\)\)/, "the clank");
  // Close to the body: the nanites stream in from 2 % of the figure away.
  assert.match(keyframes.get("rxSuitGather"), /var\(--rx-suit-h\) \* -0\.02/);
  const spark = layerTimes(declaration(covering(".rx-suit-spark").body, "animation"), piece);
  assert.equal(spark.delay, 1100, "the spark bites on the fit");
  // The jolt: 2 px on each group's impact (snap + 40 ms) and the helmet's.
  const jolt = layerTimes(declaration(covering(".rx-suit-figure").body, "animation"), {});
  const impacts = [];
  for (const [, offsets, body] of keyframes
    .get("rxSuitJolt")
    .matchAll(/([\d.%,\s]+)\{([^}]*)\}/g)) {
    if (!/2px/.test(body)) continue;
    for (const offset of offsets.split(","))
      impacts.push(Math.round(jolt.delay + (parseFloat(offset) / 100) * jolt.duration));
  }
  assert.deepEqual(
    impacts,
    ["legs", "waist", "arms", "chest", "helm"].map((group) => REXONANCE_SUIT_SNAP[group] + 40),
  );
  assert.doesNotMatch(keyframes.get("rxSuitJolt"), /[3-9]px|\d{2,}px/, "a micro-jolt, 1-2 px");
  // REXONANCE DEUS！: the squares fill the face's lights from the last call,
  // each group bursting on its own step, all gone before the cover ends; the
  // lit face and the bodysuit between the plates come on after the helmet.
  for (let i = 0; i < REXONANCE_SUIT_PIXELS.groups; i += 1) {
    const pixels = layerTimes(declaration(covering(".rx-suit-pixels").body, "animation"), {
      "--rx-suit-i": i,
    });
    assert.equal(pixels.delay, REXONANCE_SUIT_PIXELS.fill + i * REXONANCE_SUIT_PIXELS.fillStep);
    assert.equal(
      pixels.end,
      REXONANCE_SUIT_PIXELS.scatter +
        i * REXONANCE_SUIT_PIXELS.scatterStep +
        REXONANCE_SUIT_PIXELS.scatterMs,
    );
    // The burst starts at the keyframes' 83 % (after the ~0.6 s hold): within 10 ms of the scatter.
    const burst = pixels.delay + 0.83 * pixels.duration;
    assert.ok(
      Math.abs(burst - (REXONANCE_SUIT_PIXELS.scatter + i * REXONANCE_SUIT_PIXELS.scatterStep)) <=
        10,
    );
    assert.ok(pixels.delay >= final && pixels.end <= cover);
  }
  for (const layer of [".rx-suit-body", ".rx-suit-face"]) {
    const { delay, end } = layerTimes(declaration(covering(layer).body, "animation"), {});
    assert.ok(delay >= REXONANCE_SUIT_SNAP.helm + REXONANCE_SUIT_CLANK_MS && end <= cover, layer);
  }
  // A late switch to the build happens only while FAR UP！'s scan runs:
  // before any piece could have formed.
  const scan = declaration(covering(".rx-suit-scan").body, "animation");
  const hold = splitTopLevel(declaration(covering(".rx-suit-scan > i").body, "animation"))[0];
  assert.equal(scan.replace(/^\S+/, ""), hold.replace(/^\S+/, ""));
  assert.ok(layerTimes(scan, {}).end <= REXONANCE_CALL_BEATS[1].start, "scanned on FAR UP！");
  assert.ok(REXONANCE_SUIT_LATE_MS <= layerTimes(scan, {}).end);
  assert.ok(
    REXONANCE_SUIT_LATE_MS < Math.min(...pieceClocks.map(({ t }) => t)) - REXONANCE_SUIT_GATHER_MS,
  );
  // Resonance: one ring per REXONANCE！ quarter-beat, with the arcs.
  for (const phase of [0, 1, 2]) {
    const ring = layerTimes(declaration(covering(".rx-suit-ring").body, "animation"), {
      "--rx-suit-k": phase,
    });
    assert.equal(ring.delay, response.start + (phase * response.duration) / 4);
  }
  // The reticle acquires on FAR UP！, dims as the helmet forms above it on
  // the first REXONANCE！ and hands over to the gold lock on the last call.
  const reticle = layerTimes(declaration(covering(".rx-suit-lock::before").body, "animation"), {});
  const at = (offset) => reticle.delay + (offset / 100) * reticle.duration;
  const stops = [
    ...keyframes.get("rxSuitReticle").matchAll(/([\d.]+)% \{\s*opacity: ([\d.]+);/g),
  ].map(([, offset, opacity]) => [Math.round(at(Number(offset)) * 2) / 2, Number(opacity)]);
  assert.ok(reticle.delay < REXONANCE_CALL_BEATS[1].start, "acquired on FAR UP！");
  assert.deepEqual(stops.filter(([, opacity]) => opacity === 0.8).at(-1)[0], response.start);
  assert.deepEqual(stops.filter(([, opacity]) => opacity === 0.32).at(-1)[0], final);
  assert.equal(
    layerTimes(declaration(covering(".rx-suit-lock::after").body, "animation"), {}).delay,
    final,
  );
  // Every covering animation ends by the cover, for every element's index
  // and every piece's clock (the latest of each kind).
  let checked = 0;
  for (const { selector, body } of rules) {
    if (!selector.includes('[data-phase="covering"]') || !animates(body)) continue;
    const indices = /\.rx-suit-boot/.test(selector) ? 6 : 5;
    for (const layer of splitTopLevel(declaration(body, "animation"))) {
      for (let i = 0; i <= indices; i += 1) {
        for (const clock of pieceClocks) {
          const { end } = layerTimes(layer, {
            "--rx-suit-i": i,
            "--rx-suit-j": 6,
            "--rx-suit-k": 2,
            ...vars(clock),
          });
          assert.ok(end <= cover, `${selector}: ${layer} ends at ${end}`);
          checked += 1;
        }
      }
    }
  }
  assert.ok(checked > 1000, String(checked));
  // The system check gives way before the first pieces form.
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
    // A keyframe may also carry its own easing (not an animated property).
    for (const property of properties)
      assert.ok(["opacity", "transform", "animation-timing-function"].includes(property), name);
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
    "rx-suit-joint",
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
  // rx12: the build's layers (the undersuit, the motes, the pieces, the
  // pixel squares) are hidden unless the full tier runs, and nothing in the
  // suit uses filters, blend modes or shadows (the Android GPU budget).
  for (const layer of [
    ".rx-suit-scan > .rx-suit-under",
    ".rx-suit-figure > .rx-suit-motes",
    ".rx-suit-figure > .rx-suit-build",
    ".rx-suit-figure > .rx-suit-pixels",
  ]) {
    const base = rules.find(
      ({ selector, context }) => selector === `.rx-call-sequence ${layer}` && !context.length,
    );
    assert.equal(declaration(base.body, "display"), "none", layer);
    const name = layer.split(" ").at(-1);
    for (const { selector, body } of rules) {
      const display = declaration(body, "display");
      if (!display || display === "none") continue;
      for (const part of splitTopLevel(selector)) {
        if (part.includes(name) && part.trim().endsWith(name))
          assert.match(part, /\[data-tier="full"\]/, part);
        if (/\.rx-suit-figure\s*>\s*:is\(/.test(part))
          assert.match(part, /\[data-tier="full"\]/, part);
      }
    }
  }
  assert.doesNotMatch(suitCss, /\bfilter:|mix-blend-mode|box-shadow|backdrop-filter/);
});

// rx12: the still tiers rest on the finished figure (the artwork whole).
test("calm, economy and reduced rest on the finished figure placed without transforms", () => {
  assert.match(component, /className="rx-suit-whole"[\s\S]*?REXONANCE_SUIT_FIGURE/);
  // The figure is shown by default and hidden only where the full tier
  // builds the suit from its pieces.
  for (const { selector, body } of rules) {
    if (!/\.rx-suit-whole$/.test(selector)) continue;
    if (declaration(body, "display") === "none" || declaration(body, "visibility") === "hidden")
      assert.match(selector, /\[data-tier="full"\][\s\S]*\[data-suit="build"\]/, selector);
  }
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
    // rx12: the calls fitted to their zone beside the figure keep a px
    // floor of their own through max(), never under 12px.
    const px = value.match(/^(\d+(?:\.\d+)?)px$/) ?? value.match(/^max\((\d+(?:\.\d+)?)px,/);
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

test("rx12/rx13: the raster suit — the artwork's plates, delivery-sized, decoded before the call", () => {
  // The figure, the undersuit, the bodysuit, the face's lights and (rx13)
  // the plates' one atlas (art | nanite mosaic) are versioned files under
  // public/, at the generated module's paths; the set stays well under
  // 600 KB.
  const files = [...REXONANCE_SUIT_ASSETS, REXONANCE_SUIT_FIGURE];
  let bytes = 0;
  for (const file of files) {
    assert.match(file, /^\/rexonance-suit-\d{8}\/[\w-]+\.webp$/);
    const path = new URL(`../public${file}`, import.meta.url);
    assert.ok(existsSync(path), file);
    bytes += statSync(path).size;
  }
  const directory = new URL(
    `../public${REXONANCE_SUIT_FIGURE.replace(/\/[^/]+$/, "")}/`,
    import.meta.url,
  );
  assert.equal(readdirSync(directory).length, new Set(files).size, "no stray files");
  assert.ok(bytes < 560_000, String(bytes));
  assert.ok(bytes < 520_000, `rx13: finer plates in one atlas (${bytes})`);
  // The groups of the cascade; every plate inside the figure and its cell
  // inside the atlas's art half, with its micro-tiles (rx13: thousands).
  const groups = new Set(REXONANCE_SUIT_PIECES.map((piece) => piece.group));
  assert.deepEqual([...groups].sort(), [
    "arms",
    "chest",
    "helm",
    "legs",
    "ribbon",
    "shoulders",
    "tail",
    "waist",
  ]);
  let tiles = 0;
  for (const piece of REXONANCE_SUIT_PIECES) {
    assert.ok(piece.ax + piece.w <= REXONANCE_SUIT_ATLAS.width / 2, piece.id);
    assert.ok(piece.ay + piece.h <= REXONANCE_SUIT_ATLAS.height, piece.id);
    assert.match(piece.dir, /^(up|down|left|right)$/);
    for (const byte of Buffer.from(piece.tiles, "base64"))
      for (let bit = 0; bit < 8; bit += 1) tiles += (byte >> bit) & 1;
  }
  assert.ok(tiles >= 2000, `micro-tiles: ${tiles}`);
  assert.ok(REXONANCE_SUIT_TILE >= 6 && REXONANCE_SUIT_TILE <= 12);
  for (const piece of REXONANCE_SUIT_PIECES) {
    assert.ok(piece.x >= 0 && piece.y >= 0, piece.id);
    assert.ok(
      piece.x + piece.w <= REXONANCE_SUIT_SIZE.width &&
        piece.y + piece.h <= REXONANCE_SUIT_SIZE.height,
      piece.id,
    );
  }
  assert.ok(REXONANCE_SUIT_FACE_GLOW.length >= 8);
  // The pipeline is committed with its source.
  assert.ok(
    existsSync(new URL("../design/rexonance-suit/rexonance-full-20261010.jpg", import.meta.url)),
  );
  assert.match(read("scripts/build-rexonance-suit.mjs"), /src\/lib\/rexonance-suit\.ts/);
  // Each plate is a mote (its gathered mosaic) and a window over its art,
  // drawn from the atlas; the face's squares are drawn once, from a seed,
  // so server and client render the same.
  assert.match(component, /className=\{`rx-suit-mote is-\$\{piece\.group\}`\}/);
  assert.match(component, /className=\{`rx-suit-plate is-\$\{piece\.group\}`\}/);
  assert.match(component, /<i className="rx-suit-art" style=\{atlasCell\(piece, 0\)\} \/>/);
  // rx13: the nanite engine is its own module (it reads the browser), the
  // overlay's own clock drives it, and the DOM plates stand down only once
  // it runs.
  const nanites = read("src/components/rexonance-saga/rexonance-suit-nanites.tsx");
  assert.match(nanites, /querySelector\(".rx-call-meter > i"\)/);
  assert.match(nanites, /getAnimations\(\)\[0\]/);
  assert.match(nanites, /now > START_BY/);
  assert.match(nanites, /cancelAnimationFrame/);
  assert.doesNotMatch(
    nanites,
    /setInterval|setTimeout|Math\.random|filter =|globalCompositeOperation/,
  );
  assert.match(
    sheet,
    /\.rx-suit\[data-nanites="canvas"\] \.rx-suit-build > :is\(\.rx-suit-mote, \.rx-suit-plate\) \{\s*display: none;/,
  );
  assert.match(component, /const seeded = \(seed: number\)/);
  assert.doesNotMatch(component, /Math\.random/);
  // The rig wakes with the HUD; the core's seed glows on RIDER！ and the
  // face's halo with its lights.
  assert.ok(
    layerTimes(declaration(covering(".rx-suit-stage").body, "animation"), {}).end <
      REXONANCE_CALL_BEATS[1].start + 100,
  );
  const seed = layerTimes(declaration(covering(".rx-suit-halo.is-core").body, "animation"), {});
  assert.ok(
    seed.delay >= REXONANCE_CALL_BEATS[1].start && seed.delay < REXONANCE_CALL_BEATS[2].start,
  );
  const eyes = layerTimes(declaration(covering(".rx-suit-halo.is-eyes").body, "animation"), {});
  assert.ok(eyes.delay >= REXONANCE_CALL_BEATS[4].start);
  // The gate warms the pieces on a link's intent and when the call starts,
  // builds only if they are decoded (else the finished figure stands), and
  // switches late only inside FAR UP！'s scan.
  const gate = read("src/components/load-gate.tsx");
  assert.match(gate, /if \(to === "\/rexonance-saga"\) void warmRexonanceSuit\(\);/);
  assert.match(gate, /if \(isRexonanceSuitReady\(\)\) rexonanceSuit = "build";/);
  assert.match(gate, /performance\.now\(\) - startedAt > REXONANCE_SUIT_LATE_MS/);
  assert.match(gate, /suit=\{rexonanceSuit\}/);
  assert.match(component, /suit = "whole",/);
  // Motes gather on RIDER！ and are spent by the chant's end.
  const motes = layerTimes(declaration(covering(".rx-suit-motes").body, "animation"), {});
  assert.equal(motes.delay, REXONANCE_CALL_BEATS[1].start);
  assert.ok(motes.end <= REXONANCE_CALL_BEATS[3].start);
});
