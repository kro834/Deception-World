import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The file shutter (2026-09-29): every covered route change closes onto what
// was pressed and opens from the destination's portrait frame
// (src/components/load-gate.tsx, src/styles-transition-cinema.css).

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");

const gate = read("src/components/load-gate.tsx");
const root = read("src/routes/__root.tsx");
const source = read("src/styles-transition-cinema.css");
const css = source.replace(/\/\*[\s\S]*?\*\//g, "");

// A small block parser: every rule with the at-rules it sits in.
function parseCss(text) {
  const rules = [];
  const keyframes = new Map();
  const walk = (body, context) => {
    let index = 0;
    while (index < body.length) {
      const open = body.indexOf("{", index);
      if (open === -1) break;
      const prelude = body.slice(index, open).trim();
      let depth = 1;
      let cursor = open + 1;
      while (depth > 0 && cursor < body.length) {
        if (body[cursor] === "{") depth += 1;
        else if (body[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      const inner = body.slice(open + 1, cursor - 1);
      if (prelude.startsWith("@keyframes")) {
        keyframes.set(prelude.replace("@keyframes", "").trim(), inner);
      } else if (prelude.startsWith("@")) {
        walk(inner, [...context, prelude]);
      } else {
        rules.push({ selector: prelude, body: inner, context });
      }
      index = cursor;
    }
  };
  walk(text, []);
  return { rules, keyframes };
}

const { rules, keyframes } = parseCss(css);

// Selector lists split at top-level commas only (not inside :is()).
function selectors(list) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < list.length; index += 1) {
    if (list[index] === "(") depth += 1;
    else if (list[index] === ")") depth -= 1;
    else if (list[index] === "," && depth === 0) {
      parts.push(list.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((part) => part.trim());
}

test("the root links the shutter sheet last among its own sheets", () => {
  assert.match(root, /import transitionCinemaCss from "\.\.\/styles-transition-cinema\.css\?url";/);
  assert.ok(
    root.indexOf("href: chromeElevationCss") < root.indexOf("href: transitionCinemaCss"),
    "after the chrome sheet, so the covers' old layers can be retired from outside",
  );
});

test("nothing in the shutter loops, and keyframes move only compositor properties", () => {
  assert.doesNotMatch(css, /infinite/);
  assert.ok(keyframes.size > 20);
  for (const [name, body] of keyframes) {
    const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]);
    for (const property of properties) {
      assert.ok(
        // clip-path: the docked file's clip to the portrait's box (dwc-carry-dock).
        ["opacity", "transform", "translate", "scale", "rotate", "clip-path"].includes(property),
        `${name} animates ${property}`,
      );
    }
  }
});

test("full motion is gated by reduced motion and economy rendering", () => {
  const calm = new Set(["dwc-calm-in", "dwc-fade-out"]);
  for (const rule of rules) {
    const names = [...rule.body.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)]
      .flatMap((match) => match[1].match(/dwc-[a-z-]+/g) ?? [])
      .filter((name) => keyframes.has(name));
    if (!names.length) continue;
    const gated =
      rule.context.includes("@media (prefers-reduced-motion: no-preference)") &&
      selectors(rule.selector).every((part) =>
        /html:not\(\[data-world-effects="economy"\]\)/.test(part),
      );
    const calmTier =
      names.every((name) => calm.has(name)) &&
      (rule.selector.includes('[data-world-effects="economy"]') ||
        rule.selector.includes("is-cine-calm") ||
        rule.context.includes("@media (prefers-reduced-motion: reduce)"));
    assert.ok(gated || calmTier, `${rule.selector}: ${names.join(", ")}`);
  }
});

test("economy and reduced motion get one opacity shutter and no travelling layers", () => {
  assert.match(
    css,
    /html\[data-world-effects="economy"\] body \.load-gate\.has-cine \*,[\s\S]*?\{\s*animation: none !important;/,
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?html body \.load-gate\.has-cine \*,[\s\S]*?animation: none !important;\s*transition: none !important;/,
  );
  assert.match(
    css,
    /:is\(\.cine-dive-tunnel, \.archive-dive-space, \.dwc-carry, \.dwc-lock\)[\s\S]*?display: none;/,
  );
});

test("the route covers never bloom: the white cores, exit light and loops are retired", () => {
  assert.match(
    css,
    /html body \.load-gate\.has-cine \.cine-dive-flash,\s*html body \.load-gate\.has-cine \.cine-dive-tunnel::after,\s*html body \.load-gate\.has-cine \.cine-dive-tunnel::before,\s*html body \.load-gate\.has-cine \.rider-dive-vector-field \{\s*display: none;/,
  );
  // The panels are flat ink; nothing in the shutter is drawn in white.
  assert.match(css, /\.dwc-shutter > i \{[^}]*background: #04080f;/);
  assert.doesNotMatch(css, /#fff\b|#ffffff|rgb\(255 255 255/i);
  // Only the route covers: the opening's own dive keeps its primitives.
  for (const rule of rules) {
    for (const part of selectors(rule.selector)) {
      assert.ok(
        /\.load-gate|\.route-signal|html\[data-(?:loading|route-cover)[\]=]/.test(part),
        part,
      );
    }
  }
});

test("the rider numeral reads at 64px or more and every label keeps its 12px floor", () => {
  assert.match(css, /\.rider-dive-mark \{[^}]*font-size: clamp\(64px, 8\.4vmin, 112px\);/);
  assert.match(css, /\.load-gate-mark \{[^}]*width: 104px;[^}]*font-size: 44px;/);
  const sizes = [...css.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1]);
  for (const size of sizes) {
    const px = [...size.matchAll(/(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
    assert.ok(
      px.every((value) => value >= 12),
      size,
    );
  }
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*?-webkit-text-stroke: 0;/);
});

test("the hand-over: rendered under the still cover, two frames, then data-loading goes", () => {
  assert.match(
    gate,
    /const settleUnderCover = \(\) => Promise\.race\(\[nextFrame\(\)\.then\(nextFrame\), wait\(120\)\]\);/,
  );
  // The router's location store changes when the load starts; onRendered
  // fires once the destination is in the document (review 2026-09-29).
  assert.match(gate, /router\.subscribe\("onRendered", \(event\) => \{/);
  assert.doesNotMatch(gate, /announceRouteCommit/);
  const branches = gate.match(
    /await navigateUnderCover\(router, \(\) => navigate\(\{ to: to as never, hash \}\), to\);\s*if \(!isCurrent\(\)\) return;\s*if \(focusDestination\) focusRouteDestination\(hash\);\s*await settleUnderCover\(\);\s*if \(!isCurrent\(\)\) return;\s*(?:const callOnly = diveVariant === "rexonance";\s*let landed = scene;[\s\S]*?if \(!callOnly\) \{\s*const rects = landingRects\(\);\s*landed = scene && \{[\s\S]*?\};\s*\}|const landed = [^\n]*landingRects\(\) \};)[\s\S]*?document\.documentElement\.removeAttribute\("data-loading"\);[\s\S]*?phase: "revealing",[\s\S]*?await revealRan\(\s*timings\.reveal/g,
  );
  assert.equal(branches?.length, 2, "rider dives/cut-ins and the sovereign gate");
  // Only Rexonance's typography has no portrait to dock. Every other rider
  // keeps the measured geometry and entrance lead, and both branches above
  // must still pass onRendered, two-frame settling and the reveal clock.
  assert.match(
    branches[0],
    /if \(!callOnly && landed && \(landed\.hold \|\| !dockGeometry\(landed\)\)\) await entranceLead\(\);/,
  );
  assert.match(branches[1], /await entranceLead\(\);/);
  assert.match(
    gate,
    /await revealRan\(\s*timings\.reveal,\s*callOnly\s*\? undefined\s*: \(\) => \{\s*if \(landed\) handOverDockedFile\(landed\);/,
  );
  // The reveal's clock starts on its first painted frame.
  assert.match(
    gate,
    /if \(document\.querySelector\("\.load-gate\.is-revealing"\)\) started = performance\.now\(\);/,
  );
  // シエル's ribbons stay the reference cut-in, untouched.
  assert.match(gate, /cutInVariant === "ciel"\s*\?\s*null/);
  assert.match(gate, /ciel: \{ cover: 560, reveal: 760 \}/);
});

test("the shutter closes onto the pressed card and lands on the portrait frame", () => {
  assert.match(gate, /document\.addEventListener\("pointerdown", notePress, true\);/);
  assert.match(
    gate,
    /\.closest\("\.rider-detail"\)\s*\?\.querySelector<HTMLImageElement>\("\.rider-visual img\.is-on"\)/,
  );
  assert.match(gate, /document\.querySelector\("main \.manager-portrait-frame"\)/);
  assert.match(gate, /Boolean\(lastPress\?\.target\.closest\("\.manager-pagination"\)\)/);
  for (const layer of ["dwc-shutter", "dwc-carry", "dwc-lock"]) {
    assert.match(gate, new RegExp(`className="${layer}" aria-hidden="true"`));
  }
  // Economy rendering takes the calm clock; reduced motion its short one.
  assert.match(
    gate,
    /document\.documentElement\.dataset\.worldEffects === "economy" \? "calm" : "full"/,
  );
  assert.match(gate, /const CALM_TIMINGS = \{ cover: 180, reveal: 240 \};/);
});

test("routes without a cover answer with the prism signal, never a scroll lock", () => {
  const direct = gate.slice(
    gate.search(
      /if \(\s*!isArchiveTransition &&\s*!isZeusTransition &&\s*!isGalleryTransition &&\s*!riderTransitionVariant\s*\) \{/,
    ),
    gate.indexOf("busy.current = true;", gate.indexOf("const go = useCallback")),
  );
  assert.match(direct, /setSignal\("running"\);\s*await nextFrame\(\);/);
  assert.doesNotMatch(direct, /dataset\.loading|data-route-cover/);
  assert.match(gate, /<span className=\{`route-signal is-\$\{state\}`\} aria-hidden="true" \/>/);
  assert.match(css, /\.route-signal \{[^}]*height: 2px;[^}]*pointer-events: none;/);
});

test("the covered page keeps its scrollbar gutter and the Zeus button waits for the entrance", () => {
  assert.match(css, /html\[data-loading\]\[data-route-cover\] \{\s*scrollbar-gutter: stable;/);
  assert.match(
    css,
    /html\[data-route-cover\] \.zeus-button:not\(\[data-navigating="true"\]\) \{\s*visibility: hidden;\s*opacity: 0;\s*pointer-events: none;/,
  );
  assert.match(
    gate,
    /if \(root\.dataset\.routeCover === "settling"\) delete root\.dataset\.routeCover;/,
  );
});
