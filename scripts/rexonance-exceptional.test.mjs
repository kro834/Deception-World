import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  planStageCall,
  REXONANCE_STAGE_CALL_REST_MS,
  REXONANCE_STAGE_CARD_LEAVE_MS,
  REXONANCE_STAGE_ENTRANCE_DELAY_MS,
} from "../src/lib/rexonance-stage-call.ts";
import { REXONANCE_STAGE_DURATION_MS } from "../src/lib/rexonance-calls.ts";

/* 2026-10-03 rx2: Rexonance, made exceptional — the Premiere edition
   (src/styles-rexonance-premiere.css), the premiere call (additions to
   src/styles-rexonance-calls.css), the stage-card rest guard
   (src/lib/rexonance-stage-call.ts) and their textless ornaments. These
   pin the safety properties: scope, gating, finite motion with no loops,
   flash-safe stage cadences, the 12px floor and forced colours. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const premiere = strip(read("src/styles-rexonance-premiere.css"));
const calls = strip(read("src/styles-rexonance-calls.css"));
const route = read("src/routes/rexonance-saga.tsx");
const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
const sequence = read("src/components/rexonance-saga/rexonance-call-sequence.tsx");

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

// Style rules with their at-rule context, and keyframe blocks by name.
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

const sheet = parse(premiere);
const callSheet = parse(calls);

const REDUCED = /prefers-reduced-motion:\s*no-preference/;
const SCROLL_GATE =
  /^html(?:\[data-ios27-enhanced="true"\])?:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\) \.rxs-page\.rxs-page\.rxs-rexonance-page\[data-motion-ready="true"\]/;
const TIME_GATE = /^html:not\(\[data-world-effects="economy"\]\)/;
const moves = (body) => {
  const animation = declaration(body, "animation") ?? declaration(body, "animation-name");
  return Boolean(animation) && !/^none$/.test(animation);
};
const timed = (body) => {
  const timeline = declaration(body, "animation-timeline");
  return Boolean(timeline) && !/^(?:auto|none)$/.test(timeline);
};
const ms = (token) => {
  const value = token.match(/^(-?[\d.]+)(ms|s)$/);
  return value ? Number(value[1]) * (value[2] === "s" ? 1000 : 1) : null;
};

test("the premiere sheet loads last on its route, before the cinematic sheet, and nowhere else", () => {
  const links = route.slice(route.search(/links:\s*\[/));
  const finish = links.indexOf("href: rexonanceFinishCssUrl");
  const premiereLink = links.indexOf("href: rexonancePremiereCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(finish > 0 && finish < premiereLink && premiereLink < cinematic);
  assert.match(
    route,
    /import rexonancePremiereCssUrl from "@\/styles-rexonance-premiere\.css\?url"/,
  );
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /rexonance-premiere/, path);
  }
});

test("every premiere rule is scoped to the Rexonance page, so Extreme and Final Stage never see it", () => {
  assert.ok(sheet.rules.length > 60);
  for (const { selector } of sheet.rules) {
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^(?:html(?:\[[^\]]+\])?(?::not\(\[[^\]]+\]\))* )?\.rxs-page\.rxs-page\.rxs-rexonance-page\b/,
        part,
      );
      assert.doesNotMatch(part, /\.exs-|\.fst-/, part);
    }
  }
});

test("keyframes move only opacity, transforms and clip-path, turn once at most, and never loop", () => {
  assert.doesNotMatch(premiere, /\binfinite\b|!important|animation-iteration-count/);
  assert.doesNotMatch(
    calls.slice(calls.indexOf(".rx-call-beat {\n  font-feature")),
    /\binfinite\b/,
  );
  assert.ok(sheet.keyframes.size >= 30);
  for (const [name, body] of sheet.keyframes) {
    assert.match(name, /^rxp-/, name);
    const properties = [...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]);
    for (const property of properties) {
      assert.ok(
        ["opacity", "transform", "translate", "scale", "rotate", "clip-path"].includes(property),
        `${name}: ${property}`,
      );
    }
    // Opacity changes direction at most once (a ping rises and falls once).
    const opacities = [...body.matchAll(/opacity:\s*([\d.]+)/g)].map((match) => Number(match[1]));
    let turns = 0;
    let direction = 0;
    for (let index = 1; index < opacities.length; index += 1) {
      const next = Math.sign(opacities[index] - opacities[index - 1]);
      if (next && direction && next !== direction) turns += 1;
      if (next) direction = next;
    }
    assert.ok(turns <= 1, `${name} strobes`);
  }
});

test("clip-path only enters by time, fills backwards, and never rides a scroll timeline", () => {
  const clipping = new Set(
    [...sheet.keyframes].filter(([, body]) => /clip-path/.test(body)).map(([name]) => name),
  );
  assert.ok(clipping.size >= 5);
  for (const { selector, body } of sheet.rules) {
    const animation = declaration(body, "animation");
    if (!animation) continue;
    for (const layer of splitTopLevel(animation)) {
      const name = splitTopLevel(layer, " ").find((token) => clipping.has(token));
      if (!name) continue;
      assert.match(layer, /\bbackwards\b/, `${selector}: ${layer}`);
      assert.doesNotMatch(layer, /\b(?:both|forwards)\b/, `${selector}: ${layer}`);
    }
    if (timed(body)) {
      const names = splitTopLevel(declaration(body, "animation-name") ?? animation ?? "");
      const timelines = splitTopLevel(declaration(body, "animation-timeline"));
      names.forEach((layer, index) => {
        const name = splitTopLevel(layer, " ").find((token) => clipping.has(token));
        if (name) assert.match(timelines[index % timelines.length], /^auto$/, selector);
      });
    }
  }
});

test("time-based motion is gated by reduced motion and economy, finite and quick", () => {
  let checked = 0;
  for (const { selector, body, context } of sheet.rules) {
    if (timed(body) || !moves(body)) continue;
    // Scroll-gated overrides (the iOS 27 heading) answer to the scroll test.
    if (splitTopLevel(selector).every((part) => SCROLL_GATE.test(part))) continue;
    const overrides = !declaration(body, "animation") && !declaration(body, "animation-name");
    if (overrides) continue;
    checked += 1;
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      `${selector}: reduced-motion gate`,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(part, TIME_GATE, part);
      if (/\.rxs-hero\b|\.rxs-hero-|\.rxs-aperture|\.rxs-scroll-cue|\.rxp-ring/.test(part)) {
        assert.match(part, /:not\(\[data-loading\]\)/, part);
      }
    }
    const animation = declaration(body, "animation");
    if (!animation) continue;
    for (const layer of splitTopLevel(animation)) {
      const tokens = splitTopLevel(layer, " ");
      if (tokens.includes("linear") && tokens.length <= 3 && tokens.some((t) => /^mx-/.test(t)))
        continue;
      const times = tokens.map(ms).filter((value) => value !== null);
      const entrance = /var\(--rxp-entrance-delay/.test(layer)
        ? REXONANCE_STAGE_ENTRANCE_DELAY_MS + Number(layer.match(/\+ (\d+)ms/)?.[1] ?? 0)
        : 0;
      const [duration = 0, delay = 0] = times;
      assert.ok(duration > 0 && duration <= 1500, `${selector}: ${layer}`);
      assert.ok(duration + Math.max(delay, entrance) <= 2000, `${selector}: ${layer}`);
    }
  }
  assert.ok(checked >= 25, String(checked));
});

test("scroll-linked motion runs on named timelines behind the full gate", () => {
  const scroll = sheet.rules.filter(({ body }) => timed(body));
  assert.ok(scroll.length >= 18);
  for (const { selector, body, context } of scroll) {
    assert.ok(
      context.some((at) => /animation-timeline:\s*view\(\)/.test(at)),
      selector,
    );
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    const timelines = splitTopLevel(declaration(body, "animation-timeline"));
    const hero = /\.rxs-hero-visual img$/.test(selector);
    for (const part of splitTopLevel(selector)) {
      if (hero) {
        // The iris joins the motion sheet's recede, the only anonymous view.
        assert.match(
          part,
          /:not\(\[data-loading\]\) \.rxs-page\.rxs-page\.rxs-rexonance-page\[data-motion-ready="true"\]/,
        );
        assert.deepEqual(timelines, ["auto", "view(block)"]);
        assert.match(declaration(body, "animation"), /mx-recede linear both/);
        continue;
      }
      assert.match(part, SCROLL_GATE, part);
    }
    if (hero) continue;
    for (const timeline of timelines) assert.match(timeline, /^--[\w-]+$/, selector);
    assert.equal(declaration(body, "animation-duration"), "auto", selector);
    assert.equal(declaration(body, "animation"), undefined, selector);
  }
  for (const { selector, body } of sheet.rules.filter(({ body }) => /view-timeline/.test(body))) {
    for (const part of splitTopLevel(selector)) assert.match(part, SCROLL_GATE, part);
    assert.match(declaration(body, "view-timeline"), /^--rxp-[\w-]+ block$/);
  }
});

test("economy rendering, scroll locks and first paint rest drawn", () => {
  const economy = sheet.rules.filter(({ selector }) =>
    selector.startsWith('html[data-world-effects="economy"]'),
  );
  const calm = economy.map(({ selector, body }) => `${selector} ${body}`).join("\n");
  assert.match(calm, /\.rxs-reveal[\s\S]*opacity: 1; translate: none; transition: none/);
  for (const target of [
    ".rxs-comparison-metrics",
    ".rxs-p14-metrics",
    ".rxs-bars i",
    ".rxs-stage-panel figure",
    ".rxs-stage-panel > div > *",
    ".rxs-p14-overview figure",
  ]) {
    assert.ok(calm.includes(target), target);
  }
  for (const flag of ["data-side-menu-open", "data-dialog-open", "data-loading"]) {
    const rest = sheet.rules.find(
      ({ selector, body }) => selector.startsWith(`html[${flag}]`) && body === "animation: none;",
    );
    assert.ok(rest, flag);
    for (const part of splitTopLevel(rest.selector))
      assert.match(part, new RegExp(`^html\\[${flag}\\] `));
  }
  assert.ok(
    sheet.rules.some(
      ({ selector, body }) =>
        selector.includes("#rxs-stage-panel:not([data-entrance])") && body === "animation: none;",
    ),
    "no panel ceremony at first paint",
  );
});

test("the iOS 27 owners keep their animation; the scan keeps its pinned name", () => {
  for (const { selector, body } of sheet.rules) {
    if (!/(?:^|;)\s*animation(?:-name)?\s*:/.test(body)) continue;
    for (const part of splitTopLevel(selector)) {
      assert.doesNotMatch(part, /\.rxs-hero-visual$|\.rxs-section-heading$/, part);
      if (/\.rxs-stage-scan$/.test(part)) {
        assert.equal(declaration(body, "animation"), undefined, part);
        assert.equal(declaration(body, "animation-name"), undefined, part);
      }
    }
  }
});

test("ornaments are absolute and inert; stage cards restart only their signature", () => {
  for (const { selector, body } of sheet.rules) {
    if (!/(?:^|;)\s*content\s*:/.test(body)) continue;
    assert.match(body, /position: absolute/, selector);
    assert.match(body, /pointer-events: none/, selector);
  }
  for (const { selector, body } of sheet.rules) {
    if (!/\[data-stage="(?:standard|max|ultra)"\]/.test(selector)) continue;
    if (!/animation/.test(body)) continue;
    for (const part of splitTopLevel(selector)) assert.match(part, /\.rx-call-signature/, part);
  }
  for (const [selector, protectedControl] of sheet.rules.flatMap(({ selector, body }) =>
    splitTopLevel(selector).map((part) => [
      part,
      /\.rxs-stage-tabs|\.liquid-|\.rxs-p14-ios-|select\b|\.rxs-local-nav-inner|\.rxs-menu-trigger/.test(
        part,
      ) && /(?:^|;)\s*(?:width|height|inset|top|left|right|bottom|margin|padding|grid)/.test(body),
    ]),
  )) {
    assert.equal(protectedControl, false, selector);
  }
});

test("text keeps its 12px floor and forced colours hide every new ornament", () => {
  for (const [path, css] of [
    ["premiere", premiere],
    ["calls", calls],
  ]) {
    for (const [, value] of css.matchAll(/font-size:\s*([^;]+);/g)) {
      const px = value.match(/^(\d+(?:\.\d+)?)px$/);
      if (px) assert.ok(Number(px[1]) >= 12, `${path}: ${value}`);
      const clamp = value.match(/^clamp\((\d+(?:\.\d+)?)px,/);
      if (clamp) assert.ok(Number(clamp[1]) >= 12, `${path}: ${value}`);
    }
  }
  assert.match(calls, /\.rx-call-caption \{[^}]*font-size: clamp\(12px, 0\.84vw, 13px\)/);
  assert.match(calls, /\.rx-call-operating-stage \{[^}]*font-size: clamp\(12px, 1vw, 14px\)/);
  const forced = sheet.rules
    .filter(({ context }) => context.some((at) => /forced-colors:\s*active/.test(at)))
    .map(({ selector, body }) => `${selector} { ${body} }`)
    .join("\n");
  for (const ornament of [".rxp-ring", ".rxp-gauge", ".rx-call-signature", ".rx-call-ground > i"]) {
    assert.ok(forced.includes(ornament), ornament);
  }
  assert.match(forced, /display: none/);
  const callsForced = callSheet.rules
    .filter(({ context }) => context.some((at) => /forced-colors:\s*active/.test(at)))
    .map(({ selector }) => selector)
    .join("\n");
  for (const ornament of [".rx-call-aperture", ".rx-call-signature", ".rx-call-ground > i"]) {
    assert.ok(callsForced.includes(ornament), ornament);
  }
});

test("the premiere call keeps its clock, its rows and its first lines", () => {
  const added = parse(calls.slice(calls.indexOf(".rx-call-beat {\n  font-feature"))).rules;
  assert.ok(added.length > 20);
  for (const { selector, body, context } of added) {
    if (!moves(body) && !/animation-delay|animation-duration/.test(body)) continue;
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    // rx3: the suit-up's stage-card badge moves too, behind the same gates
    // (scripts/rexonance-suitup.test.mjs pins its timing and scope).
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^html:not\(\[data-world-effects="economy"\]\) \.rx-call-sequence(?:\[data-mode="entry"\]\[data-tier="full"\]|\[data-mode="stage"\]\[data-tier="full"\] \.rx-suit-(?:badge|crest))/,
        part,
      );
    }
  }
  // The middle pair of each four-line block and REXONANCE DEUS！ are never
  // hidden: they strike with the beat, so the middle of the frame stays lit
  // from call to call (rx2 fix: a top-down / bottom-up reveal darkened it
  // between beats, 2 flashes/s on portrait tablets). Only the outer pair
  // waits a quarter-beat.
  const hidden = added
    .filter(({ selector, body }) => /> span/.test(selector) && /(?:^|;)\s*opacity: 0;/.test(body))
    .map(({ selector }) => selector);
  assert.deepEqual(hidden.map((selector) => selector.replace(/^.*\] /, "")).sort(), [
    ".rx-call-chant > span:is(:first-child, :last-child)",
    ".rx-call-repetition > span:is(:first-child, :last-child)",
  ]);
  const outerDelays = added
    .filter(({ selector }) => /\.rx-call-(?:chant|repetition) > span/.test(selector))
    .map(({ body }) => body.match(/animation-delay: ([^;]+);/)?.[1])
    .filter(Boolean);
  assert.equal(outerDelays.length, 4);
  for (const delay of outerDelays) {
    assert.match(
      delay,
      /^calc\(var\(--rx-call-start\) \+ var\(--rx-call-duration\) \/ 4( \+ 60ms)?\)$/,
    );
  }
  // Lines arrive sideways only, so each stays in its own row.
  for (const name of ["rxCallLineInLeft", "rxCallLineInRight"]) {
    const body = callSheet.keyframes.get(name);
    for (const [, x, y] of body.matchAll(/translate3d\(([^,]+), ([^,]+), 0\)/g)) {
      assert.match(x, /^-?0\.4em$/);
      assert.equal(y.trim(), "0");
    }
  }
  assert.match(callSheet.keyframes.get("rxCallDeusLock"), /translate3d\(0, 0\.25em, 0\)/);
  // The ground still fades on its own reveal clock (the measured hand-over).
  assert.ok(
    added.some(
      ({ selector, body }) =>
        /\[data-phase="revealing"\] \.rx-call-ground$/.test(selector) &&
        /rxCallGroundHold var\(--rx-call-reveal\) linear both/.test(body),
    ),
  );
  // Blades show only while the full tier reveals; stage cards show their own.
  const blades = [...added, ...sheet.rules].filter(
    ({ selector, body }) => /\.rx-call-ground > i$/.test(selector) && /display: block/.test(body),
  );
  assert.equal(blades.length, 2);
  for (const { selector } of blades) {
    assert.match(selector, /\[data-tier="full"\]/);
    assert.match(selector, /\[data-phase="revealing"\]|\[data-mode="stage"\]/);
  }
  // rx2 fix: pwid sets the fallback ！ at its proportional width (palt alone
  // left a 0.63em gap before it).
  assert.match(calls, /\.rx-call-beat \{\s*font-feature-settings: "palt", "pwid";/);
});

test("the call ornaments are textless <i> elements and keep the component SSR-stable", () => {
  assert.match(sequence, /<div className="rx-call-ground">\s*<i \/>\s*<i \/>\s*<i \/>\s*<\/div>/);
  assert.match(sequence, /<div className="rx-call-aperture">\s*<i \/>\s*<i \/>\s*<i \/>\s*<\/div>/);
  assert.match(sequence, /<div className="rx-call-signature">\s*<i \/>\s*<\/div>/);
  assert.equal((sequence.match(/<span>/g) ?? []).length, 14);
  assert.match(sequence, /"--rx-call-response-start": `\$\{REXONANCE_CALL_BEATS\[3\]\.start\}ms`/);
  const ornaments = page.match(/<i className="rxp-[^"]+"[^>]*\/>/g) ?? [];
  assert.equal(ornaments.length, 5);
  for (const ornament of ornaments.filter((item) => item.includes("rxp-gauge"))) {
    assert.match(ornament, /aria-hidden="true"/);
  }
  const visual = page.match(
    /<div className="rxs-hero-visual" aria-hidden="true">[\s\S]*?<\/div>/,
  )?.[0];
  assert.equal((visual?.match(/className="rxp-ring/g) ?? []).length, 3);
});

test("selectStage plans each card, stamps the panel and arms the rest only on a natural exit", () => {
  assert.match(page, /const plan = planStageCall\(\{/);
  assert.match(page, /setStageEntrance\(plan\.entrance\)/);
  assert.match(page, /data-entrance=\{stageEntrance\?\.kind\}/);
  assert.match(
    page,
    /"--rxp-entrance-delay" as string\]: `\$\{stageEntrance\?\.delayMs \?\? 0\}ms`/,
  );
  // Armed only by a natural exit; a calm interlude (no motion) clears it.
  assert.deepEqual(page.match(/stageCallExitedAt\.current = [^;]+;/g), [
    "stageCallExitedAt.current = Number.NEGATIVE_INFINITY;",
    "stageCallExitedAt.current = performance.now();",
  ]);
  assert.match(
    page,
    /if \(!motionAllowed\) \{\s*cancelStageCall\(\);\s*stageCallExitedAt\.current = Number\.NEGATIVE_INFINITY;/,
  );
  assert.match(
    page,
    /stageCallTimer\.current = 0;\s*stageCallExitedAt\.current = performance\.now\(\);\s*setStageCall\(null\);/,
  );
  const cancel = page.match(
    /const cancelStageCall = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/,
  )?.[0];
  assert.ok(cancel);
  assert.doesNotMatch(cancel, /stageCallExitedAt/);
  // Where view timelines run, the desktop parallax no longer writes per frame.
  assert.match(page, /CSS\.supports\("animation-timeline", "view\(\)"\)/);
});

// A tap cadence driven through the planner with the card's real lifecycle.
function simulate(gap, { taps = 24, allowed = () => true } = {}) {
  let card = null;
  let exitedAt = Number.NEGATIVE_INFINITY;
  const starts = [];
  const plans = [];
  for (let index = 0; index < taps; index += 1) {
    const now = index * gap;
    if (card && now - card.start >= REXONANCE_STAGE_DURATION_MS) {
      exitedAt = card.start + REXONANCE_STAGE_DURATION_MS;
      card = null;
    }
    const plan = planStageCall({
      motionAllowed: allowed(now),
      cardMounted: Boolean(card),
      cardElapsedMs: card ? now - card.start : 0,
      sinceNaturalExitMs: now - exitedAt,
    });
    plans.push({ now, ...plan });
    if (plan.action === "skip" && !allowed(now)) {
      card = null;
      exitedAt = Number.NEGATIVE_INFINITY;
    }
    if (plan.action === "mount") {
      card = { start: now };
      starts.push(now);
    }
  }
  return { starts, plans };
}

// A card is down for one turn and up for one; cards at least 950 ms apart
// and luminance-floored quiet entrances keep any second to three turns
// (audited frame-exactly at 250-1100 ms cadences on 390, 412 and 1440).
test("the rest guard spaces cards at least 950 ms apart at every tapping cadence", () => {
  assert.equal(REXONANCE_STAGE_CALL_REST_MS, 300);
  assert.equal(REXONANCE_STAGE_ENTRANCE_DELAY_MS, 380);
  assert.equal(REXONANCE_STAGE_CARD_LEAVE_MS, 330);
  for (const gap of [16, 100, 250, 400, 650, 700, 750, 900, 949, 950, 1000, 1100, 2000]) {
    const { starts, plans } = simulate(gap);
    for (let index = 1; index < starts.length; index += 1) {
      assert.ok(starts[index] - starts[index - 1] >= 950, `${gap}ms: ${starts.join(", ")}`);
    }
    for (const { action, entrance, now } of plans) {
      assert.ok(entrance.delayMs >= 0 && entrance.delayMs <= 380, `${gap}ms @${now}`);
      if (action === "skip") assert.deepEqual(entrance, { kind: "quiet", delayMs: 0 });
      if (action === "mount") assert.deepEqual(entrance, { kind: "card", delayMs: 380 });
    }
  }
});

test("a running card is retargeted, and quietly once it has begun to leave", () => {
  const early = planStageCall({
    motionAllowed: true,
    cardMounted: true,
    cardElapsedMs: 120,
    sinceNaturalExitMs: Infinity,
  });
  assert.deepEqual(early, { action: "retarget", entrance: { kind: "card", delayMs: 260 } });
  const late = planStageCall({
    motionAllowed: true,
    cardMounted: true,
    cardElapsedMs: 420,
    sinceNaturalExitMs: Infinity,
  });
  assert.deepEqual(late, { action: "retarget", entrance: { kind: "quiet", delayMs: 0 } });
  const due = planStageCall({
    motionAllowed: true,
    cardMounted: true,
    cardElapsedMs: 660,
    sinceNaturalExitMs: Infinity,
  });
  assert.equal(due.action, "skip");
  assert.deepEqual(
    planStageCall({
      motionAllowed: true,
      cardMounted: false,
      cardElapsedMs: 0,
      sinceNaturalExitMs: 100,
    }),
    { action: "skip", entrance: { kind: "quiet", delayMs: 0 } },
  );
  assert.equal(
    planStageCall({
      motionAllowed: true,
      cardMounted: false,
      cardElapsedMs: 0,
      sinceNaturalExitMs: 300,
    }).action,
    "mount",
  );
  // Hidden, reduced motion, economy, Save-Data and 2G never show a card.
  for (const cardMounted of [false, true]) {
    assert.deepEqual(
      planStageCall({
        motionAllowed: false,
        cardMounted,
        cardElapsedMs: 10,
        sinceNaturalExitMs: Infinity,
      }),
      { action: "skip", entrance: { kind: "quiet", delayMs: 0 } },
    );
  }
  // A cancellation (hidden tab) does not arm the rest: the next tap mounts.
  const { plans } = simulate(300, { taps: 3, allowed: (now) => now !== 300 });
  assert.deepEqual(
    plans.map(({ action }) => action),
    ["mount", "skip", "mount"],
  );
  // A calm interlude just after a natural exit ends the streak, and the card
  // that follows is still rest-guarded against the next one.
  const interlude = simulate(350, { taps: 6, allowed: (now) => now !== 700 });
  assert.deepEqual(
    interlude.plans.map(({ action }) => action),
    ["mount", "retarget", "skip", "mount", "retarget", "skip"],
  );
});

// rx2 fix-1: the panel's new form waits behind a backwards-filled clip from
// the tap, so the card must be opaque from its first frame. A card that
// faded in over ~80 ms showed the stage panel emptied under it (rest → tap
// frame mean luminance 0.044 → 0.003 at 1440 with the panel dark for five
// frames). Now the blades cut in; only the words, signature and frame fade.
test("a stage card cuts in opaque, so a tap never shows the panel emptied", () => {
  const card = '> .rx-call-sequence[data-mode="stage"][data-tier="full"]';
  const gated = ({ context }) =>
    context.some((at) => REDUCED.test(at) && /forced-colors:\s*none/.test(at));
  const container = sheet.rules.filter(
    ({ selector, body }) => selector.endsWith(card) && /animation/.test(body),
  );
  assert.equal(container.length, 1);
  assert.equal(container[0].body, "animation: none;");
  assert.ok(gated(container[0]));
  const layers = sheet.rules.find(
    ({ selector }) =>
      selector.startsWith('html:not([data-world-effects="economy"])') &&
      selector.includes(`${card} :is(`) &&
      /\.rx-call-words/.test(selector),
  );
  assert.ok(layers && gated(layers));
  assert.doesNotMatch(layers.selector, /\.rx-call-ground/);
  assert.deepEqual(splitTopLevel(declaration(layers.body, "animation")), [
    "rxp-card-in 80ms linear backwards",
    "rxp-stage-quiet 80ms linear 330ms forwards",
  ]);
  assert.match(sheet.keyframes.get("rxp-card-in"), /^\s*from \{\s*opacity: 0;\s*\}\s*$/);
  // Nothing fades the card's ground in: the blades stand from the first frame.
  for (const { selector, body } of [...sheet.rules, ...callSheet.rules]) {
    if (!/\.rx-call-ground(?: > i)?$/.test(selector) || !/data-mode="stage"/.test(selector))
      continue;
    const animation = declaration(body, "animation") ?? "";
    assert.doesNotMatch(animation, /rxp-card-in|rxCallStageLife|rxp-stage-life/, selector);
  }
  // The panel waits behind the card only with a card entrance.
  const waits = sheet.rules.filter(({ body }) => /rxp-(?:floor-rise|resolve) \d/.test(body));
  assert.ok(waits.length >= 2);
  for (const { selector } of waits)
    for (const part of splitTopLevel(selector))
      assert.match(part, /#rxs-stage-panel\[data-entrance="card"\]/, part);
});
