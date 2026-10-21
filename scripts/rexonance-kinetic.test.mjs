import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sheet = postcss.parse(read("src/styles-rexonance-motion-20261021.css"));
const script = read("src/lib/rexonance-choreography.js");

test("the kinetic sheet is the last of the page's sheets and the hook mounts once", () => {
  const route = read("src/routes/rexonance-saga.tsx");
  const links = route.slice(route.indexOf("links: ["));
  const kinetic = links.indexOf("rexonanceKineticCssUrl");
  assert.ok(kinetic > links.indexOf("p14CalibrationCssUrl"));
  assert.ok(kinetic < links.indexOf("CINEMATIC_STYLESHEET_LINK"));
  assert.ok(kinetic > links.lastIndexOf('rel: "stylesheet"', links.indexOf("CINEMATIC_STYLESHEET_LINK")) - 80);
  const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
  assert.match(page, /import \{ mountRexonanceChoreography \} from "@\/lib\/rexonance-choreography\.js"/);
  assert.equal(page.match(/mountRexonanceChoreography\(/g).length, 1);
  assert.match(page, /lower \? mountRexonanceChoreography\(pageRef\.current\) : undefined/);
});

test("nothing rests hidden without the script: hidden states sit behind the armed attribute", () => {
  const hiders = [];
  sheet.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && rule.parent.name === "keyframes") return;
    rule.walkDecls((decl) => {
      const hides =
        (decl.prop === "opacity" && decl.value === "0") ||
        (decl.prop === "transform" && /translate3d\(0, (0\.7em|118%|26px)/.test(decl.value)) ||
        (decl.prop === "translate" && /26px/.test(decl.value));
      if (hides) hiders.push(rule.selector);
    });
  });
  assert.ok(hiders.length >= 4, "the armed states exist");
  for (const selector of hiders) {
    assert.ok(
      /\[data-rxk="armed"\]/.test(selector) ||
        /\.rxk-rail/.test(selector) ||
        /\[data-side-menu-open\]/.test(selector),
      `hidden only when armed (or the decorative rail): ${selector}`,
    );
    if (/\[data-rxk="armed"\]/.test(selector)) {
      assert.match(selector, /\[data-motion-ready="true"\]/);
      assert.match(selector, /:not\(\[data-world-effects="economy"\]\)/);
    }
  }
  // Every armed rule is inside the reduced-motion gate.
  sheet.walkRules(/\[data-rxk="armed"\]/, (rule) => {
    let node = rule.parent;
    let gated = false;
    while (node) {
      if (node.type === "atrule" && /prefers-reduced-motion: no-preference/.test(node.params)) gated = true;
      node = node.parent;
    }
    assert.ok(gated, rule.selector);
  });
});

test("keyframes and transitions are compositor-only, finite and short", () => {
  const allowed = new Set(["opacity", "transform", "translate", "scale", "rotate"]);
  sheet.walkAtRules("keyframes", (keyframes) => {
    keyframes.walkDecls((decl) => assert.ok(allowed.has(decl.prop), `${keyframes.params}: ${decl.prop}`));
  });
  sheet.walkDecls(/^animation$/, (decl) => {
    assert.doesNotMatch(decl.value, /infinite|alternate/, decl.value);
    const duration = decl.value.match(/(\d+)ms/);
    if (duration) assert.ok(Number(duration[1]) <= 900, decl.value);
  });
  sheet.walkDecls(/^animation-timeline$/, (decl) => {
    let node = decl.parent;
    let supported = false;
    while (node) {
      if (node.type === "atrule" && node.name === "supports") supported = true;
      node = node.parent;
    }
    assert.ok(supported, "scroll-driven motion is feature-detected");
  });
  sheet.walkDecls(/^(transition|transition-property)$/, (decl) => {
    assert.doesNotMatch(decl.value, /\b(width|height|margin|padding|top|left|right|bottom|clip-path)\b/, decl.value);
  });
  sheet.walkDecls(/^overflow(-[xy])?$/, (decl) => {
    assert.notEqual(decl.value, "auto");
    assert.notEqual(decl.value, "scroll");
  });
});

test("the script arms only what is unseen, follows the calm tiers and never scrolls the page", () => {
  assert.match(script, /prefers-reduced-motion: reduce/);
  assert.match(script, /worldEffects === "economy"/);
  assert.match(script, /saveData === true/);
  assert.match(script, /if \(!covered\(\) && !belowFold\(node\)\) return false;/);
  assert.match(script, /attributeFilter: \["data-loading"\]/);
  assert.match(script, /visibilitychange/);
  assert.doesNotMatch(script, /addEventListener\("scroll"/);
  assert.doesNotMatch(script, /scrollTo|scrollIntoView|scrollBy/);
  assert.doesNotMatch(script, /iterations|Infinity/);
  for (const duration of script.matchAll(/duration: (\d+)/g)) assert.ok(Number(duration[1]) <= 900);
  // The lettered call keeps its words whole for assistive technology.
  assert.match(script, /sr\.className = "rxk-sr";\n\s+sr\.textContent = node\.textContent;/);
  assert.match(script, /word\.setAttribute\("aria-hidden", "true"\)/);
});

test("a split title drifts in place of the scroll's cut-in, under the same gates and one step more specific", () => {
  let drift = null;
  sheet.walkDecls("animation-name", (decl) => {
    if (decl.value === "rxk-drift") drift = decl.parent;
  });
  assert.ok(drift, "the drift rule exists");
  for (const gate of [
    ':not([data-world-effects="economy"])',
    ":not([data-side-menu-open])",
    ":not([data-dialog-open])",
    ":not([data-route-covered])",
    '[data-motion-ready="true"]',
  ]) {
    assert.ok(drift.selector.includes(gate), gate);
  }
  assert.match(drift.selector, /> \.rxs-section\s+> \.rxs-section-heading\s+> h2\[data-rxk-split\]/);
  assert.match(drift.selector, /> \.rxs-footer\s+> div\s+> h2\[data-rxk-split\]/);
  let node = drift.parent;
  const gates = [];
  while (node) {
    if (node.type === "atrule") gates.push(`${node.name} ${node.params}`);
    node = node.parent;
  }
  assert.ok(gates.some((gate) => /^supports .*animation-timeline: view\(\)/.test(gate)));
  assert.ok(gates.some((gate) => /prefers-reduced-motion: no-preference/.test(gate)));
  // RESONANCE's cut-in is the rule it must outrank.
  const resonance = read("src/styles-rexonance-resonance.css");
  assert.match(resonance, /> \.rxs-section\s+> \.rxs-section-heading\s+> h2 \{\s+transform-origin: 0 70%;\s+animation-name: rsn-cut-in;/);
});

test("lettered calls wrap only where their words did and keep a text-clipped paint in flight", () => {
  // Their own elements (no page rule for a span or an i reaches them), text-only
  // calls only, and a measured fall-back: by word, then left whole.
  for (const tag of ["rxk-sr", "rxk-word", "rxk-run", "rxk-ch", "rxk-line", "rxk-line-in"]) {
    assert.match(script, new RegExp(`createElement\\("${tag}"\\)`), tag);
  }
  assert.doesNotMatch(script, /createElement\("(span|i)"\)/);
  assert.match(script, /\.filter\(textOnly\)/);
  assert.match(script, /call\.boxes = letterise\(call\.node, "words"\)/);
  assert.match(script, /unlineise\(title\.node\)/);
  assert.match(script, /run\.className = "rxk-run"/);
  assert.match(script, /if \(char === "-"\) close\(\);/);
  let nowrap = false;
  let carried = false;
  sheet.walkRules((rule) => {
    if (/\.rxk-run$/.test(rule.selector)) {
      rule.walkDecls("white-space", (decl) => {
        nowrap ||= decl.value === "nowrap";
      });
    }
    if (/\[data-rxk-paint="text"\] :is\(\.rxk-word, \.rxk-run, \.rxk-ch\)/.test(rule.selector)) {
      rule.walkDecls("background", (decl) => {
        carried ||= decl.value === "inherit";
      });
    }
  });
  assert.ok(nowrap, "a word's letters are one unbreakable run");
  assert.ok(carried, "a text-clipped paint is carried down to the letters");
  assert.match(script, /style\.backgroundClip === "text" \|\| style\.webkitBackgroundClip === "text"/);
});

test("the end card's links land in its last line's run, and nothing time-based holds its end frame", () => {
  assert.match(script, /run\(title, \[\.\.\.lineRun\(lines\), \.\.\.linkRun\(520\)\]\)/);
  assert.match(script, /companions\.set\(title, \[footer\]\)/);
  // A held end frame would pin translate or scale after the run (the hover
  // lifts and the scroll's own steps need them back).
  sheet.walkDecls(/^animation(-fill-mode)?$/, (decl) => {
    if (!/\bboth\b/.test(decl.value)) return;
    let timeline = false;
    decl.parent.walkDecls("animation-timeline", () => {
      timeline = true;
    });
    assert.ok(timeline, `a time-based run fills backwards only: ${decl.parent.selector}`);
  });
});

test("the reading rail's ticks stand where the chapters fall, measured off the frame loop", () => {
  assert.match(script, /tick\.style\.setProperty\("--rxk-at"/);
  assert.match(script, /new environment\.ResizeObserver\(placeSoon\)/);
  assert.doesNotMatch(script, /requestAnimationFrame/);
  let placed = false;
  sheet.walkDecls("top", (decl) => {
    placed ||= decl.value === "var(--rxk-at)" && /\.rxk-rail-tick$/.test(decl.parent.selector);
  });
  assert.ok(placed);
});
