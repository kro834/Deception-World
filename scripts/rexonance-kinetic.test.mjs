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
        (decl.prop === "transform" && /translate3d\(0, (0\.7em|118%)/.test(decl.value)) ||
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
  assert.match(script, /if \(!covered\(\) && !belowFold\(node\)\) return;/);
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
