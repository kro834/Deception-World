import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ASSEMBLY_BEATS,
  ASSEMBLY_PARTS,
  ASSEMBLY_TOUCH_ART_BUDGET,
  mountRexonanceAssembly,
  planAssembly,
  assemblyGoldPlanSteps,
} from "../src/lib/rexonance-resonance.js";
import {
  REXONANCE_SUIT_MARKS,
  REXONANCE_SUIT_PIECES,
  REXONANCE_SUIT_SIZE,
  REXONANCE_SUIT_TILE,
} from "../src/lib/rexonance-suit.ts";
import {
  REXONANCE_LAYOUT_BOOT_SCRIPT,
  syncRexonanceLayoutGate,
} from "../src/lib/rexonance-layout-gate.js";
import { NANITE_FIRE_PHASES } from "../src/lib/rexonance-ignition.js";
import { inspectBodyFlame } from "../src/lib/rexonance-flame.js";
import { POSE_TIME } from "../src/lib/rexonance-fire/fire-pose.js";
import { scrollFlameAt } from "../src/lib/rexonance-field/field-clock.js";
import { runInNewContext } from "node:vm";

/* 2026-10-11 rx15: Rexonance, ZENITH — the suit-up on the page
   (src/styles-rexonance-zenith.css, mountRexonanceAssembly and
   planAssembly in src/lib/rexonance-resonance.js). The owner asked for the
   suit-up to feel like nanomachines, cut very fine and attached in turn,
   and for the special site to take a big step with it: between 02 and 03
   the reader plays the published call with the scroll and the armour
   assembles out of nanite tiles; the held stage reads out 01 and 02; 03
   is a fitted form viewer with a nanite sweep; the end card stands the
   finished suit behind the last line. These pin where the layer loads,
   its scope, its motion discipline, the pinned runway as a layout of the
   persistent preferences only, forced colours, the 12px floor, that the
   scene reads only the suit module fields every revision keeps, and the
   engine's plan and lifecycle. */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const css = strip(read("src/styles-rexonance-zenith.css"));
const route = read("src/routes/rexonance-saga.tsx");
const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
const browserHarness = read("scripts/verify-rexonance-zenith.mjs");

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

function parse(text) {
  const rules = [];
  const keyframes = new Map();
  const stack = [];
  let prelude = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < text.length && depth > 0; end += 1) {
          if (text[end] === "{") depth += 1;
          if (text[end] === "}") depth -= 1;
        }
        keyframes.set(frames[1], text.slice(index + 1, end - 1));
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = text.indexOf("}", index);
      rules.push({ selector: head, body: flat(text.slice(index + 1, end)), context: [...stack] });
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

const sheet = parse(css);
const REDUCED = /prefers-reduced-motion:\s*no-preference/;
const SUPPORTS =
  /^@supports \(animation-timeline: view\(\)\) and \(animation-range: entry 0% entry 100%\)$/;
const FULL_GATE =
  /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-dialog-open\]\) body \.rxs-page\.rxs-page\.rxs-rexonance-page:not\(\[data-route-covered\]\)/;

test("loading gates are local to the Rexonance page, not the document root", () => {
  assert.doesNotMatch(css, /data-loading/);
  assert.match(css, /\.rxs-page\.rxs-page\.rxs-rexonance-page\[data-motion-ready="true"\]/);
});

const moves = (body) => {
  const animation = declaration(body, "animation") ?? declaration(body, "animation-name");
  return Boolean(animation) && animation !== "none";
};
const timed = (body) => {
  const timeline = declaration(body, "animation-timeline");
  return Boolean(timeline) && !/^(?:auto|none)$/.test(timeline);
};

test("the ZENITH sheet loads after RESONANCE, before the cinematic sheet, on its route only", () => {
  assert.match(route, /import rexonanceZenithCssUrl from "@\/styles-rexonance-zenith\.css\?url"/);
  const links = route.slice(route.search(/links:\s*\[/));
  const resonance = links.indexOf("href: rexonanceResonanceCssUrl");
  const zenith = links.indexOf("href: rexonanceZenithCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(resonance > 0 && resonance < zenith && zenith < cinematic);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/extreme-saga.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /rexonance-zenith/, path);
  }
});

test("browser QA captures the requested viewports and both directions with canvas evidence", () => {
  for (const profile of [
    "desktop1440",
    "phone390",
    "phone844-landscape",
    "narrow320",
    "tablet1024-landscape",
    "reduced-motion390",
  ])
    assert.match(browserHarness, new RegExp(`name: \\"?${profile}\\"?`), profile);
  assert.match(browserHarness, /CAPTURE=1/);
  assert.match(browserHarness, /CAPTURE_BASELINE=1/);
  assert.match(browserHarness, /CAPTURE_FORM=standard\|max\|ultra\|excelsior/);
  assert.match(browserHarness, /captureBaseline \? "max" : "ultra"/);
  assert.match(browserHarness, /CAPTURE_PROFILES/);
  assert.match(browserHarness, /BROWSER=webkit/);
  assert.match(browserHarness, /direction: "forward"/);
  assert.match(browserHarness, /direction: "reverse"/);
  assert.match(browserHarness, /direction: "forward", progress: 0\.975, name: "form-complete"/);
  assert.match(browserHarness, /dataset\.rznFormComplete === "true"/);
  assert.match(browserHarness, /CanvasRenderingContext2D\.prototype\.drawImage/);
  assert.match(browserHarness, /nanite target must resolve above zero/);
  assert.match(browserHarness, /r\.querySelector\("\.rzn-count"\)/);
  assert.match(browserHarness, /alphaPixels/);
  assert.match(browserHarness, /pixelHash/);
  assert.match(browserHarness, /reduced-motion-static\.png/);
  assert.match(browserHarness, /rxs-stage-tab-\$\{captureForm\}/);
  assert.match(browserHarness, /Math\.abs\(frame\.getBoundingClientRect\(\)\.top - pin\)/);
  assert.match(browserHarness, /\.rzn-stamp/, "stamp bounds are captured");
  assert.match(browserHarness, /\.rzn-count/, "nanite count bounds are captured");
  assert.match(browserHarness, /\.rzn-nanites/, "nanites row bounds are captured");
  assert.match(browserHarness, /\.zeus-button/, "Zeus bounds are captured");
  assert.match(browserHarness, /stamp\/count\/Zeus overlap/);
  assert.match(browserHarness, /static call overlaps the artwork/);
  assert.match(browserHarness, /static artwork overlaps the parts list/);
  assert.match(browserHarness, /landscape stamp must clear Zeus/);
  assert.match(browserHarness, /portrait stamp must occupy its own HUD row/);
  assert.match(browserHarness, /evidence\.drawCalls > 0/);
  assert.match(browserHarness, /evidence\.alphaPixels > 0/);
  assert.match(browserHarness, /waitForCanvasConvergence/);
  assert.match(browserHarness, /quietFor >= 320 && frames >= 3/);
  assert.match(browserHarness, /direction === "forward" && progress >= 0\.975/);
  assert.match(browserHarness, /top: Math\.ceil\(/);
  assert.match(browserHarness, /state\.actualProgress \+ 1e-6 >= progress/);
  assert.match(
    browserHarness,
    /canvas pixels must match at \.35 after reverse and forward catchup/,
  );
});

test("every rule is scoped to the Rexonance page and leaves the bar, the menu and the calls alone", () => {
  assert.ok(sheet.rules.length > 60, String(sheet.rules.length));
  for (const { selector } of sheet.rules) {
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^html(?:\[data-family="special"\])(?::not\(\[[^\]]+\]\)| ?:not\(\s*\[[^\]]+\]\s*\))* body \.rxs-page\.rxs-page\.rxs-rexonance-page\b/,
        part,
      );
      assert.doesNotMatch(
        part,
        /\.exs-|\.fst-|\.rxs-local-nav|\.rxs-menu-trigger|\.side-panel|#site-side-panel|\.rx-call|\.rx-suit|\.load-gate/,
        part,
      );
    }
  }
});

test("keyframes are this sheet's own, move only opacity and transforms, and never loop", () => {
  assert.doesNotMatch(css, /\binfinite\b|animation-iteration-count|!important/);
  assert.ok(sheet.keyframes.size >= 6, String(sheet.keyframes.size));
  for (const [name, body] of sheet.keyframes) {
    assert.match(name, /^rzn-/, name);
    for (const [, property] of body.matchAll(/([\w-]+)\s*:/g)) {
      assert.ok(
        ["opacity", "transform", "translate", "scale", "rotate"].includes(property),
        `${name}: ${property}`,
      );
    }
  }
  assert.doesNotMatch(css, /mix-blend-mode|backdrop-filter|blur\(/);
  assert.doesNotMatch(css, /(?<![\w-])filter\s*:/);
});

const scrollLinked = ({ body, context }) =>
  timed(body) || (moves(body) && context.some((at) => SUPPORTS.test(at)));

test("scroll-linked motion rides named timelines behind the full gate", () => {
  const scroll = sheet.rules.filter(scrollLinked);
  assert.ok(scroll.length >= 8, String(scroll.length));
  for (const { selector, body, context } of scroll) {
    assert.ok(
      context.some((at) => SUPPORTS.test(at)),
      selector,
    );
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
    for (const timeline of splitTopLevel(declaration(body, "animation-timeline") ?? "")) {
      assert.match(timeline, /^--[\w-]+$/, `${selector}: ${timeline}`);
    }
    const names = splitTopLevel(declaration(body, "animation") ?? "").map(
      (layer) => splitTopLevel(layer, " ")[0],
    );
    for (const name of names) {
      const frames = sheet.keyframes.get(name);
      if (frames) assert.doesNotMatch(frames, /clip-path|color|background/, name);
    }
  }
  // Timelines are declared under persistent flags and the page-local cover gate.
  for (const { selector, body, context } of sheet.rules) {
    if (!/view-timeline|timeline-scope/.test(body)) continue;
    assert.ok(
      context.some((at) => SUPPORTS.test(at)),
      selector,
    );
    assert.doesNotMatch(selector, /data-side-menu-open|data-dialog-open|data-loading/);
    assert.match(selector, /\.rxs-page\.rxs-page\.rxs-rexonance-page\[data-motion-ready="true"\]/);
    assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/);
  }
  // The page's timeline-scope belongs to RESONANCE: ZENITH never redeclares
  // it (a second list would replace the first).
  assert.doesNotMatch(css, /timeline-scope/);
});

test("time-based motion is gated, keyed to the transient form flag, finite and quick", () => {
  let checked = 0;
  for (const rule of sheet.rules) {
    const { selector, body, context } = rule;
    if (scrollLinked(rule) || !moves(body)) continue;
    checked += 1;
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(part, FULL_GATE, part);
      // The form's transient flag, or the trinity's (its time-based
      // fallback where scroll timelines are missing).
      assert.match(part, /\[data-rsn-form\]|> \.rzn-trinity\[data-rsn-in\]/, part);
    }
    for (const layer of splitTopLevel(declaration(body, "animation") ?? "")) {
      const [duration = 0, delay = 0] = [...layer.matchAll(/(\d+)ms/g)].map((match) =>
        Number(match[1]),
      );
      assert.ok(duration > 0 && duration <= 1200, `${selector}: ${layer}`);
      // The trinity plays inside the 1.8 s its flag is held.
      assert.ok(duration + delay <= 1800, `${selector}: ${layer}`);
    }
  }
  assert.ok(checked >= 8, String(checked));
  // The mesh's diagonal stagger stays inside the transformation's window.
  const mesh = sheet.rules.find(
    ({ selector }) => /\.rzn-mesh > i$/.test(selector) && /data-rsn-form/.test(selector),
  );
  assert.match(mesh.body, /var\(--rzn-d, 0\) \* 34ms/);
  assert.match(page, /length: 12/);
});

test("transitions answer the engine's flags on the compositor, gated", () => {
  const transitions = sheet.rules.filter(({ body }) =>
    /(?:^|;)\s*transition(?:-[\w-]+)?\s*:/.test(body),
  );
  assert.ok(transitions.length >= 1);
  for (const { selector, body, context } of transitions) {
    assert.ok(
      context.some((at) => REDUCED.test(at)),
      selector,
    );
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
    for (const layer of splitTopLevel(declaration(body, "transition"))) {
      assert.match(layer, /^(?:opacity|translate|scale) \d+ms /, `${selector}: ${layer}`);
    }
  }
});

test("the pinned runway is a layout of the persistent preferences, never of the menu or dialogs", () => {
  const sticky = sheet.rules.filter(({ body }) => /position: sticky/.test(body));
  assert.equal(sticky.length, 1);
  const runway = sheet.rules.filter(
    ({ selector, body }) => /> \.rzn-suitup$/.test(selector) && /height: max\(/.test(body),
  );
  assert.equal(runway.length, 2);
  for (const { selector, context } of [...sticky, ...runway]) {
    assert.ok(
      context.some((at) => REDUCED.test(at) && /forced-colors: none/.test(at)),
      selector,
    );
    assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/);
    // The route-cover marker gates motion only; the runway's sticky geometry stays pinned.
    assert.doesNotMatch(
      selector,
      /data-side-menu-open|data-dialog-open|data-loading|data-route-covered|data-motion-ready|data-rzn-state/,
    );
    assert.match(selector, /:not\(\[data-rzn-constrained\]\)/);
  }
});

test("longer vortex travel belongs only to the animated runway, with still fallbacks left unpinned", () => {
  const runways = sheet.rules.filter(
    ({ selector, body, context }) =>
      /> \.rzn-suitup$/.test(selector) &&
      declaration(body, "height") &&
      !context.includes("@media print"),
  );
  assert.deepEqual(
    runways.map(({ body }) => declaration(body, "height")),
    ["max(2400px, 420svh)", "max(1950px, 360svh)"],
    "desktop and touch retain the longer travel without adding a base height",
  );
  for (const { selector, context } of runways) {
    assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/);
    assert.match(selector, /:not\(\[data-rzn-constrained\]\)/);
    const media = context.filter((at) => at.startsWith("@media")).join(" ");
    for (const branch of splitTopLevel(media)) {
      assert.match(branch, REDUCED, "every media alternative opts into full motion");
      assert.match(branch, /forced-colors: none/, "forced-colour stills never inherit the runway");
    }
  }
  assert.match(runways[1].context.join(" "), /max-width: 760px/);
  assert.match(runways[1].context.join(" "), /orientation: portrait/);
  for (const { selector, body, context } of sheet.rules.filter(
    ({ body }) => declaration(body, "position") === "sticky",
  )) {
    assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/);
    assert.match(selector, /:not\(\[data-rzn-constrained\]\)/);
    assert.ok(context.some((at) => REDUCED.test(at) && /forced-colors: none/.test(at)));
    assert.equal(declaration(body, "top"), "var(--dxs-nav)");
  }
});

test("text keeps its 12px floor; generated text is silent; forced colours drop the ornaments", () => {
  for (const [, value] of css.matchAll(/font(?:-size)?:\s*([^;]+);/g)) {
    for (const [, px] of value.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)px/g)) {
      // Line heights and clamp maxima are larger; the minimum is the floor.
      assert.ok(Number(px) >= 12, value);
    }
  }
  for (const [, value] of css.matchAll(/(?<![\w-])content:\s*([^;]+);/g)) {
    assert.match(value.trim(), /^(?:""|counter\([^)]*\) \/ "")$/, value);
  }
  const forced = sheet.rules
    .filter(({ context }) => context.some((at) => /forced-colors:\s*active/.test(at)))
    .map(({ selector, body }) => `${selector} { ${body} }`)
    .join("\n");
  for (const ornament of [
    ".rzn-trinity",
    ".rzn-canvas",
    ".rzn-light",
    ".rzn-floor",
    ".rzn-rail",
    ".rzn-callouts",
    ".rzn-mesh",
    ".rzn-form-code",
  ]) {
    assert.ok(forced.includes(ornament), ornament);
  }
  // The lock-ons are shown only by their motion rules, and those leave
  // forced colours out (a stronger selector there beat the hide above).
  for (const { selector, body, context } of sheet.rules) {
    if (selector.includes(".rzn-callouts") && /display:\s*block/.test(body))
      assert.ok(
        context.some((at) => /forced-colors:\s*none/.test(at)),
        `${selector} shows the lock-ons in forced colours`,
      );
  }
  // Every part's cell stays lit (the even cells' pink is painted out).
  assert.match(forced, /\.rzn-part:nth-child\(n\)::after \{[^}]*background: CanvasText/);
  // Where the end figure stands behind the last line, forced colours drop it.
  assert.match(forced, /\.rzn-end-figure \{\s*display: none;/);
});

test("the scene is decorative and passes the generated shape masks to its plan", () => {
  assert.match(page, /<div\s+ref=\{runwayRef\}\s+className="rzn-suitup"\s+aria-hidden="true"/);
  assert.match(
    page,
    // The atlas cell (ax, ay) is for the gold (owner, 2026-10-11); preset is the driver.
    /REXONANCE_SUIT_PIECES\.map\(\(\{ id, group, x, y, w, h, seat, tiles, ax, ay \}\) => \(\{\s*id,\s*group,\s*x,\s*y,\s*w,\s*h,\s*seat,\s*tiles,\s*ax,\s*ay,[\s\S]*?preset: REXONANCE_SUIT_DRIVER\.includes\(id\),\s*\}\)\)/,
  );
  assert.match(page, /maskTile: REXONANCE_SUIT_TILE/);
  // No sprite, atlas or tile field of a piece is read by the page.
  assert.doesNotMatch(page, /piece\.(?:src|float|ax|ay|tiles|dir)\b/);
  assert.match(
    page,
    /useEffect\(\(\) => mountRexonanceAssembly\(runwayRef\.current, SUIT_UP\), \[\]\);/,
  );
  // The call is the published one, in its order.
  assert.match(page, /const SUIT_UP_LINES = REXONANCE_ENTRY_CALLS\.map/);
  // The new ornaments are hidden from assistive technology.
  for (const ornament of ["rzn-mesh", "rzn-form-code", "rzn-end-figure"]) {
    assert.match(
      page,
      new RegExp(`className="${ornament}"[^>]*aria-hidden="true"|className="${ornament}"\\s+src=`),
      ornament,
    );
  }
  assert.match(page, /<span className="rzn-callouts">/);
  assert.match(
    page,
    /<div className="rxs-hero-visual" aria-hidden="true">[\s\S]*?<span className="rzn-callouts">/,
  );
});

/* ---------------- the plan ---------------- */
const realPieces = REXONANCE_SUIT_PIECES.map(({ id, group, x, y, w, h, seat }) => ({
  id,
  group,
  x,
  y,
  w,
  h,
  seat,
}));
// A finer list, as the suit rebuild cuts it: every piece split in four,
// with a group this layer has never seen.
const finerPieces = realPieces.flatMap((piece) =>
  [0, 1].flatMap((row) =>
    [0, 1].map((column) => ({
      id: `${piece.id}-${row}${column}`,
      group: piece.group === "chest" && piece.id.startsWith("shoulder") ? "shoulders" : piece.group,
      x: piece.x + (column * piece.w) / 2,
      y: piece.y + (row * piece.h) / 2,
      w: piece.w / 2,
      h: piece.h / 2,
      seat: piece.seat,
    })),
  ),
);

for (const [name, pieces] of [
  ["the module's pieces", realPieces],
  ["a finer list with a new group", finerPieces],
  [
    "an unknown group",
    realPieces.map((piece) => ({
      ...piece,
      group: piece.group === "legs" ? "greaves" : piece.group,
    })),
  ],
]) {
  test(`the plan lands every tile in the call's order (${name})`, () => {
    const plan = planAssembly({
      size: REXONANCE_SUIT_SIZE,
      pieces,
      core: REXONANCE_SUIT_MARKS.core,
      tile: 12,
    });
    const cells =
      Math.ceil(REXONANCE_SUIT_SIZE.width / 12) * Math.ceil(REXONANCE_SUIT_SIZE.height / 12);
    assert.equal(plan.tiles.length, cells);
    for (let index = 1; index < plan.tiles.length; index += 1) {
      assert.ok(plan.tiles[index].t1 >= plan.tiles[index - 1].t1);
    }
    for (const tile of plan.tiles) {
      assert.ok(tile.m < tile.t0 && tile.t0 < tile.t1, JSON.stringify(tile));
      assert.ok(tile.t1 <= ASSEMBLY_BEATS.clamp + 1e-9);
      assert.ok(tile.t0 >= ASSEMBLY_BEATS.deus[0]);
      // The helmet forms in place (owner, 2026-10-11): no hover, no drop.
      if (tile.beat === 5) assert.equal(tile.hover, 0);
    }
    // Legs, arms, chest, waist land on the four DEUS！ in turn; the tail
    // and ribbons on REXONANCE！; the helmet clamps last.
    const done = plan.partDone;
    assert.equal(done.length, ASSEMBLY_PARTS.length);
    for (let beat = 1; beat < done.length; beat += 1)
      assert.ok(done[beat] > done[beat - 1], String(done));
    assert.ok(done[3] <= ASSEMBLY_BEATS.deus[1] + 1e-9);
  });
}

test("the plan is deterministic and reads coverage from the sample", () => {
  const cols = Math.ceil(REXONANCE_SUIT_SIZE.width / 16);
  const rows = Math.ceil(REXONANCE_SUIT_SIZE.height / 16);
  const data = new Uint8ClampedArray(cols * rows * 4);
  for (let index = 0; index < cols * rows; index += 1)
    data[index * 4 + 3] = index % 3 === 0 ? 255 : 0;
  const a = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces: realPieces,
    core: REXONANCE_SUIT_MARKS.core,
    tile: 16,
    sample: { data },
  });
  const b = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces: realPieces,
    core: REXONANCE_SUIT_MARKS.core,
    tile: 16,
    sample: { data },
  });
  assert.equal(a.tiles.length, Math.ceil((cols * rows) / 3));
  assert.deepEqual(a.tiles.slice(0, 20), b.tiles.slice(0, 20));
});

/* ---------------- the engine, in a minimal environment ---------------- */
function environment({
  reduced = false,
  economy = false,
  forced = false,
  coarse = false,
  idleHeld = false,
  // The page's chant lines (SA-GA！DEUS！ and REXONANCE！, ×4 each) as four chips.
  chants = false,
  // The page has finished loading (the early warm-up waits for it).
  loaded = false,
  // Canvases give a (recording) WebGL context too, and the scene canvas a
  // parent, so the field's layer can be made.
  webgl = false,
} = {}) {
  const listeners = new Map();
  // Every WebGL call of every canvas, in order: [canvas id, name, ...args].
  const glCalls = [];
  const fieldCanvases = [];
  const webglContext = (id) =>
    new Proxy(
      {
        VERSION: 1,
        COMPILE_STATUS: 2,
        LINK_STATUS: 3,
        getParameter: () => "WebGL 1.0 (test)",
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        getUniformLocation: (program, name) => ({ name }),
        getExtension: () => ({ loseContext: () => glCalls.push([id, "loseContext"]) }),
        createShader: () => ({}),
        createProgram: () => ({}),
        createBuffer: () => ({}),
      },
      {
        get: (gl, key) =>
          key in gl
            ? typeof gl[key] === "function"
              ? (...args) => {
                  glCalls.push([id, key, ...args]);
                  return gl[key](...args);
                }
              : gl[key]
            : (...args) => glCalls.push([id, key, ...args]),
      },
    );
  const target = (name) => ({
    addEventListener(type, callback) {
      listeners.set(`${name}:${type}`, callback);
    },
    removeEventListener(type, callback) {
      if (listeners.get(`${name}:${type}`) === callback) listeners.delete(`${name}:${type}`);
    },
  });
  const element = (extra = {}) => {
    const attributes = new Map();
    return {
      attributes,
      dataset: new Proxy(
        {},
        {
          get: (_, key) =>
            attributes.get(`data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`),
          set: (_, key, value) => {
            attributes.set(
              `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
              String(value),
            );
            return true;
          },
          deleteProperty: (_, key) => {
            attributes.delete(
              `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
            );
            return true;
          },
        },
      ),
      setAttribute: (name, value) => attributes.set(name, String(value)),
      removeAttribute: (name) => attributes.delete(name),
      hasAttribute: (name) => attributes.has(name),
      getAttribute: (name) => attributes.get(name) ?? null,
      textContent: "",
      ...extra,
    };
  };
  const html = element();
  if (economy) html.setAttribute("data-world-effects", "economy");
  const calls = [];
  const drawCalls = [];
  const transforms = [];
  const canvases = [];
  const decodedSources = [];
  const context2d = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "createRadialGradient"
          ? () => ({ addColorStop() {} })
          : key === "getImageData"
            ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) })
            : (...args) => calls.push([key, args.length]),
      set: () => true,
    },
  );
  let canvasId = 0;
  const makeCanvas = () => {
    const id = ++canvasId;
    const canvas = {
      testCanvasId: id,
      width: 0,
      height: 0,
      clientWidth: 1440,
      clientHeight: 837,
      ...(webgl
        ? {
            dataset: {},
            removed: false,
            remove() {
              this.removed = true;
            },
          }
        : {}),
      getContext: (type) =>
        webgl && (type === "webgl2" || type === "webgl")
          ? webglContext(id)
          : new Proxy(context2d, {
              get: (ctx, key) => {
                if (key === "setTransform")
                  return (...args) => {
                    calls.push([key, args.length]);
                    transforms.push({ target: id, args });
                  };
                if (key === "drawImage")
                  return (...args) => {
                    calls.push([key, args.length, id]);
                    drawCalls.push({
                      target: id,
                      source: args[0]?._src ?? args[0]?.testCanvasId,
                      rect: args.slice(1),
                    });
                  };
                return ctx[key];
              },
            }),
    };
    canvases.push(canvas);
    return canvas;
  };
  const document = {
    documentElement: html,
    hidden: false,
    readyState: loaded ? "complete" : "loading",
    createElement: () => makeCanvas(),
    ...target("document"),
  };
  const canvas = makeCanvas();
  if (webgl) canvas.parentNode = { insertBefore: (node) => fieldCanvases.push(node) };
  const frameBox = element({ offsetHeight: 837 });
  const lines = [0, 1, 2, 3, 4].map((index) => {
    const count = chants && (index === 2 || index === 3) ? 4 : 1;
    const chips = Array.from({ length: count }, () => element());
    return element({ querySelectorAll: () => chips, chips });
  });
  const parts = ASSEMBLY_PARTS.map(() => element());
  // The read-outs hold one text node, as React renders them; the engine
  // must rewrite its data, never replace it (a tree change per frame
  // restyles <html> and <body> through the shell's :has() rules).
  const textHost = (text) => {
    const host = element();
    const node = { nodeType: 3, data: text, nextSibling: null };
    host.replaced = 0;
    host.firstChild = node;
    Object.defineProperty(host, "textContent", {
      get: () => node.data,
      set: (value) => {
        host.replaced += 1;
        node.data = String(value);
      },
    });
    return host;
  };
  const percent = textHost("100");
  const counter = textHost("ONLINE");
  let top = 900;
  const runway = element({
    ...target("runway"),
    ownerDocument: document,
    offsetHeight: 2700,
    getBoundingClientRect: () => ({ top, height: 2700 }),
    querySelector: (selector) =>
      ({
        "canvas.rzn-canvas": canvas,
        ".rzn-frame": frameBox,
        ".rzn-percent": percent,
        ".rzn-count": counter,
      })[selector] ?? null,
    querySelectorAll: (selector) =>
      selector === ".rzn-line" ? lines : selector === ".rzn-part" ? parts : [],
  });
  const observers = [];
  const preparationPhases = [];
  class IntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      observers.push(this);
    }
    observe(node) {
      this.node = node;
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  // Like the browser's, the first notice comes after layout (here, a task).
  class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {
      setTimeout(() => !this.disconnected && this.callback([]), 0);
    }
    disconnect() {
      this.disconnected = true;
    }
  }
  class Image {
    set src(value) {
      this._src = value;
      decodedSources.push(value);
      queueMicrotask(() => this.onload?.());
    }
    decode() {
      return Promise.resolve();
    }
  }
  let frameId = 0;
  const frames = new Map();
  const idle = new Map();
  let idleId = 0;
  let idleRequestCount = 0;
  const env = {
    ...target("window"),
    navigator: {},
    innerHeight: 915,
    devicePixelRatio: 2,
    matchMedia: (query) => ({
      matches: query.includes("reduce")
        ? reduced
        : query.includes("forced-colors")
          ? forced
          : query.includes("coarse")
            ? coarse
            : false,
      ...target(`media ${query}`),
    }),
    getComputedStyle: () => ({ top: "63px", getPropertyValue: () => "" }),
    requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout,
    requestIdleCallback(callback) {
      idleRequestCount += 1;
      const id = ++idleId;
      idle.set(id, callback);
      if (!idleHeld)
        setTimeout(() => {
          if (idle.delete(id)) callback({ timeRemaining: () => 40 });
        }, 0);
      return id;
    },
    cancelIdleCallback: (id) => idle.delete(id),
    IntersectionObserver,
    MutationObserver,
    ResizeObserver,
    Image,
    __rexonancePreparationPhase: (phase) => preparationPhases.push(phase),
  };
  const flush = () => {
    for (const [id, callback] of [...frames]) {
      frames.delete(id);
      callback(0);
    }
  };
  const scrollTo = (progress) => {
    top = 63 - progress * (2700 - 837);
    listeners.get("window:scroll")?.();
    flush();
  };
  return {
    env,
    runway,
    canvas,
    html,
    observers,
    listeners,
    frames,
    flush,
    scrollTo,
    percent,
    counter,
    lines,
    parts,
    calls,
    drawCalls,
    transforms,
    canvases,
    decodedSources,
    idle,
    idleRequestCount: () => idleRequestCount,
    preparationPhases,
    prepared: () => preparationPhases.includes("ready"),
    readyCount: () => preparationPhases.filter((phase) => phase === "ready").length,
    canvasCount: () => canvasId,
    glCalls,
    fieldCanvases,
  };
}

// Assert completion, not machine speed. The old fixed 40 ms sleep failed on
// the shared CI runner while its nested preparation tasks were still queued.
async function until(check, message) {
  const deadline = Date.now() + 5000;
  while (!check() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(check(), message);
}

test("reduced motion, economy and forced colours keep the still and leave nothing behind", async () => {
  for (const options of [{ reduced: true }, { economy: true }, { forced: true }]) {
    const t = environment(options);
    const dispose = mountRexonanceAssembly(
      t.runway,
      {
        figure: "/f.webp",
        undersuit: "/u.webp",
        size: REXONANCE_SUIT_SIZE,
        pieces: realPieces,
        core: REXONANCE_SUIT_MARKS.core,
        visor: REXONANCE_SUIT_MARKS.visor,
        glow: [],
      },
      t.env,
    );
    t.observers[0].callback([{ isIntersecting: true }]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(t.runway.dataset.rznState, undefined, JSON.stringify(options));
    assert.equal(
      t.runway.dataset.rznLoad,
      "static",
      "intentional still settings are not pending work",
    );
    assert.equal(t.canvas.width, 0);
    dispose();
    assert.equal([...t.listeners.keys()].length, 0, [...t.listeners.keys()].join());
    assert.equal(t.frames.size, 0);
  }
});

test("near the view it goes live, scrubs with the scroll, writes the HUD on change, and cleans up", async () => {
  const t = environment();
  const dispose = mountRexonanceAssembly(
    t.runway,
    {
      figure: "/f.webp",
      undersuit: "/u.webp",
      size: REXONANCE_SUIT_SIZE,
      pieces: realPieces,
      core: REXONANCE_SUIT_MARKS.core,
      visor: REXONANCE_SUIT_MARKS.visor,
      glow: [],
    },
    t.env,
  );
  // Not near yet: nothing is fetched or drawn.
  assert.equal(t.runway.dataset.rznState, undefined);
  t.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(t.runway.dataset.rznState, "loading");
  // The cut runs in steps (sample, plan, weld canvas), each its own task.
  await until(
    () => t.runway.dataset.rznState === "live" && t.frames.size > 0,
    "scene prepared and measured",
  );
  assert.equal(t.runway.dataset.rznState, "live");
  // The backing store is sized in the first frame, after its layout read.
  assert.equal(t.canvas.width, 0);
  t.scrollTo(0);
  assert.ok(t.canvas.width > 0 && t.canvas.width * t.canvas.height <= 2_600_000 * 1.01);
  assert.equal(t.percent.textContent, "000");
  assert.equal(t.runway.dataset.rznLine, "0");
  t.scrollTo(0.4);
  assert.equal(t.runway.dataset.rznLine, "2");
  assert.ok(t.parts[0].hasAttribute("data-on"));
  assert.ok(!t.parts[5].hasAttribute("data-on"));
  t.scrollTo(1);
  assert.equal(t.percent.textContent, "100");
  assert.ok(t.parts.every((part) => part.hasAttribute("data-on")));
  assert.ok(t.runway.hasAttribute("data-rzn-complete"));
  // Back to the start: the welds come off again.
  t.scrollTo(0.1);
  assert.match(t.counter.textContent, /^0 \/ /);
  // An unchanged position draws nothing (past the fire, which keeps
  // flowing at rest: see "at rest the fire keeps flowing").
  t.scrollTo(0.3);
  for (let k = 0; k < 120 && t.frames.size; k += 1) t.flush();
  assert.equal(t.frames.size, 0, "settled past the fire");
  const before = t.calls.length;
  t.scrollTo(0.3);
  assert.equal(t.calls.length, before);
  // Hidden: no frame is queued.
  t.env.document = undefined;
  dispose();
  assert.equal(t.runway.dataset.rznState, undefined);
  assert.equal(t.percent.textContent, "100");
  assert.equal(t.counter.textContent, "ONLINE");
  assert.equal(t.percent.replaced + t.counter.replaced, 0, "the read-outs rewrite their text node");
  assert.equal(t.canvas.width, 0);
  assert.equal([...t.listeners.keys()].length, 0, [...t.listeners.keys()].join());
  assert.equal(t.frames.size, 0);
  assert.ok(t.observers.every((observer) => observer.disconnected));
});

const engineConfig = {
  figure: "/f.webp",
  undersuit: "/u.webp",
  size: REXONANCE_SUIT_SIZE,
  pieces: REXONANCE_SUIT_PIECES,
  maskTile: 9,
  core: REXONANCE_SUIT_MARKS.core,
  visor: REXONANCE_SUIT_MARKS.visor,
  glow: [],
};

test("mask holes belong to the ribbon, never the smaller arm box", () => {
  const common = { x: 0, y: 0, seat: [5, 15] };
  const plan = planAssembly({
    size: { width: 30, height: 30 },
    core: [15, 15],
    tile: 10,
    maskTile: 10,
    pieces: [
      {
        ...common,
        id: "arm",
        group: "arms",
        w: 20,
        h: 30,
        tiles: btoa(String.fromCharCode(0b010101)),
      },
      {
        ...common,
        id: "ribbon",
        group: "ribbon",
        w: 30,
        h: 30,
        tiles: btoa(String.fromCharCode(0b10110110, 1)),
      },
    ],
  });
  assert.equal(plan.tiles.find((t) => t.cx === 15 && t.cy === 15).pieceId, "ribbon");
  assert.equal(plan.tiles.filter((t) => t.pieceId === "arm").length, 3);
  assert.ok(plan.tiles.filter((t) => t.pieceId === "arm").every((t) => t.cx === 5));
});

// Owner 2026-10-17: 「変身音発光演出で4つめの『REXONANCE！』が発光しなかったりする」 — all four chips of each chant line lit while the line is still active.
test("every chant unit lights while its line is up: all four chips of SA-GA！DEUS！ and of REXONANCE！ are on before the line is done", async () => {
  const t = environment({ chants: true });
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[0].callback([
    { isIntersecting: true, boundingClientRect: { top: 400, bottom: 3100 } },
  ]);
  await until(() => t.runway.dataset.rznState === "live" && t.frames.size > 0, "scene live");
  for (const [index, beat] of [
    [2, ASSEMBLY_BEATS.deus],
    [3, ASSEMBLY_BEATS.rexonance],
  ]) {
    const line = t.lines[index];
    let previous = 0;
    let allLit = null;
    for (let progress = beat[0] + 0.001; progress < beat[1]; progress += 0.002) {
      t.scrollTo(progress);
      const label = `line ${index} @${progress.toFixed(3)}`;
      assert.ok(line.hasAttribute("data-on") && !line.hasAttribute("data-done"), label);
      const on = line.chips.map((chip) => chip.hasAttribute("data-on"));
      const count = on.filter(Boolean).length;
      // In order, and never going out again within the line.
      assert.deepEqual(
        on,
        on.map((_, k) => k < count),
        label,
      );
      assert.ok(count >= previous, `${label}: ${count} < ${previous}`);
      previous = count;
      if (count === 4 && allLit === null) allLit = progress;
    }
    assert.ok(allLit !== null, `line ${index}: the fourth chip never lit while the line was up`);
    // The fourth stays lit for a visible stretch of the line, not its last frame.
    assert.ok(beat[1] - allLit >= (beat[1] - beat[0]) * 0.15, `line ${index}: ${allLit}`);
    // Once the line is done its chips stay on (dimmed with the line).
    t.scrollTo(beat[1] + 0.001);
    assert.ok(line.hasAttribute("data-done"));
    assert.ok(line.chips.every((chip) => chip.hasAttribute("data-on")));
  }
  dispose();
});

// Owner 2026-10-17: 「レクソナンスのスクロールで変身するやつが読み込まれずに過ぎてしまったりする」 — fetched once the page is idle, prepared once the reader is past the hero; the picture never changes from it.
test("the early warm-up: the network half once the page is idle after load, the preparation once the reader is past the hero, the look unchanged", async () => {
  let kitRequests = 0;
  const config = {
    ...engineConfig,
    nanites: () => {
      kitRequests += 1;
      return Promise.resolve(null);
    },
  };
  const t = environment({ loaded: true });
  const dispose = mountRexonanceAssembly(t.runway, config, t.env);
  await until(() => kitRequests === 1, "the code (module and kit) is imported once idle");
  await new Promise((resolve) => setTimeout(resolve, 20));
  // verify-rexonance-rx17-preload's roundtrip pin: a direct entry keeps
  // speculative suit work off, so no sheet is requested until the reader moves.
  assert.equal(t.decodedSources.length, 0, "no sheet before the reader moves");
  assert.equal(t.preparationPhases.length, 0, "nothing is prepared before the reader moves");
  assert.equal(t.runway.dataset.rznState, undefined, "and nothing visible changes");
  assert.equal(t.percent.textContent, "100");
  // Still in the hero: nothing; past it: the sheets are fetched and the preparation runs.
  t.env.scrollY = 200;
  t.listeners.get("document:scroll")();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(t.decodedSources.length, 0);
  assert.equal(t.preparationPhases.length, 0);
  t.env.scrollY = 600;
  t.listeners.get("document:scroll")();
  assert.equal(t.listeners.has("document:scroll"), false, "one notice is enough");
  await until(() => t.decodedSources.length >= 2, "the sheets are requested past the hero");
  await until(t.prepared, "prepared far ahead of the scene");
  assert.equal(t.runway.dataset.rznState, undefined, "preparing far away changes nothing");
  assert.equal(t.percent.textContent, "100");
  assert.equal(t.canvas.width, 0);
  // The sheets fetched ahead are the ones decoded: no second request.
  assert.equal(t.decodedSources.filter((src) => src === "/f.webp").length, 1);
  // Near: live at once, from what is ready.
  t.observers[0].callback([
    { isIntersecting: true, boundingClientRect: { top: 400, bottom: 3100 } },
  ]);
  assert.equal(t.runway.dataset.rznState, "live");
  dispose();
  assert.equal([...t.listeners.keys()].length, 0, [...t.listeners.keys()].join());

  // Before the page's load event nothing is fetched; the still tiers never.
  const early = environment();
  const disposeEarly = mountRexonanceAssembly(early.runway, engineConfig, early.env);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(early.decodedSources.length, 0);
  assert.ok(early.listeners.has("window:load"));
  // A reader already past the hero before it: the preparation starts then.
  early.env.scrollY = 900;
  early.listeners.get("document:scroll")();
  await until(early.prepared, "prepared on the first scroll past the hero");
  assert.equal(early.runway.dataset.rznState, undefined);
  disposeEarly();
  assert.equal([...early.listeners.keys()].length, 0);
  for (const options of [{ reduced: true }, { economy: true }, { forced: true }]) {
    const q = environment({ ...options, loaded: true });
    const disposeQ = mountRexonanceAssembly(q.runway, config, q.env);
    q.env.scrollY = 2000;
    await new Promise((resolve) => setTimeout(resolve, 10));
    q.listeners.get("document:scroll")?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(q.decodedSources.length, 0, JSON.stringify(options));
    assert.equal(q.preparationPhases.length, 0, JSON.stringify(options));
    disposeQ();
  }
  assert.equal(kitRequests, 1, "the still tiers never import the kit");
});

// R-1 19/60: a reader arriving inside the runway gets that moment whole on the first live frame (no catch-up from the start).
test("a mid-runway arrival resumes at its progress: the first live frame needs no catch-up", async () => {
  const t = environment();
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[1].callback([{ isIntersecting: true }]);
  await until(t.prepared, "warm preparation completed");
  // A jump to 40 % of the runway (a restored scroll, a link): near at once.
  t.scrollTo(0.4);
  t.observers[0].callback([
    { isIntersecting: true, boundingClientRect: { top: -682, bottom: 2018 } },
  ]);
  await until(
    () => t.runway.dataset.rznState === "live" && t.frames.size > 0,
    "scene live after its catch-up",
  );
  t.flush();
  assert.equal(t.percent.textContent, "043");
  assert.equal(t.frames.size, 0, "the first frame drew the moment whole (nothing left behind)");
  dispose();
});

test("at rest the fire keeps flowing on the wall clock, the calm frame included, until the fire is spent or the scene is hidden (review of 2ce6712)", async () => {
  // A fire that sits still is the 固体 look the owner rejected. The scene
  // once drew only on scroll, then 260 ms into each rest re-posed the
  // whole flame on a clock of its own (progress × 60) and froze it there.
  const t = environment();
  let now = 5000;
  t.env.performance = { now: () => now };
  const drawn = [];
  t.env.__rexonanceDrawMs = (ms, progress, calm) => drawn.push({ progress, calm });
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[1].callback([{ isIntersecting: true }]);
  await until(t.prepared, "warm preparation completed");
  t.observers[0].callback([{ isIntersecting: true }]);
  await until(() => t.runway.dataset.rznState === "live" && t.frames.size > 0, "scene live");
  // The layout's first notice (a task, as in the browser) re-measures.
  await new Promise((resolve) => setTimeout(resolve, 10));
  t.flush();
  let stamp = 0;
  const tick = (count) => {
    for (let k = 0; k < count; k += 1) {
      stamp += 1000 / 60;
      now += 1000 / 60;
      for (const [id, callback] of [...t.frames]) {
        t.frames.delete(id);
        callback(stamp);
      }
    }
  };
  const flameClock = () => inspectBodyFlame().pose[POSE_TIME];
  // Mid-engulf: the scroll comes to rest there.
  const burning = scrollFlameAt((NANITE_FIRE_PHASES.kindle + NANITE_FIRE_PHASES.cover) / 2);
  t.scrollTo(burning);
  tick(12);
  const shown = drawn.at(-1).progress;
  assert.ok(Math.abs(shown - burning) < 0.001, `settled at the fire (${shown})`);
  drawn.length = 0;
  const before = t.percent.textContent;
  tick(6);
  assert.equal(drawn.length, 6, "every frame at rest redraws the burning moment");
  assert.ok(
    drawn.every((d) => d.progress === shown && !d.calm),
    JSON.stringify(drawn),
  );
  assert.equal(flameClock(), now / 1000, "on the wall clock");
  assert.equal(t.percent.textContent, before, "the HUD is untouched by the fire's frames");
  assert.equal(t.frames.size, 1, "and the next is queued");
  // The calm frame continues the same clock (no re-pose), and the fire
  // flows on from it with the transient effects still off.
  await new Promise((resolve) => setTimeout(resolve, 320));
  const calm = drawn.findIndex((d) => d.calm);
  assert.ok(calm >= 0, "the calm frame was drawn");
  assert.equal(flameClock(), now / 1000, "the calm frame keeps the wall clock");
  drawn.length = 0;
  const calmClock = flameClock();
  tick(4);
  assert.equal(drawn.length, 4);
  assert.ok(
    drawn.every((d) => d.progress === shown && d.calm),
    JSON.stringify(drawn),
  );
  assert.ok(flameClock() > calmClock, "and keeps flowing after it");
  // Past the fire (the assembly proper): an unchanged position draws
  // nothing and nothing stays queued.
  t.scrollTo(0.3);
  tick(30);
  drawn.length = 0;
  tick(6);
  assert.equal(drawn.length, 0, "no fire, no redraw at rest");
  assert.equal(t.frames.size, 0);
  // Back in the fire, then out of view: the loop stops with the scene.
  t.scrollTo(burning);
  tick(12);
  assert.equal(t.frames.size, 1);
  t.observers[0].callback([{ isIntersecting: false }]);
  assert.equal(t.frames.size, 0, "offscreen, nothing is queued");
  drawn.length = 0;
  tick(6);
  assert.equal(drawn.length, 0);
  dispose();
  assert.equal(t.frames.size, 0);
});

test("a rest's catch-up frames never alternate with the calm frame, however slow the frames (sweep 2, F86)", async () => {
  // The welds and the gold catch up a budget a frame. The calm frame was
  // armed beside each catch-up frame, so where frames came more than 260 ms
  // apart it landed between them: calm, moving, calm… at one progress, the
  // impact's rays coming and going at rest.
  const t = environment();
  let now = 5000;
  t.env.performance = { now: () => now };
  const drawn = [];
  t.env.__rexonanceDrawMs = (ms, progress, calm) => drawn.push({ progress, calm });
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[1].callback([{ isIntersecting: true }]);
  await until(t.prepared, "warm preparation completed");
  t.observers[0].callback([{ isIntersecting: true }]);
  await until(() => t.runway.dataset.rznState === "live" && t.frames.size > 0, "scene live");
  await new Promise((resolve) => setTimeout(resolve, 10));
  t.flush();
  let stamp = 0;
  const tick = () => {
    stamp += 1000 / 60;
    now += 1000 / 60;
    for (const [id, callback] of [...t.frames]) {
      t.frames.delete(id);
      callback(stamp);
    }
  };
  t.scrollTo(0.3);
  for (let k = 0; k < 30; k += 1) tick();
  await new Promise((resolve) => setTimeout(resolve, 300));
  // A jump (snapped, no follow-through) far enough that the welds take
  // several frames to catch up; each frame then comes after the calm delay.
  drawn.length = 0;
  t.scrollTo(0.52);
  for (let k = 0; k < 40 && (t.frames.size || !drawn.some((d) => d.calm)); k += 1) {
    await new Promise((resolve) => setTimeout(resolve, 290));
    tick();
  }
  const here = drawn.filter((d) => d.progress === drawn[0].progress);
  assert.equal(here.length, drawn.length, "one progress throughout");
  const moving = here.filter((d) => !d.calm).length;
  assert.ok(moving >= 3, `the jump caught up over several frames (${moving})`);
  const firstCalm = here.findIndex((d) => d.calm);
  assert.ok(firstCalm > 0, "the calm frame came once caught up");
  assert.ok(
    here.slice(firstCalm).every((d) => d.calm),
    `no moving frame after the calm one: ${here.map((d) => (d.calm ? "C" : "m")).join("")}`,
  );
  assert.equal(t.frames.size, 0, "settled");
  dispose();
});

test("the field's layer is made in idle time once the preparation is done, never inside a live frame, and remade in idle time after a hidden tab (sweep 2, F27)", async () => {
  // Inside the first live frame its programs, link and buffers cost 84–260
  // ms on a throttled phone, and tripped the 2D governor.
  const t = environment({ webgl: true });
  const drawn = [];
  t.env.__rexonanceDrawMs = (ms, progress) => drawn.push(progress);
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  const links = () => t.glCalls.filter(([, name]) => name === "linkProgram").length;
  t.observers[1].callback([{ isIntersecting: true }]);
  await until(() => t.fieldCanvases.length === 2, "the layer, made after the preparation");
  assert.equal(t.runway.dataset.rznLoad, "ready");
  assert.notEqual(t.runway.dataset.rznState, "live", "far from the scene");
  assert.equal(drawn.length, 0, "before any frame");
  assert.equal(links(), 2, "back and front");
  // Near: live, and its frames build nothing.
  t.observers[0].callback([{ isIntersecting: true }]);
  await until(() => t.runway.dataset.rznState === "live" && t.frames.size > 0, "scene live");
  await new Promise((resolve) => setTimeout(resolve, 10));
  t.flush();
  t.scrollTo(0.3);
  t.scrollTo(0.45);
  assert.ok(drawn.length >= 2, "frames drawn");
  assert.equal(links(), 2, "no program built inside a frame");
  assert.ok(
    t.glCalls.some(([, name]) => name === "drawElements"),
    "and the layer draws",
  );
  // Hidden: released. Back, away from the scene: remade in idle time.
  t.runway.ownerDocument.hidden = true;
  t.listeners.get("document:visibilitychange")();
  assert.ok(
    t.fieldCanvases.every((canvas) => canvas.removed),
    "released while hidden",
  );
  t.observers[0].callback([{ isIntersecting: false }]);
  t.runway.ownerDocument.hidden = false;
  drawn.length = 0;
  t.listeners.get("document:visibilitychange")();
  await until(() => links() === 4, "remade in idle time");
  assert.equal(drawn.length, 0, "with no frame drawn");
  assert.equal(t.fieldCanvases.length, 4);
  dispose();
  assert.ok(
    t.fieldCanvases.every((canvas) => canvas.removed),
    "released on dispose",
  );
});

test("the field's density follows the governor a step a frame, and a calm frame draws it whole (sweep 2, F26)", async () => {
  // It switched between 12,000 and 6,000 particles in one frame (the field
  // is additive: its brightness halved), and a resting frame kept whatever
  // the last moving frame drew, so it depended on the direction of approach.
  const t = environment({ webgl: true });
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[1].callback([{ isIntersecting: true }]);
  await until(() => t.fieldCanvases.length === 2, "the layer");
  t.observers[0].callback([{ isIntersecting: true }]);
  await until(() => t.runway.dataset.rznState === "live" && t.frames.size > 0, "scene live");
  await new Promise((resolve) => setTimeout(resolve, 10));
  t.flush();
  const back = t.fieldCanvases[0].testCanvasId;
  const drawsOf = () =>
    t.glCalls.filter(([id, name]) => id === back && name === "drawElements").map((call) => call[3]);
  t.scrollTo(0.4);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const whole = drawsOf().at(-1);
  assert.ok(whole > 0, "the field draws");
  // Slow frames from here on (each clock read 10 ms on): the governor trips.
  let now = 1000;
  t.env.performance = { now: () => (now += 10) };
  t.glCalls.length = 0;
  for (let k = 1; k <= 16; k += 1) t.scrollTo(0.4 + k * 0.004);
  const counts = drawsOf();
  assert.ok(counts.length >= 12, `frames drawn (${counts.length})`);
  assert.equal(Math.min(...counts), whole / 2, "down to half the field");
  for (let k = 1; k < counts.length; k += 1)
    assert.ok(
      Math.abs(counts[k] - counts[k - 1]) <= Math.ceil(whole / 20 / 6) * 6,
      `a step a frame, never a jump: ${counts.join(",")}`,
    );
  // At rest the calm frame draws it whole, however it was reached.
  for (let k = 0; k < 200 && t.frames.size; k += 1) t.flush();
  assert.equal(drawsOf().at(-1), whole / 2, "settled at half while moving");
  t.glCalls.length = 0;
  await new Promise((resolve) => setTimeout(resolve, 320));
  assert.equal(drawsOf().at(-1), whole, "the calm frame is whole");
  dispose();
});

test("3.5 screens ahead preparation is idle-only, does not activate layout, and cancels on exit", async () => {
  const t = environment({ idleHeld: true });
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  const warm = t.observers.find((o) => o.options.rootMargin === "3203px 0px");
  assert.ok(warm);
  warm.callback([{ isIntersecting: true }]);
  assert.equal(t.idle.size, 1);
  assert.equal(t.calls.length, 0);
  assert.equal(t.runway.dataset.rznState, undefined);
  dispose();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(t.idle.size, 0);
  assert.equal(t.calls.filter((c) => c[0] === "drawImage").length, 0);
  assert.equal(t.frames.size, 0);
});

test("touch art draws are bounded; settled endpoints and offscreen scenes do not keep painting", async () => {
  const t = environment({ coarse: true });
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[1].callback([{ isIntersecting: true }]);
  await until(t.prepared, "warm preparation completed");
  assert.equal(
    t.runway.dataset.rznState,
    undefined,
    "warm preparation does not change the visible state",
  );
  t.observers[0].callback([{ isIntersecting: true }]);
  await until(
    () => t.runway.dataset.rznState === "live" && t.frames.size > 0,
    "warm scene activated",
  );
  for (const progress of [0.3, 0.35, 0.5, 0.7, 0.8, 0.84]) {
    t.calls.length = 0;
    t.scrollTo(progress);
    const art = t.calls.filter((c) => c[0] === "drawImage" && c[1] === 9 && c[2] === 1);
    // (Round 3: the undersuit's draw is reserved inside the budget, so a
    // touch frame stays within 64 in all — review: it was stated as 65.)
    assert.ok(art.length <= ASSEMBLY_TOUCH_ART_BUDGET, `${progress}: ${art.length}`);
  }
  t.scrollTo(1);
  t.flush();
  t.calls.length = 0;
  t.scrollTo(1);
  assert.equal(t.calls.length, 0);
  t.observers[0].callback([{ isIntersecting: false }]);
  assert.equal(t.listeners.has("window:scroll"), false);
  assert.equal(t.frames.size, 0);
  dispose();
});

test("never the finished suit before the scroll: near and not yet live, the undersuit stands in, and the first live frame draws before it goes (owner 2026-10-16)", async () => {
  // owner 2026-10-16: 「スクロールする前から完成済みなこともあるので修正して。」
  // A warm preparation already running when the scene came near kept the
  // finished still (and its 100 % read-out) up until live, for seconds.
  const t = environment({ idleHeld: true });
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  const warm = t.observers.find((o) => o.options.rootMargin === "3203px 0px");
  warm.callback([{ isIntersecting: true }]);
  assert.equal(t.runway.dataset.rznState, undefined, "warming far away changes nothing");
  assert.equal(t.percent.textContent, "100");
  // Near while that preparation runs: the loading state at once, the
  // read-outs at the start, as the first live frame will show them.
  t.observers[0].callback([
    { isIntersecting: true, boundingClientRect: { top: 400, bottom: 3100 } },
  ]);
  assert.equal(t.runway.dataset.rznState, "loading");
  assert.equal(t.runway.dataset.rznPhase, "prepare");
  assert.equal(t.runway.dataset.rznLine, "0");
  assert.equal(t.percent.textContent, "000");
  assert.ok(t.lines[0].hasAttribute("data-on"));
  // Live: the undersuit still stays under the canvas until a frame is drawn.
  for (let i = 0; i < 400 && t.runway.dataset.rznState !== "live"; i += 1) {
    for (const [id, callback] of [...t.idle]) {
      t.idle.delete(id);
      callback({ timeRemaining: () => 40 });
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(t.runway.dataset.rznState, "live");
  assert.equal(t.runway.dataset.rznArming, "under");
  await until(() => t.frames.size > 0, "first frame queued");
  t.scrollTo(0);
  assert.equal(t.runway.dataset.rznArming, undefined, "the first live frame is drawn");
  dispose();
  assert.equal(t.runway.dataset.rznState, undefined);
  assert.equal(t.percent.textContent, "100");

  // Arriving from below, past the runway's end: the live frame there is the
  // finished suit, so the finished still stays (and stays under the canvas
  // until that frame is drawn).
  const b = environment();
  const disposeB = mountRexonanceAssembly(b.runway, engineConfig, b.env);
  b.observers[0].callback([
    { isIntersecting: true, boundingClientRect: { top: -2600, bottom: 900 } },
  ]);
  assert.equal(b.runway.dataset.rznState, undefined);
  assert.equal(b.percent.textContent, "100");
  await until(() => b.runway.dataset.rznState === "live", "scene live");
  assert.equal(b.runway.dataset.rznArming, "still");
  disposeB();

  // The stylesheet: the finished still is hidden once there is a state
  // (except while it is the one held under the first frame); the undersuit
  // still only while loading or held.
  const hidden = sheet.rules.filter(
    ({ selector, body }) => /> \.rzn-still$/.test(selector) && /visibility: hidden/.test(body),
  );
  assert.equal(hidden.length, 1);
  assert.match(hidden[0].selector, /\[data-rzn-state\]:not\(\[data-rzn-arming="still"\]\)/);
  const under = sheet.rules.filter(({ selector }) =>
    /> :is\(\.rzn-under, \.rzn-driver-standin\)$/.test(selector),
  );
  assert.ok(under.some(({ body }) => /display: none/.test(body)));
  const shown = under.filter(({ body }) => /display: block/.test(body));
  assert.equal(shown.length, 1);
  assert.match(shown[0].selector, /\[data-rzn-state="loading"\]/);
  assert.match(shown[0].selector, /\[data-rzn-arming="under"\]/);
  for (const { context } of [...hidden, ...under]) assert.equal(context.length, 0);
});

// Round 4 (patch B): under the motion gate the stand-in is the default picture from the near observer's first notice.
test("a far jump never paints the finished still first: the stand-in is the motion tier's default from the first notice", async () => {
  // Far below the view (the page's first frames): the undersuit and the
  // read-outs at the start already, before any warm-up or nearness.
  const far = { isIntersecting: false, boundingClientRect: { top: 5200, bottom: 7900 } };
  const t = environment({ idleHeld: true });
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[0].callback([far]);
  assert.equal(t.runway.dataset.rznState, "loading");
  assert.equal(t.percent.textContent, "000");
  // The count is the live frame's to write; until then the nanites stand by
  // (sweep 2, F21: never '000 % NANITES ONLINE' beside 01 構成情報を読み込み).
  assert.equal(t.counter.textContent, "STANDBY", "the count is the live frame's to write");
  assert.equal(t.counter.replaced, 0, "the read-out rewrites its text node");
  // The warm preparation far away changes nothing more.
  const warm = t.observers.find((o) => o.options.rootMargin === "3203px 0px");
  warm.callback([{ isIntersecting: true }]);
  assert.equal(t.runway.dataset.rznState, "loading");
  // At the runway's end (near and past it) the finished still is back, as
  // the live frame there draws it; leaving again restores the stand-in.
  t.observers[0].callback([
    { isIntersecting: true, boundingClientRect: { top: -2600, bottom: 900 } },
  ]);
  assert.equal(t.runway.dataset.rznState, undefined);
  assert.equal(t.percent.textContent, "100");
  t.observers[0].callback([far]);
  assert.equal(t.runway.dataset.rznState, "loading");
  // Economy turns it back into the still tier's finished still at once (any
  // sync; the attribute's own observer calls the same), and full effects
  // bring the stand-in back.
  t.html.setAttribute("data-world-effects", "economy");
  t.listeners.get("document:visibilitychange")();
  assert.equal(t.runway.dataset.rznState, undefined);
  assert.equal(t.percent.textContent, "100");
  t.html.removeAttribute("data-world-effects");
  t.listeners.get("document:visibilitychange")();
  assert.equal(t.runway.dataset.rznState, "loading");
  dispose();
  assert.equal(t.runway.dataset.rznState, undefined);
  assert.equal(t.percent.textContent, "100");

  // The still tiers: the same first notice leaves the finished still alone.
  for (const options of [{ reduced: true }, { economy: true }, { forced: true }]) {
    const q = environment(options);
    const disposeQ = mountRexonanceAssembly(q.runway, engineConfig, q.env);
    q.observers[0].callback([far]);
    assert.equal(q.runway.dataset.rznState, undefined, JSON.stringify(options));
    assert.equal(q.percent.textContent, "100", JSON.stringify(options));
    disposeQ();
  }
});

// A media query list as Chromium keeps it: reading `.matches` refreshes its
// cached result, so a change read before the next style recalc never fires
// the list's change event (sweep 2, F24).
function chromiumMedia(t, query, initial = false) {
  let value = initial;
  let pending = false;
  const key = `media ${query}:change`;
  return {
    list: {
      get matches() {
        pending = false;
        return value;
      },
      addEventListener(type, callback) {
        t.listeners.set(`media ${query}:${type}`, callback);
      },
      removeEventListener(type, callback) {
        if (t.listeners.get(`media ${query}:${type}`) === callback)
          t.listeners.delete(`media ${query}:${type}`);
      },
    },
    set(next) {
      value = next;
      pending = true;
    },
    // The style recalc's notice: only for a change nobody has read yet.
    notify() {
      if (!pending) return;
      pending = false;
      t.listeners.get(key)?.({ matches: value });
    },
  };
}

test("Reduce Motion or forced colours turned on while the scene prepares bring the still back (sweep 2, F24)", async () => {
  for (const which of ["reduce", "forced-colors"]) {
    const t = environment({ idleHeld: true });
    const reduce = chromiumMedia(t, "(prefers-reduced-motion: reduce)");
    const forced = chromiumMedia(t, "(forced-colors: active)");
    const base = t.env.matchMedia;
    t.env.matchMedia = (query) =>
      query.includes("reduce")
        ? reduce.list
        : query.includes("forced-colors")
          ? forced.list
          : base(query);
    const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
    t.observers[0].callback([{ isIntersecting: true }]);
    assert.equal(t.runway.dataset.rznState, "loading");
    assert.equal(t.runway.dataset.rznLoad, "loading", which);
    // The preference changes mid-preparation; the scene's idle slices (and
    // their watchdog) keep running before the browser's notice.
    (which === "reduce" ? reduce : forced).set(true);
    const runIdle = () => {
      for (const [id, callback] of [...t.idle]) {
        t.idle.delete(id);
        callback({ timeRemaining: () => 40, didTimeout: false });
      }
    };
    for (let k = 0; k < 20; k += 1) {
      runIdle();
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    (which === "reduce" ? reduce : forced).notify();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(t.runway.dataset.rznLoad, "static", `${which}: the still tier's status`);
    assert.equal(t.runway.dataset.rznState, undefined, `${which}: the finished still`);
    assert.equal(t.percent.textContent, "100", which);
    assert.equal(t.counter.textContent, "ONLINE", which);
    // Turned off again: the stand-in and its status come back.
    (which === "reduce" ? reduce : forced).set(false);
    (which === "reduce" ? reduce : forced).notify();
    assert.equal(t.runway.dataset.rznState, "loading", which);
    assert.notEqual(t.runway.dataset.rznLoad, "static", which);
    dispose();
    assert.equal([...t.listeners.keys()].length, 0, [...t.listeners.keys()].join());
  }
  // The engine never polls the lists it listens to.
  const engine = read("src/lib/rexonance-resonance.js");
  assert.doesNotMatch(engine, /\b(?:reduced|forcedColors|finePointer)\.matches\b(?!\))/);
});

test("after Reduce Motion or economy is turned off above the runway, the status is the waiting one, not the still's (sweep 2, F82)", () => {
  const far = { isIntersecting: false, boundingClientRect: { top: 5200, bottom: 7900 } };
  const t = environment({ idleHeld: true });
  const reduce = chromiumMedia(t, "(prefers-reduced-motion: reduce)");
  const base = t.env.matchMedia;
  t.env.matchMedia = (query) => (query.includes("reduce") ? reduce.list : base(query));
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[0].callback([far]);
  assert.equal(t.runway.dataset.rznLoad, "waiting");
  assert.equal(t.runway.dataset.rznState, "loading");
  reduce.set(true);
  reduce.notify();
  assert.equal(t.runway.dataset.rznLoad, "static");
  assert.equal(t.runway.dataset.rznState, undefined);
  reduce.set(false);
  reduce.notify();
  assert.equal(t.runway.dataset.rznState, "loading", "the stand-in is back");
  assert.equal(t.runway.dataset.rznLoad, "waiting", "and so is the waiting status");
  assert.equal(t.counter.textContent, "STANDBY");
  t.html.setAttribute("data-world-effects", "economy");
  t.listeners.get("document:visibilitychange")();
  assert.equal(t.runway.dataset.rznLoad, "static");
  t.html.removeAttribute("data-world-effects");
  t.listeners.get("document:visibilitychange")();
  assert.equal(t.runway.dataset.rznLoad, "waiting", "economy off: waiting");
  assert.equal(t.runway.dataset.rznState, "loading");
  dispose();
});

test("pagehide cancels queued preparation and pageshow safely resumes it", async () => {
  const t = environment({ idleHeld: true });
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[1].callback([{ isIntersecting: true }]);
  t.listeners.get("window:pagehide")();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(t.idle.size, 0);
  t.listeners.get("window:pageshow")();
  assert.equal(t.idle.size, 1);
  dispose();
  assert.equal(t.idle.size, 0);
});

test("gold preparation yields within the idle budget, cancels midway and finishes before activation", async () => {
  const { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } =
    await import("../src/lib/rexonance-suit-gold.ts");
  const t = environment({ idleHeld: true });
  let goldReads = 0;
  const config = {
    ...engineConfig,
    // Give the runtime fixture one real preset piece so the driver crop phase
    // and its exact reverse-order source rectangles are exercised.
    pieces: engineConfig.pieces.map((piece, index) =>
      index === 0 ? { ...piece, preset: true } : piece,
    ),
    atlas: "/atlas.webp",
    gold: {
      atlas: "/gold.webp",
      cell: REXONANCE_SUIT_GOLD_CELL,
      cells: new Proxy(REXONANCE_SUIT_GOLD_CELLS, {
        get(target, key) {
          goldReads += 1;
          return target[key];
        },
      }),
    },
    glow: [
      [0, 0],
      [24, 0],
      [24, 24],
      [0, 24],
    ],
  };
  const dispose = mountRexonanceAssembly(t.runway, config, t.env);
  // A depleted deadline permits exactly one generator checkpoint per slot.
  const step = async () => {
    for (const [id, callback] of [...t.idle]) {
      t.idle.delete(id);
      callback({ timeRemaining: () => 0 });
    }
    await new Promise((resolve) => setImmediate(resolve));
  };
  try {
    t.observers[1].callback([{ isIntersecting: true }]);
    for (let i = 0; i < 2000 && !goldReads; i += 1) await step();
    assert.ok(goldReads > 0, "gold generator has begun");
    assert.equal(t.prepared(), false, "no canvas layers publish while gold is incomplete");
    const initialReads = goldReads;
    await step();
    assert.equal(goldReads, initialReads, "a whole plate cannot run past a depleted deadline");
    assert.equal(t.idle.size, 1, "the remaining gold work has another idle slot");
    t.listeners.get("window:pagehide")();
    await step();
    assert.equal(t.idle.size, 0);
    assert.equal(t.prepared(), false);
    assert.equal(t.runway.dataset.rznState, undefined);
    const cancelledReads = goldReads;
    await step();
    assert.equal(goldReads, cancelledReads, "cancelled gold work stays stopped");

    const beforeResume = t.readyCount();
    const resumedPrepared = () => t.readyCount() > beforeResume;
    t.listeners.get("window:pageshow")();
    let slots = 0;
    // Depleted deadlines advance one checkpoint, not a wall-clock slice.
    // Finer native readback bands intentionally need more such checkpoints.
    while (!resumedPrepared() && slots < 24000) {
      await step();
      slots += 1;
    }
    assert.ok(resumedPrepared(), "new generation finishes all gold and canvas preparation");
    assert.ok(slots > 50, "large gold plan requires multiple idle slots");
    for (const phase of [
      "settled-sheet",
      "figure-lights-setup",
      "figure-lights-pixels",
      "figure-lights-upload",
      "driver-crops",
      "driver-lights-pixels",
      "gold-raw-sheet",
      "gold-art-sheet",
      "gold-layer-sheet",
      "gold-crops",
      "gold-mask-composite",
      "buffer-face-buckets",
      "buffer-heat",
      "ready",
    ])
      assert.ok(t.preparationPhases.includes(phase), `preparation exposes ${phase}`);
    assert.ok(
      t.preparationPhases.indexOf("gold-raw-sheet") <
        t.preparationPhases.indexOf("gold-art-sheet") &&
        t.preparationPhases.indexOf("gold-art-sheet") <
          t.preparationPhases.indexOf("gold-layer-sheet"),
      "three gold sheets are separately staged in the original order",
    );
    const expectedPreset = config.pieces
      .filter((piece) => piece.preset)
      .reverse()
      .map((piece) => [piece.ax, piece.ay, piece.w, piece.h, piece.x, piece.y, piece.w, piece.h]);
    // Reactor masks also crop the atlas into small local sheets. The driver
    // contract concerns its figure-sized sheet, not those independent masks.
    const driverDraws = t.drawCalls.filter(
      (call) =>
        call.source === "/atlas.webp" &&
        t.canvases.find((canvas) => canvas.testCanvasId === call.target)?.width ===
          config.size.width,
    );
    assert.deepEqual(
      driverDraws.map((call) => call.rect),
      expectedPreset,
      "preset atlas crops keep their reverse draw order and rectangles",
    );
    const expectedGold = config.pieces
      .filter((piece) => !piece.preset && config.gold.cells[piece.id])
      .reverse()
      .flatMap((piece) => {
        const rect = [piece.ax, piece.ay, piece.w, piece.h, piece.x, piece.y, piece.w, piece.h];
        return [rect, rect];
      });
    const goldDraws = t.drawCalls.filter((call) => call.source === "/gold.webp");
    assert.deepEqual(
      goldDraws.map((call) => call.rect),
      expectedGold,
      "gold atlas crops keep their reverse draw order on both sheets",
    );
    t.observers[0].callback([{ isIntersecting: true }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(t.runway.dataset.rznState, "live");
    t.scrollTo(0.85);
    assert.ok(
      t.calls.some(([name]) => name === "drawImage"),
      "completed gold layers draw",
    );
  } finally {
    dispose();
  }
  assert.equal(t.idle.size, 0);
  assert.equal(t.frames.size, 0);
});

test("without requestIdleCallback the bounded timer fallback prepares the scene", async () => {
  const t = environment();
  delete t.env.requestIdleCallback;
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[0].callback([{ isIntersecting: true }]);
  await until(() => t.runway.dataset.rznState === "live", "timer fallback prepared the scene");
  assert.equal(t.runway.dataset.rznState, "live");
  dispose();
  assert.equal(t.frames.size, 0);
});

test("Safari fallback batches tiny slices but yields to timers after each bounded burst", async () => {
  const { MessageChannel } = await import("node:worker_threads");
  const t = environment();
  delete t.env.requestIdleCallback;
  let now = 0;
  let posts = 0;
  let timers = 0;
  let burst = 0;
  let maxBurst = 0;
  t.env.performance = { now: () => now };
  t.env.MessageChannel = class extends MessageChannel {
    constructor() {
      super();
      const post = this.port2.postMessage.bind(this.port2);
      this.port2.postMessage = (...args) => {
        posts++;
        now++;
        maxBurst = Math.max(maxBurst, ++burst);
        post(...args);
      };
    }
  };
  t.env.setTimeout = (callback, ms) => {
    if (ms === 16) {
      timers++;
      burst = 0;
    }
    return setTimeout(callback, 0);
  };
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  try {
    t.observers[0].callback([{ isIntersecting: true }]);
    // goLive marks the runway live before the mock ResizeObserver's next
    // task measures the canvas and queues its first animation frame. Wait
    // for that frame as the other live-scene tests do; scrollTo flushes it.
    await until(
      () => t.runway.dataset.rznState === "live" && t.frames.size > 0,
      "Safari tasks finish preparation and queue the first frame",
    );
    assert.ok(posts > timers, "tiny slices do not each incur a 16 ms delay");
    assert.ok(timers > 1, "paint/input receives repeated timer breaks");
    assert.ok(maxBurst <= 4, "task chaining stops at the 4 ms burst boundary");
    t.scrollTo(0.5);
    assert.notEqual(t.percent.textContent, "000", "scroll advances after preparation");
  } finally {
    dispose();
  }
  assert.equal(t.frames.size, 0);
});

test("a timed-out empty idle deadline switches the generation to bounded timer slices", async () => {
  const t = environment({ idleHeld: true });
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  try {
    t.observers[1].callback([{ isIntersecting: true }]);
    assert.equal(t.idle.size, 1);
    const [id, callback] = t.idle.entries().next().value;
    t.idle.delete(id);
    callback({ didTimeout: true, timeRemaining: () => 0 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(
      t.idleRequestCount(),
      1,
      "the same generation does not request another one-second idle timeout",
    );
    await until(t.prepared, "bounded timer slices complete preparation after idle timeout");
    assert.equal(t.idleRequestCount(), 1);
  } finally {
    dispose();
  }
  assert.equal(t.idle.size, 0);
});

test("an abandoned native idle callback cannot strand a visible scene in loading", async () => {
  const t = environment({ idleHeld: true });
  t.env.setTimeout = (callback, ms) => setTimeout(callback, Math.min(ms, 2));
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  try {
    t.observers[0].callback([{ isIntersecting: true }]);
    await until(
      () => t.runway.dataset.rznState === "live",
      "independent watchdog rescues native idle starvation",
    );
    assert.ok(t.prepared(), "the complete plan was prepared");
  } finally {
    dispose();
  }
  assert.equal(t.idle.size, 0, "abandoned native callbacks are cancelled");
});

test("hung image decode and bitmap optimisations fall back to loaded art", async () => {
  for (const phase of ["decode", "bitmap"]) {
    const t = environment();
    t.env.setTimeout = (callback, ms) => setTimeout(callback, Math.min(ms, 2));
    const BaseImage = t.env.Image;
    t.env.Image = class extends BaseImage {
      decode() {
        return phase === "decode" ? new Promise(() => {}) : Promise.resolve();
      }
    };
    const late = [];
    let closed = 0;
    if (phase === "bitmap")
      t.env.createImageBitmap = () => new Promise((resolve) => late.push(resolve));
    const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
    try {
      t.observers[0].callback([{ isIntersecting: true }]);
      await until(
        () => t.runway.dataset.rznState === "live",
        `${phase}: loaded images remain usable`,
      );
      assert.equal(t.runway.dataset.rznLoad, "ready");
      for (const resolve of late)
        resolve({
          close() {
            closed += 1;
          },
        });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(closed, late.length, "abandoned late bitmaps are released");
    } finally {
      dispose();
    }
  }
});

test("an optional nanite image that never finishes cannot block the figure", async () => {
  const { REXONANCE_NANITES } = await import("../src/lib/rexonance-nanites.ts");
  const t = environment();
  t.env.setTimeout = (callback, ms) => setTimeout(callback, Math.min(ms, 2));
  const BaseImage = t.env.Image;
  t.env.Image = class extends BaseImage {
    set src(value) {
      if (value === REXONANCE_NANITES.cells.src) {
        this._src = value;
        return;
      }
      super.src = value;
    }
  };
  const dispose = mountRexonanceAssembly(
    t.runway,
    { ...engineConfig, nanites: REXONANCE_NANITES },
    t.env,
  );
  try {
    t.observers[0].callback([{ isIntersecting: true }]);
    await until(
      () => t.runway.dataset.rznState === "live",
      "optional sheet failure leaves a live figure",
    );
    assert.equal(t.runway.dataset.rznLoad, "ready");
  } finally {
    dispose();
  }
});

test("optional kit metadata failure or abandonment cannot block the required engine", async () => {
  await import("../src/lib/rexonance-assembly-nanites.js");
  for (const failure of ["pending", "reject"]) {
    const t = environment();
    t.env.setTimeout = (callback, ms) => setTimeout(callback, ms === 8000 ? 30 : Math.min(ms, 2));
    const nanites = () =>
      failure === "pending" ? new Promise(() => {}) : Promise.reject(new Error("kit unavailable"));
    const dispose = mountRexonanceAssembly(t.runway, { ...engineConfig, nanites }, t.env);
    try {
      t.observers[0].callback([{ isIntersecting: true }]);
      await until(
        () => t.runway.dataset.rznState === "live",
        `${failure}: kit metadata is optional`,
      );
      assert.equal(t.runway.dataset.rznLoad, "ready");
    } finally {
      dispose();
    }
  }
});

test("failed image attempts release successful sibling bitmaps before retry", async () => {
  await import("../src/lib/rexonance-assembly-nanites.js");
  const t = environment();
  t.env.setTimeout = (callback, ms) => setTimeout(callback, ms === 8000 ? 30 : Math.min(ms, 2));
  const BaseImage = t.env.Image;
  let requests = 0;
  t.env.Image = class extends BaseImage {
    set src(value) {
      if (value === engineConfig.figure && ++requests === 1) {
        this._src = value;
        setTimeout(() => this.onerror?.(new Error("temporary failure")), 5);
        return;
      }
      super.src = value;
    }
  };
  const bitmaps = [];
  t.env.createImageBitmap = (image) => {
    const bitmap = {
      source: image._src,
      closed: 0,
      close() {
        this.closed += 1;
      },
    };
    bitmaps.push(bitmap);
    return Promise.resolve(bitmap);
  };
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  try {
    t.observers[0].callback([{ isIntersecting: true }]);
    await until(() => t.runway.dataset.rznState === "live", "a fresh image attempt completes");
    const siblings = bitmaps.filter((bitmap) => bitmap.source === engineConfig.undersuit);
    assert.equal(siblings.length, 2, "one undersuit bitmap per attempt");
    assert.ok(siblings[0].closed > 0, "failed attempt's successful sibling is released");
    assert.equal(siblings[1].closed, 0, "current attempt retains its usable bitmap");
  } finally {
    dispose();
  }
});

test("transient required-image failure retries and explicit/online recovery restarts once", async () => {
  for (const failure of ["transient", "error", "timeout", "online"]) {
    const permanent = failure !== "transient";
    const t = environment();
    t.env.setTimeout = (callback, ms) => setTimeout(callback, Math.min(ms, 2));
    const BaseImage = t.env.Image;
    let requests = 0;
    let failing = true;
    t.env.Image = class extends BaseImage {
      set src(value) {
        if (value === engineConfig.figure) {
          requests += 1;
          if (failing && (permanent || requests === 1)) {
            this._src = value;
            if (failure !== "timeout") queueMicrotask(() => this.onerror?.(new Error("offline")));
            return;
          }
        }
        super.src = value;
      }
    };
    const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
    try {
      assert.equal(t.runway.dataset.rznLoad, "waiting");
      t.observers[0].callback([{ isIntersecting: true }]);
      if (permanent) {
        await until(
          () => t.runway.dataset.rznLoad === "error",
          "terminal error is visible to the accessible status",
        );
        assert.equal(requests, 3, "initial request plus two bounded retries");
        failing = false;
        const retry = t.listeners.get(
          failure === "online" ? "window:online" : "runway:rexonance:assembly-retry",
        );
        assert.equal(typeof retry, "function");
        retry();
        retry();
      }
      await until(
        () => t.runway.dataset.rznState === "live",
        "image request recovery reaches a live scene",
      );
      assert.equal(requests, permanent ? 4 : 2, "duplicate retry does not start parallel requests");
      assert.equal(t.runway.dataset.rznLoad, "ready");
    } finally {
      dispose();
    }
    assert.equal(t.runway.dataset.rznLoad, undefined);
    assert.equal(t.listeners.has("runway:rexonance:assembly-retry"), false);
    assert.equal(t.listeners.has("window:online"), false);
  }
});

test("synchronous decode and bitmap exceptions retain loaded source art", async () => {
  for (const phase of ["decode", "bitmap"]) {
    const t = environment();
    const BaseImage = t.env.Image;
    t.env.Image = class extends BaseImage {
      decode() {
        if (phase === "decode") throw new Error("decoder unavailable");
        return Promise.resolve();
      }
    };
    if (phase === "bitmap")
      t.env.createImageBitmap = () => {
        throw new Error("bitmap unavailable");
      };
    const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
    try {
      t.observers[0].callback([{ isIntersecting: true }]);
      await until(() => t.runway.dataset.rznState === "live", `${phase}: recover with loaded art`);
      t.scrollTo(0.4);
      assert.ok(t.canvas.width > 0);
      assert.equal(t.readyCount(), 1);
    } finally {
      dispose();
    }
  }
});

test("first live frame renders even when ResizeObserver never delivers its initial notice", async () => {
  const t = environment();
  t.env.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  try {
    t.observers[0].callback([{ isIntersecting: true }]);
    await until(
      () => t.runway.dataset.rznState === "live" && t.frames.size > 0,
      "first frame queued without resize notice",
    );
    t.scrollTo(0.4);
    assert.ok(t.canvas.width > 0 && t.canvas.height > 0);
    assert.equal(t.runway.dataset.rznArming, undefined);
    assert.equal(t.readyCount(), 1);
  } finally {
    dispose();
  }
  assert.equal(t.frames.size, 0);
});

test("failed optional form loading can retry instead of staying permanently busy", async () => {
  const t = environment();
  const BaseImage = t.env.Image;
  let requests = 0;
  let failing = true;
  t.env.Image = class extends BaseImage {
    set src(value) {
      if (value === "/max.webp") {
        requests++;
        if (failing) {
          this._src = value;
          queueMicrotask(() => this.onerror?.(new Error("temporary form failure")));
          return;
        }
      }
      super.src = value;
    }
  };
  const dispose = mountRexonanceAssembly(
    t.runway,
    {
      ...engineConfig,
      forms: { max: "/max.webp", ultra: "/ultra.webp" },
    },
    t.env,
  );
  try {
    t.observers[0].callback([{ isIntersecting: true }]);
    await until(
      () => t.runway.dataset.rznState === "live" && t.frames.size > 0,
      "base scene ready",
    );
    t.runway.dataset.form = "max";
    t.scrollTo(0.99);
    await until(() => requests === 1, "first form request");
    await new Promise((resolve) => setImmediate(resolve));
    t.scrollTo(0.98);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 1, "scrolling does not hammer failed form requests");
    failing = false;
    t.listeners.get("window:online")();
    t.flush();
    await until(() => requests === 2, "network recovery retries failed form loading");
    await new Promise((resolve) => setImmediate(resolve));
    t.scrollTo(1);
    assert.equal(requests, 2, "successful form stays cached");
  } finally {
    dispose();
  }
});

test("a hidden tab releases partial crop canvases, then resumes from decoded images", async () => {
  const { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } =
    await import("../src/lib/rexonance-suit-gold.ts");
  const t = environment({ idleHeld: true });
  const config = {
    ...engineConfig,
    atlas: "/atlas.webp",
    gold: {
      atlas: "/gold.webp",
      cell: REXONANCE_SUIT_GOLD_CELL,
      cells: REXONANCE_SUIT_GOLD_CELLS,
    },
  };
  const dispose = mountRexonanceAssembly(t.runway, config, t.env);
  const step = async () => {
    for (const [id, callback] of [...t.idle]) {
      t.idle.delete(id);
      callback({ timeRemaining: () => 0 });
    }
    await new Promise((resolve) => setImmediate(resolve));
  };
  try {
    t.observers[1].callback([{ isIntersecting: true }]);
    for (let i = 0; i < 6000 && !t.preparationPhases.includes("gold-crops"); i += 1) await step();
    assert.ok(t.preparationPhases.includes("gold-crops"), "gold atlas crop phase starts");
    assert.ok(t.canvases.slice(1).some((canvas) => canvas.width > 0 && canvas.height > 0));
    const decoded = [...t.decodedSources];
    t.listeners.get("window:pagehide")();
    await step();
    assert.equal(t.idle.size, 0);
    assert.ok(
      t.canvases.slice(1).every((canvas) => canvas.width === 0 && canvas.height === 0),
      "cancelled generation releases every partial owned canvas",
    );
    assert.equal(t.prepared(), false, "partial layers never publish as ready");
    t.listeners.get("window:pageshow")();
    for (let i = 0; i < 24000 && !t.prepared(); i += 1) await step();
    assert.ok(t.prepared(), "the resumed generation completes");
    assert.deepEqual(t.decodedSources, decoded, "resume reuses decoded source images");
    assert.equal(t.readyCount(), 1, "only the complete resumed generation publishes");
  } finally {
    dispose();
  }
  assert.equal(t.idle.size, 0);
});

test("Save-Data and 2G shorten layout before fragment restoration, not on connection changes", () => {
  for (const connection of [
    { saveData: true },
    { effectiveType: "2g" },
    { effectiveType: "slow-2g" },
    { effectiveType: "4g" },
    undefined,
  ]) {
    let flag;
    const window = {
      navigator: { connection },
      document: {
        documentElement: {
          toggleAttribute: (key, on) => {
            assert.equal(key, "data-rzn-constrained");
            flag = on;
          },
        },
      },
    };
    runInNewContext(REXONANCE_LAYOUT_BOOT_SCRIPT, { window });
    assert.equal(flag, Boolean(connection && connection.effectiveType !== "4g"));
    if (connection) connection.effectiveType = "4g";
    const before = flag;
    assert.equal(flag, before, "no live layout listener");
    syncRexonanceLayoutGate(window);
    assert.equal(flag, Boolean(connection?.saveData));
  }
  assert.match(read("src/routes/__root.tsx"), /children: REXONANCE_LAYOUT_BOOT_SCRIPT/);
  assert.match(route, /cause === "enter"\) syncRexonanceLayoutGate/);
});

test("04: the trinity is a scene — three rings fall into phase, at rest locked", () => {
  // Decorative, one ring per system, drawn from the systems' own list.
  const trinity = page.match(
    /<div className="rzn-trinity" aria-hidden="true">[\s\S]*?<\/div>/,
  )?.[0];
  assert.ok(trinity);
  assert.match(trinity, /CORE_SYSTEMS\.map\(\(system\) => \(/);
  assert.match(trinity, /<b>\{system\.number\}<\/b>/);
  assert.ok(
    page.indexOf('className="rzn-trinity"') < page.indexOf('<div className="rxs-system-grid">'),
  );
  // Its time-based fallback rides the RESONANCE scene flag.
  assert.match(
    read("src/lib/rexonance-resonance.js"),
    /const SCENES =\s*"[^"]*\.rzn-trinity[^"]*";/,
  );
  // The rest is the finished picture: no base rule moves a ring; the
  // motion lives only in the gated rules (checked above).
  const base = sheet.rules.filter(
    ({ selector, context }) =>
      /\.rzn-tri\b|\.rzn-tri-/.test(selector) && !context.some((at) => REDUCED.test(at)),
  );
  assert.ok(base.length >= 6, String(base.length));
  for (const { selector, body } of base) {
    assert.doesNotMatch(body, /(?:^|; )(?:rotate|scale|transform):/, selector);
    // (Centring offsets of the marks and the lock line are not motion.)
    if (!/rzn-tri-lock$|::(?:before|after)$/.test(selector)) {
      assert.doesNotMatch(body, /(?:^|; )translate:/, selector);
    }
  }
  // The rings converge on their own named timeline, with the scroll.
  const scroll = sheet.rules.filter(
    ({ selector, body }) => /rzn-tri/.test(selector) && /animation-timeline: --rzn-tri;/.test(body),
  );
  assert.equal(scroll.length, 6);
  // Wide screens set the rings beside the heading, in its grid row.
  assert.match(css, /> #system > \.rzn-trinity \{[^}]*grid-area: 1 \/ 1;[^}]*justify-self: end;/);
});

test("the suit-up's read-out keeps clear of the Zeus button", () => {
  // Desktop: the stamp lands under the parts, high in the column, never in
  // the frame's bottom right corner where the button sits.
  const stamp = sheet.rules.find(
    ({ selector, context }) => /> \.rzn-suitup \.rzn-stamp$/.test(selector) && !context.length,
  );
  assert.match(stamp.body, /grid-row: 4;/);
  assert.match(stamp.body, /align-self: start;/);
  // Stacked: the parts stop short of the button's column; the narrowest
  // phones take two columns.
  const parts = sheet.rules.filter(({ selector }) => /> \.rzn-suitup \.rzn-parts$/.test(selector));
  assert.ok(parts.some(({ body }) => /max-width: calc\(100% - 84px\);/.test(body)));
  assert.ok(
    parts.some(
      ({ body, context }) =>
        /repeat\(2, max-content\)/.test(body) &&
        context.some((at) => /max-width: 349\.98px/.test(at)),
    ),
  );
});

test("the helmet forms from its outer layer inward, then the eyes fill (owner)", () => {
  const plan = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces: realPieces,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    tile: 12,
  });
  const [vx, vy] = REXONANCE_SUIT_MARKS.visor;
  const helm = plan.tiles.filter((tile) => tile.beat === 5);
  assert.ok(helm.length > 10);
  const far = helm.filter((tile) => Math.hypot(tile.cx - vx, tile.cy - vy) > 40);
  const near = helm.filter((tile) => Math.hypot(tile.cx - vx, tile.cy - vy) < 20);
  const mean = (list) => list.reduce((sum, tile) => sum + tile.t1, 0) / list.length;
  assert.ok(mean(far) < mean(near), "outer before inner");
  // Every tile of the helmet is on before the face's cells fill.
  assert.ok(Math.max(...helm.map((tile) => tile.t1)) < ASSEMBLY_BEATS.pixels[0]);
});

test("the gold forms by nanites right after each plate lands; the driver is on from the start", async () => {
  const { planAssemblyGold } = await import("../src/lib/rexonance-resonance.js");
  const { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } =
    await import("../src/lib/rexonance-suit-gold.ts");
  const { REXONANCE_SUIT_DRIVER } = await import("../src/lib/rexonance-calls.ts");
  const pieces = REXONANCE_SUIT_PIECES.map((piece) => ({
    ...piece,
    preset: REXONANCE_SUIT_DRIVER.includes(piece.id),
  }));
  const plan = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    maskTile: REXONANCE_SUIT_TILE,
    tile: 12,
  });
  // The driver is drawn whole from its cut-outs (never chopped into tiles).
  const driverIds = new Set(REXONANCE_SUIT_DRIVER);
  assert.ok(plan.tiles.every((tile) => !driverIds.has(tile.pieceId)));
  const landed = new Map();
  for (const tile of plan.tiles)
    if (tile.pieceId) landed.set(tile.pieceId, Math.max(landed.get(tile.pieceId) ?? 0, tile.t1));
  const gold = planAssemblyGold({
    pieces,
    gold: { atlas: "", cell: REXONANCE_SUIT_GOLD_CELL, cells: REXONANCE_SUIT_GOLD_CELLS },
    landed,
  });
  // This is the full synchronous plan, including equal-lock ordering and
  // overlap neighbors. Chunking must preserve the authored gold exactly.
  // (2026-10-16: the tiles' schedule spreads each piece along the scroll —
  // owner: a slow scroll lands a band at a time — and the plates are cut
  // from the base figure too, so the gold's locks moved with them; the hash
  // is the plan after those changes.)
  // (owner 2026-10-16 超大幅な改善 — the gold waits for the plate to clamp
  // (ASSEMBLY_GOLD.delay .003 → .008); each cell names its plate (`piece`).)
  // (Round 3: the helmet's gold from .005 after its last tile, over .010.)
  assert.equal(
    createHash("sha256").update(JSON.stringify(gold)).digest("hex"),
    "df2e5fe2e2b904a95e042bb8bafadb21d95da18a49f6e9bf7823689c9dea5730",
  );
  const steps = assemblyGoldPlanSteps({
    pieces,
    gold: { atlas: "", cell: REXONANCE_SUIT_GOLD_CELL, cells: REXONANCE_SUIT_GOLD_CELLS },
    tiles: plan.tiles,
  });
  let result;
  let checkpoints = 0;
  do {
    result = steps.next();
    checkpoints += 1;
  } while (!result.done);
  assert.ok(checkpoints > 100, "grid walks, sorting and overlaps expose preparation checkpoints");
  assert.deepEqual(result.value, gold, "idle and synchronous consumers return identical plans");
  assert.ok(gold.count > 4000);
  const earliest = Math.min(...landed.values());
  for (let i = 1; i < gold.count; i += 1) assert.ok(gold.lock[i] >= gold.lock[i - 1]);
  assert.ok(gold.lock[0] > earliest);
  // Done before the seal into the finished figure.
  assert.ok(gold.lock[gold.count - 1] < ASSEMBLY_BEATS.seal[1]);
});

/* ---------------- the nanite swarm (owner, 2026-10-16: 超大幅な改善) ---------------- */

test("touch with the nanite kit keeps its 64 art draws and at most 16 nanite sprites a frame", async () => {
  const { REXONANCE_NANITES, REXONANCE_NANITE_DIR } =
    await import("../src/lib/rexonance-nanites.ts");
  // Both with the kit and without it (two-tone rect chips, traced frames).
  for (const nanites of [REXONANCE_NANITES, undefined]) {
    const t = environment({ coarse: true });
    const dispose = mountRexonanceAssembly(t.runway, { ...engineConfig, nanites }, t.env);
    t.observers[1].callback([{ isIntersecting: true }]);
    await until(t.prepared, "warm preparation completed");
    t.observers[0].callback([{ isIntersecting: true }]);
    await until(() => t.runway.dataset.rznState === "live" && t.frames.size > 0, "scene live");
    // Unlike the older touch check above, let the canvas be measured (its
    // ResizeObserver notice is a later task), so these frames really draw.
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (nanites) {
      assert.ok(
        t.decodedSources.some((src) => src.startsWith(REXONANCE_NANITE_DIR)),
        "kit fetched",
      );
      assert.ok(!t.decodedSources.some((src) => /comets/.test(src)), "touch fetches no comets");
    }
    let kitDraws = 0;
    let drawn = 0;
    for (const progress of [
      0.058, 0.063, 0.065, 0.069625, 0.0815, 0.0855, 0.08625, 0.09, 0.1, 0.3, 0.35, 0.5, 0.7, 0.8,
      0.84,
    ]) {
      t.calls.length = 0;
      t.drawCalls.length = 0;
      t.scrollTo(progress);
      const art = t.calls.filter((c) => c[0] === "drawImage" && c[1] === 9 && c[2] === 1);
      // (Round 3: the undersuit's draw is reserved inside the budget, so a
      // touch frame stays within 64 in all — review: it was stated as 65.)
      assert.ok(art.length <= ASSEMBLY_TOUCH_ART_BUDGET, `${progress}: ${art.length}`);
      const kit = t.drawCalls.filter(
        (call) => call.target === 1 && String(call.source).startsWith(REXONANCE_NANITE_DIR),
      );
      assert.ok(kit.length <= 16, `${progress}: ${kit.length} nanite sprites`);
      kitDraws += kit.length;
      drawn += t.drawCalls.filter((call) => call.target === 1).length;
    }
    assert.ok(t.canvas.width > 0 && drawn > 0, "the frames were drawn");
    if (nanites) assert.ok(kitDraws > 0, "the chips nearest lock are drawn from the kit");
    else assert.equal(kitDraws, 0);
    dispose();
    assert.equal(t.frames.size, 0);
  }
});

test("the swarm's draw passes allocate nothing", () => {
  const source = read("src/lib/rexonance-assembly-nanites.js");
  const from = source.indexOf("/* -- draw passes: allocation-free from here -- */");
  const to = source.indexOf("/* -- end of the draw passes -- */");
  assert.ok(from > 0 && to > from + 20000, `${from} ${to}`);
  const passes = source.slice(from, to);
  assert.doesNotMatch(
    passes,
    /\bnew |\.map\(|\.filter\(|\.slice\(|\.concat\(|\[\]|Array\.from|\.push\(|=> \{\s*return \{/,
  );
  // No per-sprite transform: only plates (the jig) and rings set one.
  assert.equal(passes.match(/\.setTransform\(/g)?.length, 3);
  // (Round 3, review: seamArc's per-call closures and an array destructuring
  // slipped past the pin above.) Arrow functions only at the top level of
  // the pass region, never made inside a pass; no array destructuring.
  const nested = passes
    .split("\n")
    .filter((line) => /=>/.test(line) && !/^ {2}\S/.test(line) && !/^\s*\/\//.test(line));
  assert.deepEqual(nested, [], "no closures made inside the draw passes");
  assert.doesNotMatch(
    passes,
    /\b(?:const|let) \[[^\]]*\] =/,
    "no array destructuring in the draw passes",
  );
});

test("the nanite stage plan: paint order, the shared cells, and timings before .9", async () => {
  // (Round 3: the swarm's timings live with the swarm, which the scene now
  // loads with its pictures.)
  const { planAssemblyNanites, ASSEMBLY_NANITES } =
    await import("../src/lib/rexonance-assembly-nanites.js");
  const { REXONANCE_NANITES } = await import("../src/lib/rexonance-nanites.ts");
  const { planAssemblyGold } = await import("../src/lib/rexonance-resonance.js");
  const { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } =
    await import("../src/lib/rexonance-suit-gold.ts");
  const { REXONANCE_SUIT_DRIVER } = await import("../src/lib/rexonance-calls.ts");
  const pieces = REXONANCE_SUIT_PIECES.map((piece) => ({
    ...piece,
    preset: REXONANCE_SUIT_DRIVER.includes(piece.id),
  }));
  const options = {
    size: REXONANCE_SUIT_SIZE,
    pieces,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    maskTile: REXONANCE_SUIT_TILE,
    tile: 12,
  };
  const plan = planAssembly(options);
  const before = JSON.stringify(plan.tiles.map(({ m, t0, t1 }) => [m, t0, t1]));
  const goldPlan = planAssemblyGold({
    pieces,
    gold: { atlas: "", cell: REXONANCE_SUIT_GOLD_CELL, cells: REXONANCE_SUIT_GOLD_CELLS },
    landed: (() => {
      const landed = new Map();
      for (const tile of plan.tiles)
        if (tile.pieceId)
          landed.set(tile.pieceId, Math.max(landed.get(tile.pieceId) ?? 0, tile.t1));
      return landed;
    })(),
  });
  const nano = planAssemblyNanites({
    plan,
    pieces,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    gold: goldPlan,
    seams: REXONANCE_NANITES.seams,
    goldBoxes: REXONANCE_NANITES.goldBoxes,
  });
  // The tile schedule is untouched (index hashes only).
  assert.equal(JSON.stringify(plan.tiles.map(({ m, t0, t1 }) => [m, t0, t1])), before);
  const n = plan.tiles.length;
  assert.equal(nano.count, n);
  for (let k = 1; k < n; k += 1) assert.ok(nano.paintAt[k] >= nano.paintAt[k - 1]);
  for (let i = 0; i < n; i += 1) {
    assert.equal(nano.paintOrder[nano.paintRank[i]], i);
    assert.ok(nano.tp[i] > plan.tiles[i].t1, "paint follows the landing");
    const partner = nano.under[i];
    if (partner >= 0) {
      assert.equal(plan.tiles[partner].sx, plan.tiles[i].sx);
      assert.equal(plan.tiles[partner].sy, plan.tiles[i].sy);
      assert.notEqual(plan.tiles[partner].src, plan.tiles[i].src);
    }
    const parent = nano.parent[i];
    if (parent >= 0) {
      assert.ok(parent < i, "the lattice parent locked earlier");
      assert.equal(nano.pieceOf[parent], nano.pieceOf[i]);
    }
    assert.ok(
      nano.birth[i] <= plan.tiles[i].t0 + 1e-9 &&
        nano.birth[i] >= scrollFlameAt(NANITE_FIRE_PHASES.materialStart) - 1e-9,
      "metal enters the trailing burst before its unchanged flight/landing window",
    );
  }
  // Every plate: its seam, gold box and clamps release before .9 (tail
  // ≤ .878, helmet ≤ .892), the driver never staged.
  const driver = new Set(REXONANCE_SUIT_DRIVER);
  assert.ok(nano.pieces.length >= 50);
  for (const piece of nano.pieces) {
    assert.ok(!driver.has(piece.id), piece.id);
    assert.ok(piece.loopCount >= 1, `${piece.id} has a seam`);
    assert.ok(piece.contact > piece.to && piece.contact <= piece.to + ASSEMBLY_NANITES.seat + 1e-9);
    assert.ok(piece.g0 >= piece.contact, `${piece.id}: the gold pours after contact`);
    assert.ok(
      piece.releaseEnd < (piece.helm ? 0.8921 : 0.8781),
      `${piece.id}: ${piece.releaseEnd}`,
    );
    if (piece.helm) assert.equal(piece.lift, 0, "the helmet forms in place");
  }
  // The DEUS！ accents and the crest.
  assert.equal(nano.pieces.filter((piece) => piece.accent).length, 4);
  assert.equal(nano.pieces.find((piece) => piece.crest)?.id, "helmet-crest");
});

test("the gold guideway is built from the toe tips up, along the trims, never laid over from above (owner 2026-10-16)", async () => {
  // owner 2026-10-16: 「金のガイドウェイは上から被さる形ではなく、足先から
  // 滑らかに作られていく。」 Each plate's conduit grows from its lowest cell
  // along its trims; each beat's front climbs the body ahead of its fittings,
  // the legs from the toes; a slow scroll lengthens it cell by cell.
  const { planAssemblyNanites, createAssemblyNanites, ASSEMBLY_GUIDEWAY } =
    await import("../src/lib/rexonance-assembly-nanites.js");
  const { REXONANCE_NANITES } = await import("../src/lib/rexonance-nanites.ts");
  const { planAssemblyGold } = await import("../src/lib/rexonance-resonance.js");
  const { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } =
    await import("../src/lib/rexonance-suit-gold.ts");
  const { REXONANCE_SUIT_DRIVER } = await import("../src/lib/rexonance-calls.ts");
  const pieces = REXONANCE_SUIT_PIECES.map((piece) => ({
    ...piece,
    preset: REXONANCE_SUIT_DRIVER.includes(piece.id),
  }));
  const plan = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    maskTile: REXONANCE_SUIT_TILE,
    tile: 12,
  });
  const landed = new Map();
  for (const tile of plan.tiles)
    if (tile.pieceId) landed.set(tile.pieceId, Math.max(landed.get(tile.pieceId) ?? 0, tile.t1));
  const gold = planAssemblyGold({
    pieces,
    gold: { atlas: "", cell: REXONANCE_SUIT_GOLD_CELL, cells: REXONANCE_SUIT_GOLD_CELLS },
    landed,
  });
  const nano = planAssemblyNanites({
    plan,
    pieces,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    gold,
    seams: REXONANCE_NANITES.seams,
    goldBoxes: REXONANCE_NANITES.goldBoxes,
    goldCell: REXONANCE_SUIT_GOLD_CELL,
  });
  const built = nano.pieces.filter((piece) => piece.goldEnd > piece.goldFirst);
  assert.ok(built.length >= 50);
  let upward = 0;
  for (const piece of built) {
    const { goldFirst: a, goldEnd: b } = piece;
    for (let k = a + 1; k < b; k += 1) assert.ok(nano.buildAt[k] >= nano.buildAt[k - 1]);
    // Done before the plate seats, after RIDER! begins.
    assert.ok(piece.buildEnd <= piece.contact - ASSEMBLY_GUIDEWAY.ready + 1e-9, piece.id);
    assert.ok(piece.buildStart >= 0.07 && piece.buildStart <= piece.buildEnd, piece.id);
    assert.equal(nano.buildAt[a], piece.buildStart);
    // The tail is one chain from its root to its blade (checked below; review
    // 2026-10-16: it grew from the hanging blade and the root at once).
    if (piece.group === "tail" && piece.seg + (piece.id.endsWith("b") ? 1 : 0) > 0) continue;
    // It starts at the plate's lowest cell.
    let bottom = 0;
    for (let k = a; k < b; k += 1)
      bottom = Math.max(bottom, gold.y[nano.buildIdx[k]] + gold.h[nano.buildIdx[k]]);
    const entry = nano.buildIdx[a];
    assert.equal(gold.y[entry] + gold.h[entry], bottom, `${piece.id} grows from its lowest cell`);
    assert.equal(nano.buildB[entry], 0);
    // Its first fifth lies lower on the body than its last fifth.
    const fifth = Math.max(1, Math.floor((b - a) / 5));
    let early = 0;
    let late = 0;
    for (let k = 0; k < fifth; k += 1) {
      early += gold.y[nano.buildIdx[a + k]];
      late += gold.y[nano.buildIdx[b - 1 - k]];
    }
    if (early >= late) upward += 1;
  }
  const climbing = built.filter((piece) => piece.group !== "tail" || piece.id === "tail-0").length;
  assert.ok(upward >= climbing * 0.9, `${upward}/${climbing} plates grow upward`);
  // The tail's guideway is one build along the chain, root to blade
  // (review 2026-10-16): each segment starts where its predecessor's front
  // is — from its cell nearest the last cell that one built — as that one
  // is four fifths done.
  const chain = built
    .filter((piece) => piece.group === "tail")
    .sort((a, b) => a.seg - b.seg || (a.id < b.id ? -1 : 1));
  assert.equal(chain[0].id, "tail-0");
  assert.equal(chain.length, 9);
  const centre = (i) => [gold.x[i] + gold.w[i] / 2, gold.y[i] + gold.h[i] / 2];
  for (let k = 1; k < chain.length; k += 1) {
    const before = chain[k - 1];
    const piece = chain[k];
    assert.ok(piece.buildStart > before.buildStart, `${piece.id} follows ${before.id}`);
    assert.ok(
      piece.buildStart >= before.buildStart + 0.8 * (before.buildEnd - before.buildStart) - 1e-9,
      `${piece.id}: at most a fifth's overlap`,
    );
    const [lx, ly] = centre(nano.buildIdx[before.goldEnd - 1]);
    const [ex, ey] = centre(nano.buildIdx[piece.goldFirst]);
    const entry = Math.hypot(ex - lx, ey - ly);
    for (let kk = piece.goldFirst; kk < piece.goldEnd; kk += 1) {
      const [x, y] = centre(nano.buildIdx[kk]);
      assert.ok(Math.hypot(x - lx, y - ly) >= entry - 1e-9, `${piece.id} starts nearest the front`);
    }
  }
  // The legs climb from the toe tips: the feet first, the thighs last.
  const legs = built.filter((piece) => piece.group === "legs");
  const first = legs.reduce((a, b) => (b.buildStart < a.buildStart ? b : a));
  assert.match(first.id, /boot-foot/);
  const at = (id) => built.find((piece) => piece.id === id).buildStart;
  assert.ok(at("boot-foot-l") < at("boot-ankle-l"));
  assert.ok(at("boot-ankle-l") < at("knee-disc-l"));
  assert.ok(at("knee-disc-l") < at("thigh-top-l"));
  // No ornament's trim before the ornaments form (the knee rule).
  for (const piece of built)
    if (piece.group === "tail" || piece.group === "ribbon")
      assert.ok(piece.buildStart - ASSEMBLY_GUIDEWAY.holo > 0.58, piece.id);

  // Drawn: a foot's conduit lengthens with the scroll, from the toe end.
  const foot = built.find((piece) => piece.id === "boot-foot-l");
  const swarm = createAssemblyNanites({
    nano,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    sprites: { cells: null, comets: null, fx: null },
    kit: REXONANCE_NANITES,
    gold,
    layers: { face: { id: "guide" }, holo: { id: "holo" } },
  });
  const clipsFor = (q) => {
    const calls = [];
    let rects = [];
    const context = {
      save() {},
      restore() {},
      beginPath() {
        rects = [];
      },
      rect(x, y, w, h) {
        rects.push([x, y, w, h]);
      },
      clip() {
        calls.push({ rects });
      },
      drawImage(source, sx, sy) {
        const last = calls[calls.length - 1];
        if (last && !last.source) Object.assign(last, { source: source.id, sx, sy });
      },
      fill() {},
      stroke() {},
      moveTo() {},
      lineTo() {},
    };
    swarm.frame(q, 0, true, 1, false);
    swarm.hologramPass(context);
    return calls.filter((call) => call.sx === foot.ax && call.sy === foot.ay);
  };
  assert.equal(
    clipsFor(foot.buildStart - ASSEMBLY_GUIDEWAY.holo - 0.001).length,
    0,
    "nothing before",
  );
  // (Round 3: the conduit is drawn in bands — solid, then its front feathered
  // over three cell steps and filled sub-cell — so the built cells are the
  // union of its guide draws' clips, each rect inside one cell.)
  const builtCells = (q) => {
    const cells = new Set();
    const rects = [];
    for (const call of clipsFor(q))
      if (call.source === "guide")
        for (const [x, y, w, h] of call.rects) {
          rects.push([x, y, w, h]);
          cells.add(
            `${Math.floor((x + w / 2 - foot.x) / REXONANCE_SUIT_GOLD_CELL)},${Math.floor((y + h / 2 - foot.y) / REXONANCE_SUIT_GOLD_CELL)}`,
          );
        }
    return { count: cells.size, rects };
  };
  let previous = 0;
  for (const u of [0.15, 0.4, 0.7, 1]) {
    const q = foot.buildStart + u * (foot.buildEnd - foot.buildStart) + 1e-6;
    const solid = builtCells(q);
    assert.ok(solid.count > previous, `${u}: the conduit grows`);
    previous = solid.count;
    const lowest = Math.max(...solid.rects.map(([, y, , h]) => y + h));
    assert.equal(lowest, foot.gbox[1] + foot.gbox[3], "it runs from the toe end");
  }
  assert.equal(previous, foot.goldEnd - foot.goldFirst, "whole when done");

  // Its clamps slide in along the body from beside the box — never
  // descending onto it (no swing frames, no scale), the lower pair first.
  const fx = { id: "fx" };
  const clamps = createAssemblyNanites({
    nano,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    sprites: { cells: null, comets: null, fx },
    kit: REXONANCE_NANITES,
    gold,
  });
  const clampDraws = (q) => {
    const draws = [];
    const noop = () => {};
    const context = new Proxy(
      {
        drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh) {
          if (source === fx && sy < 192)
            draws.push({ frame: sx / 48, corner: sy / 48, dx, dy, dw, dh });
        },
      },
      { get: (target, key) => (key in target ? target[key] : noop), set: () => true },
    );
    clamps.frame(q, 0, true, 1, false);
    clamps.hardwarePass(context);
    return draws;
  };
  // (Round 3: the clamps come in .010 before the last tile, over .006.)
  const start = foot.to - 0.01;
  const slide = [0.0005, 0.0015, 0.0025, 0.0045].map((d) => clampDraws(start + d));
  for (const draws of slide)
    for (const draw of draws) assert.ok(draw.frame === 7 || draw.frame >= 8);
  const lowerLeft = slide.map((draws) =>
    draws.find(
      (draw) =>
        draw.corner === 2 && Math.abs(draw.dw - slide[3].find((d) => d.corner === 2).dw) < 1e-9,
    ),
  );
  assert.ok(lowerLeft.every(Boolean), "the lower-left clamp is drawn at one size throughout");
  for (let k = 1; k < 4; k += 1) {
    assert.ok(lowerLeft[k].dx >= lowerLeft[k - 1].dx, "it slides inward");
    assert.equal(lowerLeft[k].dy, lowerLeft[0].dy, "along the surface, not down onto it");
  }
  assert.ok(!slide[0].some((draw) => draw.corner < 2), "the upper pair follows the lower");
});

test("a landed tile stays drawn until its paint: the helmet's, formed in place, never vanishes (review 2026-10-16)", async () => {
  // The helmet is never staged, and its outer tiles land up to ~.05 before
  // their paint: the seated pass once looked only .0125 ahead along the
  // paint order, so they vanished after landing and popped back as metal.
  const {
    planAssemblyNanites,
    createAssemblyNanites,
    ASSEMBLY_NANITES: N,
  } = await import("../src/lib/rexonance-assembly-nanites.js");
  const { REXONANCE_NANITES } = await import("../src/lib/rexonance-nanites.ts");
  const { planAssemblyGold } = await import("../src/lib/rexonance-resonance.js");
  const { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } =
    await import("../src/lib/rexonance-suit-gold.ts");
  const { REXONANCE_SUIT_DRIVER } = await import("../src/lib/rexonance-calls.ts");
  const pieces = REXONANCE_SUIT_PIECES.map((piece) => ({
    ...piece,
    preset: REXONANCE_SUIT_DRIVER.includes(piece.id),
  }));
  const plan = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    maskTile: REXONANCE_SUIT_TILE,
    tile: 12,
  });
  const landed = new Map();
  for (const tile of plan.tiles)
    if (tile.pieceId) landed.set(tile.pieceId, Math.max(landed.get(tile.pieceId) ?? 0, tile.t1));
  const gold = planAssemblyGold({
    pieces,
    gold: { atlas: "", cell: REXONANCE_SUIT_GOLD_CELL, cells: REXONANCE_SUIT_GOLD_CELLS },
    landed,
  });
  const nano = planAssemblyNanites({
    plan,
    pieces,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    gold,
    seams: REXONANCE_NANITES.seams,
    goldBoxes: REXONANCE_NANITES.goldBoxes,
    goldCell: REXONANCE_SUIT_GOLD_CELL,
  });
  const metal = [{ id: "m0" }, { id: "m1" }];
  const swarm = createAssemblyNanites({
    nano,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    sprites: { cells: null, comets: null, fx: null },
    kit: REXONANCE_NANITES,
    gold,
    layers: { metal },
  });
  let rects = [];
  let clipped = [];
  const draws = new Map();
  const noop = () => {};
  const context = new Proxy(
    {
      beginPath() {
        rects = [];
      },
      rect(x, y) {
        rects.push([x, y]);
      },
      clip() {
        clipped = rects;
      },
      drawImage(source) {
        const src = metal.indexOf(source);
        if (src < 0) return;
        for (const [x, y] of clipped) {
          const key = `${src}:${x}:${y}`;
          draws.set(key, (draws.get(key) ?? 0) + 1);
        }
      },
      save() {},
      restore() {
        clipped = [];
      },
    },
    { get: (target, key) => (key in target ? target[key] : noop), set: () => true },
  );
  const tiles = plan.tiles;
  let checked = 0;
  for (let q = 0.66; q <= 0.86; q += 0.001) {
    draws.clear();
    swarm.frame(q, 0, true, 1, false);
    swarm.seatedPass(context, swarm.paintedBy(q));
    swarm.stagedPass(context);
    for (let i = 0; i < tiles.length; i += 1) {
      if (tiles[i].t1 + N.recoil > q || nano.tp[i] <= q) continue;
      const key = `${tiles[i].src ?? 1}:${tiles[i].sx}:${tiles[i].sy}`;
      assert.equal(
        draws.get(key),
        1,
        `q ${q.toFixed(3)}: tile ${i} (${tiles[i].pieceId}) drawn once`,
      );
      checked += 1;
    }
  }
  assert.ok(checked > 1000, `${checked} landed, unpainted tiles checked`);
});

test("no plate shifts when it completes: narrow hanging plates form in place, and a plate is at its seat from contact on (owner 2026-10-16)", async () => {
  // owner 2026-10-16: 「前がけの生成完了時にズレるのを修正して。」 The staged
  // front tasset did not lie where its gold formed, and snapped home at
  // completion. Every landed tile's drawn place must move smoothly while
  // its plate is staged (no flip between a jigged and a seated pose, also
  // on touch's lower cap), be the seat itself from contact on, and the
  // tasset and the plates much taller than wide never leave their seat.
  const {
    planAssemblyNanites,
    createAssemblyNanites,
    ASSEMBLY_NANITES: N,
  } = await import("../src/lib/rexonance-assembly-nanites.js");
  const { REXONANCE_NANITES } = await import("../src/lib/rexonance-nanites.ts");
  const { planAssemblyGold } = await import("../src/lib/rexonance-resonance.js");
  const { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } =
    await import("../src/lib/rexonance-suit-gold.ts");
  const { REXONANCE_SUIT_DRIVER } = await import("../src/lib/rexonance-calls.ts");
  const pieces = REXONANCE_SUIT_PIECES.map((piece) => ({
    ...piece,
    preset: REXONANCE_SUIT_DRIVER.includes(piece.id),
  }));
  const plan = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    maskTile: REXONANCE_SUIT_TILE,
    tile: 12,
  });
  const landed = new Map();
  for (const tile of plan.tiles)
    if (tile.pieceId) landed.set(tile.pieceId, Math.max(landed.get(tile.pieceId) ?? 0, tile.t1));
  const gold = planAssemblyGold({
    pieces,
    gold: { atlas: "", cell: REXONANCE_SUIT_GOLD_CELL, cells: REXONANCE_SUIT_GOLD_CELLS },
    landed,
  });
  const nanoArgs = {
    plan,
    pieces,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    gold,
    seams: REXONANCE_NANITES.seams,
    goldBoxes: REXONANCE_NANITES.goldBoxes,
    goldCell: REXONANCE_SUIT_GOLD_CELL,
  };
  for (const coarse of [false, true]) {
    const nano = planAssemblyNanites({ ...nanoArgs, coarse });
    for (const piece of nano.pieces)
      if (/^tasset/.test(piece.id) || (piece.kind === 0 && piece.h > 1.85 * piece.w))
        assert.ok(
          piece.fixed && piece.offX === 0 && piece.offY === 0 && piece.theta === 0,
          piece.id,
        );
    const metal = [{ id: "m0" }, { id: "m1" }];
    const swarm = createAssemblyNanites({
      nano,
      size: REXONANCE_SUIT_SIZE,
      core: REXONANCE_SUIT_MARKS.core,
      visor: REXONANCE_SUIT_MARKS.visor,
      sprites: { cells: null, comets: null, fx: null },
      kit: REXONANCE_NANITES,
      gold,
      layers: { metal },
      coarse,
    });
    swarm.view(1, 0, 0);
    let rects = [];
    let clipped = [];
    let m = [1, 0, 0, 1, 0, 0];
    const seen = new Map();
    const noop = () => {};
    const context = new Proxy(
      {
        beginPath() {
          rects = [];
        },
        rect(x, y, w, h) {
          rects.push([x, y, w, h]);
        },
        clip() {
          clipped = rects;
        },
        setTransform(a, b, c, d, e, f) {
          m = [a, b, c, d, e, f];
        },
        drawImage(source) {
          if (!metal.includes(source)) return;
          for (const [x, y, w, h] of clipped) {
            const cx = x + w / 2;
            const cy = y + h / 2;
            seen.set(`${metal.indexOf(source)}:${x}:${y}`, [
              m[0] * cx + m[2] * cy + m[4],
              m[1] * cx + m[3] * cy + m[5],
            ]);
          }
        },
        save() {},
        restore() {
          clipped = [];
        },
      },
      { get: (target, key) => (key in target ? target[key] : noop), set: () => true },
    );
    const tiles = plan.tiles;
    const pieceOf = new Map(nano.pieces.map((piece) => [piece.id, piece]));
    const last = new Map();
    let checked = 0;
    let worst = 0;
    const STEP = 0.0002;
    for (let q = 0.1; q <= 0.9; q += STEP) {
      seen.clear();
      swarm.frame(q, 0, true, 1, false);
      m = [1, 0, 0, 1, 0, 0];
      swarm.seatedPass(context, swarm.paintedBy(q));
      swarm.stagedPass(context);
      for (let i = 0; i < tiles.length; i += 1) {
        const tile = tiles[i];
        if (!tile.pieceId || tile.t1 + N.recoil > q || nano.tp[i] <= q) continue;
        const key = `${tile.src ?? 1}:${tile.sx}:${tile.sy}`;
        const at = seen.get(key);
        if (!at) continue;
        const piece = pieceOf.get(tile.pieceId);
        const cx = tile.sx + tile.tw / 2;
        const cy = tile.sy + tile.th / 2;
        if (piece.fixed || q >= piece.contact) {
          const off = Math.hypot(at[0] - cx, at[1] - cy);
          assert.ok(
            off < 1e-6,
            `${coarse ? "touch" : "desktop"} q ${q.toFixed(4)}: ${tile.pieceId} off its seat by ${off.toFixed(2)}`,
          );
        }
        const before = last.get(key);
        if (before && before[2] === Math.round(q / STEP) - 1) {
          const step = Math.hypot(at[0] - before[0], at[1] - before[1]);
          worst = Math.max(worst, step);
          // (The fastest slam home, the tail's last turn, is ~5.5 px a step;
          // a flip between poses is 10–25 px.)
          assert.ok(
            step < 7,
            `${coarse ? "touch" : "desktop"} q ${q.toFixed(4)}: ${tile.pieceId} jumps ${step.toFixed(1)} px`,
          );
        }
        last.set(key, [at[0], at[1], Math.round(q / STEP)]);
        checked += 1;
      }
    }
    assert.ok(checked > 5000, `${checked} landed tiles followed`);
    assert.ok(worst > 0.5, "the staged plates still move in");
  }
});

test("an armour tile never carries an ornament's pixels: the ribbon beside the knees forms with the ribbon (review 2026-10-16)", async () => {
  // owner 2026-10-16: no decoration beside the knees before it is fitted.
  // Dark ribbon pixels of the full art, where the base figure shows nothing
  // but a thigh's or knee's cut-out mask reaches, once landed with the legs
  // as black squares (p .27–.88). Such a cell is an ornament's.
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const sharp = require("sharp");
  const { REXONANCE_SUIT_ORNAMENTS } = await import("../src/lib/rexonance-suit-base.ts");
  const { REXONANCE_SUIT_DRIVER } = await import("../src/lib/rexonance-calls.ts");
  const { width: W, height: H } = REXONANCE_SUIT_SIZE;
  const tile = 12;
  const cols = Math.ceil(W / tile);
  const rows = Math.ceil(H / tile);
  const sampleOf = async (file) => {
    const { fileURLToPath } = await import("node:url");
    const { data } = await sharp(fileURLToPath(new URL(file, import.meta.url)))
      .ensureAlpha()
      .extend({
        right: cols * tile - W,
        bottom: rows * tile - H,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .resize(cols, rows, { kernel: "linear" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data) };
  };
  const sample = await sampleOf("../public/rexonance-suit-20261016/figure.webp");
  const baseSample = await sampleOf("../public/rexonance-suit-base-20261016/base.webp");
  const pieces = REXONANCE_SUIT_PIECES.map((piece) => ({
    ...piece,
    preset: REXONANCE_SUIT_DRIVER.includes(piece.id),
  }));
  const groupOf = new Map(pieces.map((piece) => [piece.id, piece.group]));
  const ornament = new Set(REXONANCE_SUIT_ORNAMENTS);
  const plan = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    maskTile: REXONANCE_SUIT_TILE,
    tile,
    sample,
    baseSample,
    ornaments: REXONANCE_SUIT_ORNAMENTS,
  });
  let beside = 0;
  for (const item of plan.tiles) {
    if ((item.src ?? 1) !== 1) continue;
    const offset = ((item.sy / tile) * cols + item.sx / tile) * 4;
    if (baseSample.data[offset + 3] >= 40) continue;
    beside += 1;
    assert.ok(
      item.pieceId && ornament.has(groupOf.get(item.pieceId)),
      `cell ${item.sx},${item.sy} (${item.pieceId}) lands with an ornament`,
    );
  }
  assert.ok(beside > 0);
});

test("a resting frame is a function of the progress alone: the same moment draws the same chips however it was reached (review 2026-10-16)", async () => {
  // The far band's sprite share once came from the previous frame's tally,
  // so a calm frame at one progress drew differently after a forward scrub,
  // a reverse scrub or a jump. It is now a function of q.
  const { planAssemblyNanites, createAssemblyNanites } =
    await import("../src/lib/rexonance-assembly-nanites.js");
  const { REXONANCE_NANITES } = await import("../src/lib/rexonance-nanites.ts");
  const { planAssemblyGold } = await import("../src/lib/rexonance-resonance.js");
  const { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } =
    await import("../src/lib/rexonance-suit-gold.ts");
  const { REXONANCE_SUIT_DRIVER } = await import("../src/lib/rexonance-calls.ts");
  const pieces = REXONANCE_SUIT_PIECES.map((piece) => ({
    ...piece,
    preset: REXONANCE_SUIT_DRIVER.includes(piece.id),
  }));
  const plan = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    maskTile: REXONANCE_SUIT_TILE,
    tile: 12,
  });
  const landed = new Map();
  for (const tile of plan.tiles)
    if (tile.pieceId) landed.set(tile.pieceId, Math.max(landed.get(tile.pieceId) ?? 0, tile.t1));
  const gold = planAssemblyGold({
    pieces,
    gold: { atlas: "", cell: REXONANCE_SUIT_GOLD_CELL, cells: REXONANCE_SUIT_GOLD_CELLS },
    landed,
  });
  const nano = planAssemblyNanites({
    plan,
    pieces,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    gold,
    seams: REXONANCE_NANITES.seams,
    goldBoxes: REXONANCE_NANITES.goldBoxes,
    goldCell: REXONANCE_SUIT_GOLD_CELL,
  });
  const sheet = (id) => ({ id, width: 1, height: 1 });
  const swarm = createAssemblyNanites({
    nano,
    size: REXONANCE_SUIT_SIZE,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    sprites: { cells: sheet("cells"), comets: sheet("comets"), fx: sheet("fx") },
    kit: REXONANCE_NANITES,
    gold,
    layers: { face: sheet("face"), holo: sheet("holo"), walls: sheet("walls") },
  });
  const record = () => {
    const log = [];
    const round = (value) =>
      typeof value === "number" ? Math.round(value * 1000) / 1000 : (value?.id ?? value);
    const context = new Proxy(
      {},
      {
        get:
          (_, key) =>
          (...args) =>
            log.push(`${String(key)}(${args.map(round).join(",")})`),
        set: (_, key, value) => {
          log.push(`${String(key)}=${round(value)}`);
          return true;
        },
      },
    );
    return { log, context };
  };
  // Every pass of a frame at q, after the given predecessors.
  const frameAt = (q, before, calm) => {
    for (const [p, live] of before) {
      const { context } = record();
      swarm.frame(p, live ? 0.004 : 0, !live, 2, false);
      swarm.view(2, 0, 0);
      for (const pass of ["backPass", "midPass", "flightPass", "goldPass", "frontPass", "freePass"])
        swarm[pass](context);
      swarm.endFrame();
    }
    const { log, context } = record();
    swarm.frame(q, 0, calm, 2, false);
    swarm.view(2, 0, 0);
    for (const pass of ["backPass", "midPass", "frontPass", "freePass"]) swarm[pass](context);
    swarm.endFrame();
    return log;
  };
  for (const q of [0.15, 0.25, 0.3, 0.4]) {
    const forward = frameAt(
      q,
      [
        [q - 0.02, true],
        [q - 0.01, true],
        [q, true],
      ],
      true,
    );
    const reverse = frameAt(
      q,
      [
        [q + 0.02, true],
        [q + 0.01, true],
        [q, true],
      ],
      true,
    );
    const jump = frameAt(
      q,
      [
        [0.95, true],
        [q, true],
      ],
      true,
    );
    const cold = frameAt(q, [], true);
    assert.ok(forward.length > 1000, `${q}: the cocoon is drawn (${forward.length} calls)`);
    assert.deepEqual(reverse, forward, `${q}: reverse scrub`);
    assert.deepEqual(jump, forward, `${q}: jump`);
    assert.deepEqual(cold, forward, `${q}: first frame`);
    // Live frames too (comets aside): the band passes match.
    const liveA = frameAt(q, [[q - 0.02, true]], false);
    const liveB = frameAt(q, [[q + 0.02, true]], false);
    assert.deepEqual(liveB, liveA, `${q}: live frames after different scrubs`);
  }
  // The lock flash is a transient (sweep 2, F85): a resting frame never
  // holds its weld-bright star, moving frames draw it. (The spark's dimmer
  // frames, 32 and 64 px along its row, are the flash's alone.)
  const flashes = (log) =>
    log.filter((call) => /^drawImage\(cells,(320|352),192,32,32,/.test(call)).length;
  const every = (q, calm) => {
    const { log, context } = record();
    swarm.frame(q, calm ? 0 : 0.004, calm, 2, false);
    swarm.view(2, 0, 0);
    for (const pass of ["backPass", "midPass", "flightPass", "goldPass", "frontPass", "freePass"])
      swarm[pass](context);
    swarm.endFrame();
    return log;
  };
  let moving = 0;
  for (let k = 20; k <= 86; k += 1) {
    const q = k / 100;
    moving += flashes(every(q, false));
    assert.equal(flashes(every(q, true)), 0, `${q}: a resting frame holds no lock flash`);
  }
  assert.ok(moving > 0, "moving frames draw the lock flash");
});

test("the raw metal and the molten gold are made in bands of rows, byte for byte the kit's pixel jobs, however sliced (review 2026-10-16: idle slices ≤ 6 ms)", async () => {
  // A whole-figure read and its canvases in one idle slice cost 7–12 ms on a
  // phone; the scene now shades a band of rows a slice. The bytes are the
  // kit's own (createNaniteMetalJob / createNaniteMoltenJob).
  // Sweep 2 (F02): each readback is a native round trip (a GPU sync, 14–100
  // ms each while the reader scrolled, whatever its size): one read per
  // source and an upload per strip of rows, never one a band (2,080 reads
  // had stalled the scroll above the runway for 50 s).
  const { createAssemblyLayerJob } = await import("../src/lib/rexonance-assembly-nanites.js");
  const { createNaniteMetalJob, createNaniteMoltenJob } =
    await import("../src/lib/rexonance-unlit.js");
  const STRIP = 104;
  // A pixel-exact fake canvas (unscaled copies only).
  const reads = [];
  const puts = [];
  const document = {
    createElement() {
      const canvas = { width: 0, height: 0, data: null };
      const sized = () => {
        if (!canvas.data || canvas.data.length !== canvas.width * canvas.height * 4)
          canvas.data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
        return canvas.data;
      };
      const copy = (src, sw, sx, sy, dst, dw, dx, dy, w, h, dh) => {
        for (let y = 0; y < h; y += 1) {
          if (dy + y < 0 || dy + y >= dh) continue;
          for (let x = 0; x < w; x += 1) {
            const s = ((sy + y) * sw + sx + x) * 4;
            const d = ((dy + y) * dw + dx + x) * 4;
            for (let c = 0; c < 4; c += 1) dst[d + c] = src[s + c] ?? 0;
          }
        }
      };
      canvas.getContext = () => ({
        drawImage(image, sx, sy, sw, sh, dx, dy) {
          const dst = sized();
          const src = image.getContext ? image.getContext("2d").pixels() : image.data;
          copy(src, image.width, sx, sy, dst, canvas.width, dx, dy, sw, sh, canvas.height);
        },
        clearRect(x, y, w, h) {
          const dst = sized();
          for (let yy = y; yy < y + h; yy += 1)
            dst.fill(0, (yy * canvas.width + x) * 4, (yy * canvas.width + x + w) * 4);
        },
        getImageData(x, y, w, h) {
          reads.push(h);
          const data = new Uint8ClampedArray(w * h * 4);
          copy(sized(), canvas.width, x, y, data, w, 0, 0, w, h, h);
          return { width: w, height: h, data };
        },
        createImageData(w, h) {
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        putImageData(image, dx, dy, x0 = 0, y0 = 0, w = image.width, h = image.height) {
          puts.push(h);
          copy(
            image.data,
            image.width,
            x0,
            y0,
            sized(),
            canvas.width,
            dx + x0,
            dy + y0,
            w,
            h,
            canvas.height,
          );
        },
        pixels: sized,
      });
      return canvas;
    },
  };
  const W = 37;
  const H = 131;
  let state = 0x5eed1234;
  const data = Uint8ClampedArray.from({ length: W * H * 4 }, (_, i) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const v = state >>> 24;
    if (i % 4 === 3) return v < 85 ? 0 : v < 140 ? v : 255;
    return v;
  });
  const source = { width: W, height: H, data };
  const mask = { width: W, height: H, data: data.map((v, i) => (i % 4 === 3 ? 255 - v : v)) };
  const run = (job, slice) => {
    let clock = 0;
    const saved = globalThis.performance.now;
    globalThis.performance.now = () => (clock += slice);
    try {
      while (!job.step(clock + 4, null));
    } finally {
      globalThis.performance.now = saved;
    }
    return job.commit();
  };
  const bytes = (canvas) => Array.from(canvas.getContext("2d").pixels());
  const kitMetal = run(createNaniteMetalJob(source, 0, 0, W, H, document, { silhouette: true }), 1);
  const kitMolten = run(createNaniteMoltenJob(source, 0, 0, W, H, document, { mask }), 1);
  const strips = Math.ceil(H / STRIP);
  // The native round trips: a read per source, an upload per strip.
  const roundTrips = (label, copies, outputs) => {
    assert.equal(reads.length, copies, `${label}: one readback per source (${reads})`);
    assert.ok(
      puts.every((rows) => rows <= STRIP),
      `${label}: each upload is a strip at most (${puts})`,
    );
    assert.ok(
      puts.length <= outputs * strips + outputs,
      `${label}: ${puts.length} uploads for ${outputs} outputs of ${strips} strips`,
    );
    reads.length = puts.length = 0;
  };
  for (const slice of [0.5, 3, 100]) {
    reads.length = puts.length = 0;
    const metal = run(
      createAssemblyLayerJob({
        source,
        width: W,
        height: H,
        kind: "metal",
        silhouette: true,
        document,
      }),
      slice,
    );
    roundTrips(`metal, slice ${slice}`, 1, 2);
    assert.deepEqual(bytes(metal.metal), bytes(kitMetal.metal), `metal, slice ${slice}`);
    assert.deepEqual(
      bytes(metal.silhouette),
      bytes(kitMetal.silhouette),
      `silhouette, slice ${slice}`,
    );
    const molten = run(
      createAssemblyLayerJob({ source, width: W, height: H, kind: "molten", mask, document }),
      slice,
    );
    roundTrips(`molten, slice ${slice}`, 2, 1);
    assert.deepEqual(bytes(molten.molten), bytes(kitMolten.molten), `molten, slice ${slice}`);
    const plain = run(
      createAssemblyLayerJob({ source, width: W, height: H, kind: "metal", document }),
      slice,
    );
    roundTrips(`metal alone, slice ${slice}`, 1, 1);
    assert.deepEqual(bytes(plain.metal), bytes(kitMetal.metal), `metal alone, slice ${slice}`);
  }
  // A figure several strips tall keeps the same bounds (the real figure is
  // 1040 rows: one read, not 520), with the rim exact across the strips.
  {
    const tallH = STRIP * 3 + 7;
    const tall = { width: W, height: tallH, data: new Uint8ClampedArray(W * tallH * 4) };
    for (let i = 0; i < tall.data.length; i += 1) tall.data[i] = data[i % data.length];
    const kitTall = run(
      createNaniteMetalJob(tall, 0, 0, W, tallH, document, { silhouette: true }),
      1,
    );
    reads.length = puts.length = 0;
    const job = run(
      createAssemblyLayerJob({
        source: tall,
        width: W,
        height: tallH,
        kind: "metal",
        silhouette: true,
        document,
      }),
      0.5,
    );
    assert.equal(reads.length, 1, "one read of the source");
    // (Metal and silhouette, a strip each: three whole strips and the rest.)
    assert.deepEqual(
      puts,
      [STRIP, STRIP, STRIP, STRIP, STRIP, STRIP, 7, 7],
      "an upload per strip of each output",
    );
    assert.deepEqual(bytes(job.metal), bytes(kitTall.metal), "tall metal");
    assert.deepEqual(bytes(job.silhouette), bytes(kitTall.silhouette), "tall silhouette");
  }
  // And the scene uses them, not the whole-figure jobs.
  const engine = read("src/lib/rexonance-resonance.js");
  assert.match(engine, /createAssemblyLayerJob\(\{[\s\S]*?kind: "metal"/);
  assert.match(engine, /createAssemblyLayerJob\(\{[\s\S]*?kind: "molten"/);
  assert.doesNotMatch(engine, /createNaniteMetalJob\(|createNaniteMoltenJob\(/);
});

// Owner (2026-10-21): 「スクロールに伴って全身が上下に移動する不具合を修正して。」
// While the frame is pinned the whole figure stands at one place: the
// scene's view (scale and origin) is the same on every frame of the runway,
// forwards, backwards and on jumps, and the swarm never shakes it.
test("the pinned figure never moves with the scroll: one view transform for every progress", async () => {
  const t = environment();
  const dispose = mountRexonanceAssembly(t.runway, engineConfig, t.env);
  t.observers[0].callback([
    { isIntersecting: true, boundingClientRect: { top: 400, bottom: 3100 } },
  ]);
  await until(() => t.runway.dataset.rznState === "live" && t.frames.size > 0, "scene live");
  const scene = t.canvas.testCanvasId;
  // Each frame starts from identity (the clear), then sets the view.
  const identity = (args) =>
    args[0] === 1 &&
    args[1] === 0 &&
    args[2] === 0 &&
    args[3] === 1 &&
    args[4] === 0 &&
    args[5] === 0;
  const views = () => {
    const own = t.transforms.filter(({ target }) => target === scene);
    return own.filter((entry, i) => i > 0 && identity(own[i - 1].args) && !identity(entry.args));
  };
  t.transforms.length = 0;
  const path = [];
  for (let q = 0; q <= 1.0001; q += 0.0025) path.push(q);
  for (let q = 1; q >= -0.0001; q -= 0.01) path.push(q);
  path.push(0.5, 0.05, 0.95, 0.2, 0.8);
  for (const q of path) {
    t.scrollTo(Math.max(0, Math.min(1, q)));
    for (let k = 0; k < 4 && t.frames.size; k += 1) t.flush();
  }
  const drawn = views();
  assert.ok(drawn.length > path.length, `${drawn.length} scene frames drawn`);
  const [first] = drawn;
  // 1440 × 837 css px at ratio 2 (the harness): the figure's place in the frame.
  assert.ok(first.args[0] > 0 && first.args[5] >= 0, String(first.args));
  for (const { args } of drawn) assert.deepEqual(args, first.args, "the view moved");
  dispose();
});

test("the swarm never shakes the view: zero shake on every frame, desktop and touch", async () => {
  const { planAssemblyNanites, createAssemblyNanites } =
    await import("../src/lib/rexonance-assembly-nanites.js");
  const { REXONANCE_NANITES } = await import("../src/lib/rexonance-nanites.ts");
  const { planAssemblyGold } = await import("../src/lib/rexonance-resonance.js");
  const { REXONANCE_SUIT_GOLD_CELL, REXONANCE_SUIT_GOLD_CELLS } =
    await import("../src/lib/rexonance-suit-gold.ts");
  const { REXONANCE_SUIT_DRIVER } = await import("../src/lib/rexonance-calls.ts");
  const pieces = REXONANCE_SUIT_PIECES.map((piece) => ({
    ...piece,
    preset: REXONANCE_SUIT_DRIVER.includes(piece.id),
  }));
  const plan = planAssembly({
    size: REXONANCE_SUIT_SIZE,
    pieces,
    core: REXONANCE_SUIT_MARKS.core,
    visor: REXONANCE_SUIT_MARKS.visor,
    maskTile: REXONANCE_SUIT_TILE,
    tile: 12,
  });
  const landed = new Map();
  for (const tile of plan.tiles)
    if (tile.pieceId) landed.set(tile.pieceId, Math.max(landed.get(tile.pieceId) ?? 0, tile.t1));
  const gold = planAssemblyGold({
    pieces,
    gold: { atlas: "", cell: REXONANCE_SUIT_GOLD_CELL, cells: REXONANCE_SUIT_GOLD_CELLS },
    landed,
  });
  for (const coarse of [false, true]) {
    const nano = planAssemblyNanites({
      plan,
      pieces,
      size: REXONANCE_SUIT_SIZE,
      core: REXONANCE_SUIT_MARKS.core,
      visor: REXONANCE_SUIT_MARKS.visor,
      gold,
      seams: REXONANCE_NANITES.seams,
      goldBoxes: REXONANCE_NANITES.goldBoxes,
      goldCell: REXONANCE_SUIT_GOLD_CELL,
      coarse,
    });
    const swarm = createAssemblyNanites({
      nano,
      size: REXONANCE_SUIT_SIZE,
      core: REXONANCE_SUIT_MARKS.core,
      visor: REXONANCE_SUIT_MARKS.visor,
      sprites: { cells: null, comets: null, fx: null },
      kit: REXONANCE_NANITES,
      gold,
      layers: { metal: [] },
      coarse,
    });
    swarm.view(1, 0, 0);
    // The accents' and the crest's contacts, where the old shake played.
    const contacts = nano.pieces.map((piece) => piece.contact).filter(Number.isFinite);
    const qs = [];
    for (let q = 0; q <= 1; q += 0.0005) qs.push(q);
    for (const c of contacts) for (let d = 0; d < 0.007; d += 0.0005) qs.push(c + d);
    for (const q of qs)
      for (const calm of [false, true]) {
        const state = swarm.frame(q, 0.002, calm, 1, false);
        assert.ok(
          state.shakeX === 0 && state.shakeY === 0,
          `${coarse ? "touch" : "desktop"} q ${q.toFixed(4)}: shake ${state.shakeX}, ${state.shakeY}`,
        );
      }
  }
  // And the scene adds nothing to its view from the swarm.
  const engine = read("src/lib/rexonance-resonance.js");
  assert.doesNotMatch(engine, /\bv[xy] \+= shake/);
});
