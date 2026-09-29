import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* The special sites' second pass (styles-showcase-cinema.css on Rexonance
   and Extreme, styles-final-stage-cinema.css on Final Stage): the hero's
   arrival keyed to the load gate's hand-over, the stage and the chapter
   numerals, and the entry plates into the character files. These pins keep
   it safe: where it loads, what it may select, how its motion is gated,
   what its keyframes touch, the 12px floor and forced colours. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const SHEETS = {
  showcase: "src/styles-showcase-cinema.css",
  finalStage: "src/styles-final-stage-cinema.css",
};

// Style rules with their at-rule context, and keyframe blocks by name.
function parse(source) {
  const css = strip(source);
  const flat = (text) =>
    text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  const rules = [];
  const keyframes = [];
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
        keyframes.push({ name: frames[1], body: css.slice(index + 1, end - 1) });
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = css.indexOf("}", index);
      rules.push({ selector: head, body: css.slice(index + 1, end), context: [...stack] });
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

const splitTopLevel = (value) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of value) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()].filter(Boolean);
};

const declarations = (body, property) =>
  [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map((match) =>
    match[1].trim(),
  );

const timed = (body) =>
  declarations(body, "animation-timeline").some((value) => !/^(?:auto|none)$/.test(value));

const GATE_RULE =
  /^html body \.load-gate\.has-cine\.is-cine-full\.rider-route-dive(?::is\([^)]*\)|\.is-final-stage-dive)\.is-revealing$/;

test("the cinema sheets load on their own routes, after the elevation and before motion", async () => {
  for (const route of ["rexonance-saga", "extreme-saga"]) {
    const source = await read(`src/routes/${route}.tsx`);
    assert.match(source, /styles-showcase-cinema\.css\?url/, route);
    assert.doesNotMatch(source, /styles-final-stage-cinema/, route);
    const links = source.slice(source.search(/links:\s*\[/));
    const elevation = links.indexOf("href: showcaseElevationCssUrl");
    const cinema = links.indexOf("href: showcaseCinemaCssUrl");
    const motion = links.indexOf("href: motionEditionCssUrl");
    const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
    assert.ok(elevation > 0 && elevation < cinema && cinema < motion && motion < cinematic, route);
  }
  const finalStage = await read("src/routes/final-stage.tsx");
  assert.match(finalStage, /styles-final-stage-cinema\.css\?url/);
  assert.doesNotMatch(finalStage, /styles-showcase-cinema/);
  const links = finalStage.slice(finalStage.search(/links:\s*\[/));
  const elevation = links.indexOf("href: finalStageElevationCssUrl");
  const cinema = links.indexOf("href: finalStageCinemaCssUrl");
  const motion = links.indexOf("href: motionEditionCssUrl");
  assert.ok(elevation > 0 && elevation < cinema && cinema < motion);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /showcase-cinema|final-stage-cinema/, path);
  }
});

test("every rule is scoped to its page, but for one hand-over rule on its own dives", async () => {
  for (const [name, path] of Object.entries(SHEETS)) {
    const { rules } = parse(await read(path));
    assert.ok(rules.length > 20, path);
    const page = name === "showcase" ? "\\.rxs-page\\.rxs-page" : "\\.fst-page\\.fst-page";
    const scoped = new RegExp(`^(?:html(?::not\\(\\[[^\\]]+\\]\\))*(?:\\[[^\\]]+\\])* )?${page}`);
    let gateRules = 0;
    for (const { selector, body } of rules) {
      for (const part of splitTopLevel(selector)) {
        if (part.startsWith("html body .load-gate")) {
          gateRules += 1;
          assert.match(part, GATE_RULE, part);
          // Only the reveal of the page's own dives; the covering phase, the
          // calm tier and every other dive (Dream's included) keep their ground.
          const variants = [...part.matchAll(/\.is-([\w-]+)-dive/g)].map((match) => match[1]);
          assert.deepEqual(
            variants.sort(),
            name === "showcase" ? ["extreme", "rexonance"] : ["final-stage"],
            part,
          );
          assert.equal(body.trim().replace(/;$/, ""), "background: transparent", part);
        } else {
          assert.match(part, scoped, part);
        }
      }
    }
    assert.equal(gateRules, 1, path);
  }
});

test("the arrival waits for the hand-over, stands down for reduced motion and economy, and ends", async () => {
  for (const path of Object.values(SHEETS)) {
    const source = await read(path);
    const css = strip(source);
    const { rules } = parse(source);
    assert.doesNotMatch(css, /\binfinite\b|animation-iteration-count/, path);
    // The first beat starts at the hand-over: no hold (the tokens are 0ms).
    assert.match(css, /--(?:sx|fsc)-delay: 0ms;/, path);
    let arrivals = 0;
    for (const { selector, body, context } of rules) {
      const animations = declarations(body, "animation").filter((value) => value !== "none");
      if (!animations.length && !declarations(body, "animation-name").length) continue;
      assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
      for (const part of splitTopLevel(selector)) {
        assert.match(part, /^html:not\(\[data-world-effects="economy"\]\)/, part);
      }
      if (timed(body)) continue;
      // Time-based: keyed to the load gate's hand-over (a record's lock-on
      // is the one beat that plays when a dialog opens, long after it).
      for (const part of splitTopLevel(selector)) {
        if (!part.includes(".fst-pickup-dialog[open]")) {
          assert.match(part, /:not\(\[data-loading\]\)/, part);
        }
      }
      for (const value of animations) {
        const times = [...value.matchAll(/(\d+)ms/g)].map((match) => Number(match[1]));
        assert.ok(times.length >= 1, `${selector}: ${value}`);
        // duration + the offset after the (0ms) hold: every beat at rest by 2s.
        const [duration, ...offsets] = times;
        assert.ok(duration <= 1500, `${selector}: ${value}`);
        assert.ok(duration + Math.max(0, ...offsets) <= 2000, `${selector}: ${value}`);
        arrivals += 1;
      }
    }
    assert.ok(arrivals >= 10, path);
  }
});

test("scroll-linked motion rides named timelines behind the full gate", async () => {
  for (const path of Object.values(SHEETS)) {
    const { rules } = parse(await read(path));
    for (const { selector, body, context } of rules) {
      if (!timed(body)) continue;
      assert.ok(
        context.some((at) => at.startsWith("@supports (animation-timeline: view())")),
        selector,
      );
      assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
      const timelines = splitTopLevel(declarations(body, "animation-timeline").at(-1));
      const recede = declarations(body, "animation").some((value) => /\bmx-recede\b/.test(value));
      for (const part of splitTopLevel(selector)) {
        assert.match(part, /\[data-motion-ready="true"\]/, part);
        if (recede) {
          // The arrival joins ahead of the motion sheet's own recede, which
          // keeps that sheet's gate (and its own view() on the page).
          assert.match(part, /:not\(\[data-loading\]\)/, part);
          assert.deepEqual(timelines, ["auto", "view(block)"], selector);
        } else {
          assert.match(
            part,
            /^html:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\)/,
            part,
          );
          for (const timeline of timelines) assert.match(timeline, /^--[\w-]+$/, selector);
          // Longhands, so a minifier cannot write a zero duration into the range.
          assert.deepEqual(declarations(body, "animation-duration"), ["auto"], selector);
        }
      }
    }
  }
});

test("the orbit rings shown again as the stage never spin: the base loop stops there", async () => {
  // styles-rexonance-saga.css spins .rxs-orbit forever (rxsOrbit); the rings
  // were only safe while hidden. Economy and reduced motion get no arrival,
  // so the static rule itself must stop it.
  for (const path of Object.values(SHEETS)) {
    const { rules } = parse(await read(path));
    const shown = rules.filter(
      ({ selector, body, context }) =>
        !context.length && /> \.rxs-orbit$/.test(selector) && /display:\s*block/.test(body),
    );
    assert.equal(shown.length, 1, path);
    assert.match(shown[0].body, /animation:\s*none/, path);
  }
});

test("keyframes move only opacity, transforms and clip-path, and never strobe", async () => {
  for (const path of Object.values(SHEETS)) {
    const { keyframes } = parse(await read(path));
    assert.ok(keyframes.length >= 8, path);
    for (const { name, body } of keyframes) {
      const properties = new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]));
      for (const property of properties) {
        assert.ok(
          ["opacity", "transform", "translate", "scale", "rotate", "clip-path"].includes(property),
          `${name}: ${property}`,
        );
      }
      // At most one rise and one fall of opacity per run (one flash pair).
      const opacities = [...body.matchAll(/opacity:\s*([\d.]+)/g)].map((match) => Number(match[1]));
      let turns = 0;
      for (let index = 2; index < opacities.length; index += 1) {
        const before = Math.sign(opacities[index - 1] - opacities[index - 2]);
        const after = Math.sign(opacities[index] - opacities[index - 1]);
        if (before && after && before !== after) turns += 1;
      }
      assert.ok(turns <= 1, `${name}: ${opacities.join(" → ")}`);
    }
  }
});

test("12px floor, no !important, silent numerals and a forced-colours path", async () => {
  for (const path of Object.values(SHEETS)) {
    const css = strip(await read(path));
    assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px\b/, path);
    assert.doesNotMatch(css, /!important/, path);
    // Generated text: chapter numerals only, each with an empty alt.
    for (const [, value] of css.matchAll(/content:\s*([^;]+);/g)) {
      assert.match(value.trim(), /^(?:""|none|"0[1-9]"(?: \/ "")?)$/, `${path}: ${value}`);
    }
    for (const [, numeral] of css.matchAll(/content:\s*"(0[1-9])";/g)) {
      assert.ok(css.includes(`content: "${numeral}" / "";`), `${path}: ${numeral} is silent`);
    }
    const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
    assert.ok(forced.length > 20, path);
    assert.match(forced, /\.rxs-orbit \{\s*display: none;/, path);
    assert.match(forced, /ButtonText/, path);
    assert.match(forced, /ButtonFace/, path);
  }
  const showcase = strip(await read(SHEETS.showcase));
  // The outlined numerals and the ghosted headline read as plain ink.
  assert.match(
    showcase.slice(showcase.indexOf("@media (forced-colors: active)")),
    /\.rxs-section-heading::before \{\s*color: CanvasText;\s*-webkit-text-stroke: 0;\s*text-shadow: none;/,
  );
  assert.match(
    showcase,
    /html\[data-world-effects="economy"\] \.rxs-page\.rxs-page \.rxs-hero h1 \{\s*filter: none;/,
  );
  // Doors keep the 48px plate (9px + the 28px cell + 9px + the border).
  assert.match(showcase, /\.rxs-footer > a:not\(\.rxs-footer-return\) \{\s*padding-block: 9px;/);
  assert.match(showcase, /width: 28px;\s*height: 28px;/);
});

test("the showcase hero clips instead of scrolling, so the motion sheet's hand-over follows the page", async () => {
  const css = strip(await read(SHEETS.showcase));
  assert.match(css, /\.rxs-page\.rxs-page \.rxs-hero \{\s*overflow: clip;\s*\}/);
});

test("Rexonance no longer resolves its hero on mount and lets the arrival through before hydration", async () => {
  const css = strip(await read("src/styles-rexonance-motion.css"));
  assert.doesNotMatch(css, /\.rxs-hero-copy > \*\s*\{[^}]*animation/);
  assert.doesNotMatch(css, /\.rxs-resonance-field i\s*\{[^}]*animation/);
  assert.match(
    css,
    /\.rxs-page\[data-motion-ready="false"\] :not\(\.rxs-hero, \.rxs-hero \*\),[\s\S]*?\{\s*animation: none !important;/,
  );
});

test("Final Stage's boot is part of its arrival", async () => {
  const elevation = strip(await read("src/styles-final-stage-elevation.css"));
  assert.doesNotMatch(elevation, /fst-title-wipe|fst-draw-y/);
  const cinema = strip(await read(SHEETS.finalStage));
  // Struck with a backwards fill only, so the title's ghost is never clipped at rest.
  assert.match(cinema, /\.fst-hero h1 \{\s*animation: fsc-strike [^;]* backwards;/);
});
