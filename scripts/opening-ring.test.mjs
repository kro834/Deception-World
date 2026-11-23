import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  OPENING_DIVE,
  OPENING_RINGS,
  diveRingAt,
} from "../src/components/cinematic/opening-timing.ts";

// The opening in the ring language (2026-11-23): the approved glass ring
// layers assemble around the title, the ENTER row is prism pills, and the
// dive's copy of the rings rushes past the camera. These pins keep it calm
// (finite, gated, compositor-only), textless, and in step with the numbers
// the hand-off reads.

const read = async (path) =>
  (await readFile(new URL(`../${path}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const css = (await read("src/styles-opening-ring.css")).replace(/\/\*[\s\S]*?\*\//g, "");

test("the ring sheet is linked on the opening head before the pinned tail", async () => {
  const route = await read("src/routes/index.tsx");
  const links = route.slice(route.indexOf("links: ["), route.indexOf("],"));
  const order = [...links.matchAll(/href: (\w+)/g)].map((m) => m[1]);
  assert.ok(order.includes("openingRingCssUrl"));
  assert.ok(order.indexOf("openingRingCssUrl") < order.indexOf("openingFontsCssUrl"));
});

const pct = (value) => `${Number((value * 100).toFixed(2))}%`;

test("the stack sits where OPENING_RINGS says, with the approved pictures", () => {
  const stack = css.match(/\.cine-glass-rings \{([^}]*)\}/)[1];
  assert.match(stack, new RegExp(`left: ${pct(OPENING_RINGS.x)};`));
  assert.match(stack, new RegExp(`top: ${pct(OPENING_RINGS.y)};`));
  assert.match(stack, new RegExp(`width: ${pct(OPENING_RINGS.size)};`));
  assert.match(css, new RegExp(`width: ${pct(OPENING_RINGS.sizeNarrow)};`));
  for (const layer of OPENING_RINGS.layers) {
    assert.ok(css.includes(`/ring-glass-20261123/hero-${layer}.webp`), layer);
  }
});

test("finite, gated, compositor-only motion; no text", async () => {
  assert.doesNotMatch(css, /infinite/);
  assert.doesNotMatch(css, /content: "[^"]+"/);
  assert.doesNotMatch(css, /backdrop-filter|filter:/);
  for (const [, body] of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n\}/g)) {
    for (const [, property] of body.matchAll(/([a-z-]+)\s*:/g)) {
      assert.match(property, /^(opacity|scale|rotate|translate)$/, property);
    }
  }
  const gated = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"));
  const ungated = css.slice(0, css.indexOf("@media (prefers-reduced-motion: no-preference)"));
  // Outside the gate only the old HUD's endless turns are stopped.
  assert.doesNotMatch(ungated.replace(/animation: none;/g, ""), /\banimation:|\btransition:/);
  for (const [, selector] of gated.matchAll(/\n {2}(html[^{]+)\{\n {4}(?:animation|transition):/g)) {
    assert.match(selector, /^html:not\(\[data-world-effects="economy"\]\)/);
  }
  const title = await read("src/components/cinematic/title-sequence.tsx");
  const rings = title.slice(
    title.indexOf("const GlassRings = memo("),
    title.indexOf("function LogoLayer("),
  );
  assert.match(rings, /aria-hidden="true"/);
  const jsx = rings.slice(rings.indexOf("<div"), rings.lastIndexOf("</div>"));
  for (const [, between] of jsx.matchAll(/>([^<]*)</g)) {
    // Expressions (the layer map) open or close across tags; text never.
    const text = between
      .replace(/^[^{}]*\}/, "")
      .replace(/\{[\s\S]*$/, "")
      .replace(/[\s()]/g, "");
    assert.equal(text, "", "no text in the rings");
  }
});

test("the dive's rings are unseen at the title's frame and gone before the cut", () => {
  for (let layer = 0; layer < OPENING_RINGS.layers.length; layer += 1) {
    assert.equal(diveRingAt(0, layer).opacity, 0);
    assert.equal(diveRingAt(OPENING_DIVE.cut, layer).opacity, 0);
    assert.ok(diveRingAt(OPENING_DIVE.cut - 0.04, layer).opacity < 0.05, `layer ${layer}`);
    for (let T = 0; T <= OPENING_DIVE.glEnd; T += 1 / 60) {
      assert.ok(diveRingAt(T, layer).opacity <= 0.82 + 1e-9);
    }
  }
});
