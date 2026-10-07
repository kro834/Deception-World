import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  OPENING_BURN,
  burnUniformsAt,
  diveUniformsAt,
  OPENING_DIVE,
} from "../src/components/cinematic/opening-timing.ts";

// The opening cinema (2026-10-01): styles-opening-cinema.css, the last sheet
// on /, adds light and camera to the title sequence (the strike, the sliver
// arrival, the halo and the rays, the two anamorphic streaks, the lockup
// dolly, the frame plane settling, the rails, the plate lock, still grain at
// rest), and the two shaders gain a lens (the burn's refracted fringe, near
// embers and ash; the dive's anamorphic streaks and radial fringe). These
// pins keep that presentation safe: finite compositor-only motion gated
// twice, rest values on every still state, measured rects at scale(1), the
// burn and dive storyboards unchanged at their swap frames, no text, no
// loops, no :has(), forced colours written out.

const read = async (path) =>
  (await readFile(new URL(`../${path}`, import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const readCss = async (path) =>
  stripComments(await read(path))
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");

function rules(css) {
  const out = [];
  const walk = (text, context) => {
    let index = 0;
    while (index < text.length) {
      const open = text.indexOf("{", index);
      if (open === -1) break;
      const head = text.slice(index, open).replace(/\s+/g, " ").trim();
      let depth = 1;
      let close = open + 1;
      while (depth > 0 && close < text.length) {
        if (text[close] === "{") depth += 1;
        else if (text[close] === "}") depth -= 1;
        close += 1;
      }
      const body = text.slice(open + 1, close - 1);
      if (head.startsWith("@keyframes")) out.push({ keyframes: head.slice(11).trim(), body });
      else if (head.startsWith("@")) walk(body, [...context, head]);
      else out.push({ selector: head, body, context });
      index = close;
    }
  };
  walk(css, []);
  return out;
}

const COMPOSITOR =
  /^(opacity|transform|translate|scale|rotate|clip-path|visibility|animation-timing-function)$/;

test("the cinema sheet is the last sheet on /, after the elevation sheet", async () => {
  const route = await read("src/routes/index.tsx");
  assert.match(route, /import openingCinemaCssUrl from "\.\.\/styles-opening-cinema\.css\?url";/);
  const links = route.slice(route.indexOf("links: ["), route.indexOf("],"));
  const order = [...links.matchAll(/href: (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(-3), [
    "DOSSIER_HUD_FONTS_URL",
    "openingElevationCssUrl",
    "openingCinemaCssUrl",
  ]);
});

test("the cinema light is textless, hidden from assistive tech, and in the title's tree", async () => {
  const title = await read("src/components/cinematic/title-sequence.tsx");
  const light = title.slice(
    title.indexOf("const CinematicLight = memo("),
    title.indexOf("const CinematicEditorialFrame = memo("),
  );
  assert.ok(light.length > 0, "CinematicLight is defined");
  for (const plane of ["cine-cinema-back", "cine-cinema-front"]) {
    assert.match(light, new RegExp(`className="cine-cinema ${plane}" aria-hidden="true"`));
  }
  for (const name of [
    "cine-strike",
    "cine-halo",
    "cine-rays",
    "cine-streak-a",
    "cine-streak-b",
    "cine-rails",
  ]) {
    assert.ok(light.includes(name), name);
  }
  // No text node: every tag closes onto another tag or whitespace.
  assert.doesNotMatch(
    light.replace(/\{\/\*[\s\S]*?\*\/\}/g, ""),
    />\s*[^\s<{][^<{]*</,
    "no text in the light",
  );
  assert.match(title, /<CinematicEditorialFrame \/>\s*<CinematicLight \/>/);
  // The logo layers the burn and the dive read are unchanged in number.
  assert.equal(title.match(/<LogoLayer\s+logo=\{OPENING_LOGO_FIRST\}/g)?.length, 5);
  assert.equal(title.match(/<LogoLayer\s+logo=\{OPENING_LOGO_FINAL\}/g)?.length, 3);
});

test("the cinema sheet: finite compositor-only motion, gated twice, no text, no loops, no :has()", async () => {
  const css = await readCss("src/styles-opening-cinema.css");
  assert.doesNotMatch(css, /infinite/);
  assert.doesNotMatch(css, /font(-size)?:/);
  assert.doesNotMatch(css, /:has\(/);
  assert.doesNotMatch(css, /content: "[^"]+"/, "no generated text");
  const all = rules(css);
  const frames = Object.fromEntries(
    all.filter((rule) => rule.keyframes).map((rule) => [rule.keyframes, rule.body]),
  );
  for (const [name, body] of Object.entries(frames)) {
    for (const [, property] of body.matchAll(/([a-z-]+)\s*:/g)) {
      assert.match(property, COMPOSITOR, `${name} animates ${property}`);
    }
    const users = all.filter(
      (rule) =>
        rule.selector && new RegExp(`animation(?:-name)?:[^;]*\\b${name}\\b`).test(rule.body),
    );
    assert.ok(users.length > 0, `${name} is used`);
    for (const rule of users) {
      assert.ok(
        rule.context.some((query) => query.includes("prefers-reduced-motion: no-preference")),
        `${name}: reduced motion gate`,
      );
      assert.match(
        rule.selector,
        /^html:not\(\[data-world-effects="economy"\]\) /,
        `${name}: economy gate (${rule.selector})`,
      );
      assert.match(rule.selector, /\.cine-stage\.is-(playing|complete)/, `${name}: a phase`);
    }
  }
  // The elevation sheet never grew a :has() subject either.
  assert.doesNotMatch(await readCss("src/styles-opening-elevation.css"), /:has\(/);
});

test("rest values: every still state shows the boot's end frame", async () => {
  const css = await readCss("src/styles-opening-cinema.css");
  const all = rules(css);
  const frames = Object.fromEntries(
    all.filter((rule) => rule.keyframes).map((rule) => [rule.keyframes, rule.body]),
  );
  const rest = (selector) =>
    all.find((rule) => rule.selector === selector && rule.context.length === 0)?.body;
  // The halo and the rays end on the token their rest rule reads.
  assert.match(frames["op-halo-in"], /to \{\s*opacity: var\(--op-halo-rest\);/);
  assert.match(frames["op-rays-in"], /to \{\s*opacity: var\(--op-rays-rest\);/);
  assert.match(
    rest(".cine-stage:not(.is-playing) .cine-halo, .is-complete .cine-halo"),
    /opacity: var\(--op-halo-rest\);/,
  );
  assert.match(
    rest(".cine-stage:not(.is-playing) .cine-rays, .is-complete .cine-rays"),
    /opacity: var\(--op-rays-rest\);/,
  );
  assert.match(frames["op-rails-in"], /to \{\s*opacity: 0\.55;/);
  assert.match(
    rest(".cine-stage:not(.is-playing) .cine-rails, .is-complete .cine-rails"),
    /opacity: 0\.55;/,
  );
  // The strike and the streaks are gone at the end of their boot; their
  // only base opacity is 0 (.cine-cinema > i), so every still state hides them.
  for (const name of ["op-strike", "op-streak"]) {
    assert.match(frames[name], /100% \{\s*opacity: 0;/, name);
  }
  assert.match(rest(".cine-cinema > i"), /opacity: 0;/);
  // (The streaks' fringe pseudo-elements carry a relative opacity inside
  // the hidden parent.)
  assert.equal(
    all.filter(
      (rule) =>
        rule.selector &&
        !rule.selector.includes("::") &&
        /\.cine-(strike|streak)\b/.test(rule.selector) &&
        /opacity:/.test(rule.body),
    ).length,
    0,
  );
  // The measured rects: the lockup (burn host, logo box, the dive's logoRect)
  // and the frame plane are scale(1) at the end of their motion and on
  // every still state, where no rule transforms them.
  assert.match(frames["op-dolly"], /100% \{\s*transform: scale\(1\);\s*\}\s*$/);
  assert.match(frames["op-frame-settle"], /to \{\s*transform: scale\(1\);/);
  assert.match(
    frames["op-logo-arrive"],
    /100% \{\s*opacity: 1;\s*transform: translate3d\(0, 0, 0\) scale\(1\);\s*clip-path: inset\(0 0 0 0\);/,
  );
  for (const rule of all) {
    if (!rule.selector) continue;
    if (/\.cine-title-lockup|\.cine-editorial\b|\.cine-logo-wrap/.test(rule.selector)) {
      assert.match(
        rule.selector,
        /\.is-playing/,
        `${rule.selector} touches a measured box at rest`,
      );
      assert.doesNotMatch(
        rule.body,
        /\b(width|height|inset|top|left|right|bottom|margin|padding):/,
      );
    }
  }
});

test("the arrival keeps the clock: 0.34 s + 1.8 s, before the burn starts", async () => {
  const css = await readCss("src/styles-opening-cinema.css");
  const arrive = css.match(
    /\.cine-stage\.is-playing \.cine-logo-wrap \{\s*animation: op-logo-arrive ([\d.]+)s cubic-bezier\([^)]*\) ([\d.]+)s both;/,
  );
  assert.ok(arrive, "the arrival is declared");
  const [, duration, delay] = arrive.map(Number);
  assert.equal(delay, 0.34);
  assert.equal(duration, 1.8);
  assert.ok(delay + duration <= OPENING_BURN.start, "the ice logo has arrived before it burns");
  // The dolly runs on the sequence clock and is still until the burn starts.
  assert.match(css, /\.cine-title-lockup \{\s*animation: op-dolly var\(--seq\) linear both;/);
  const dolly = css.match(/@keyframes op-dolly \{\s*0%,\s*36% \{\s*transform: scale\(1\);/);
  assert.ok(dolly, "the dolly holds scale(1) until 36% (2.6 s of 7.2 s)");
  assert.ok(Math.abs(0.36 * 7.2 - OPENING_BURN.start) < 0.02);
  // The prism streak ends before the title completes.
  assert.match(css, /\.cine-streak-b \{\s*animation: op-streak 1s cubic-bezier\([^)]*\) 6s both;/);
});

test("still grain at rest; the plate locks on once; forced colours drop the ornament", async () => {
  const css = await readCss("src/styles-opening-cinema.css");
  assert.match(css, /\.cine-stage\.is-complete \.cine-grain \{\s*animation-play-state: paused;/);
  assert.match(
    css,
    /html:not\(\[data-world-effects="economy"\]\) \.cine-stage\.is-complete \.cine-btn-primary::before \{\s*animation: op-plate-lock 0\.7s/,
  );
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.cine-cinema \{\s*display: none;/);
  // The echo layers return only on a wide screen with a mouse, never on the
  // title's own economy opening.
  const echo = rules(css).find((rule) => rule.selector?.includes(".cine-logo-echo"));
  assert.ok(echo, "echo rule");
  assert.match(echo.selector, /\.cine-stage\.is-playing:not\(\.is-economy-opening\)/);
  assert.ok(
    echo.context.some((query) => /min-width: 1024px/.test(query) && /pointer: fine/.test(query)),
  );
});

test("the shaders' lens is silent at the swap frames", async () => {
  const burn = await read("src/components/cinematic/opening-burn.frag.glsl");
  // The fringe, the ash and the near embers scale with heat and flame, so
  // frame 0 is the ice logo and the hand-off frame is the prism logo.
  assert.match(burn, /float fringeA = fall\(0\.09, 0\.0, d\) \* uHeat \* \(1\.0 - uCool\) \* env;/);
  assert.match(burn, /float flakes = ashLayer\(lp, t, 4\.0\)[^;]*\* uFlame \* env;/);
  assert.match(burn, /float bokeh = bokehLayer\(lp, t, 4\.5, 0\.26, 11\.0\) \* sparkZone;/);
  assert.match(burn, /float sparkZone = [^;]*clamp\(uFlame \* 1\.4, 0\.0, 1\.0\)/);
  const start = burnUniformsAt(0);
  const swap = burnUniformsAt(OPENING_BURN.handOff[0]);
  assert.equal(start.uHeat, 0);
  assert.equal(start.uFlame, 0);
  assert.ok(swap.uFlame < 0.01 && swap.uCool > 0.99);

  const dive = await read("src/components/cinematic/opening-dive.frag.glsl");
  const lens = dive.slice(dive.indexOf("// ---- The lens"), dive.indexOf("// ---- Grade"));
  assert.match(lens, /if \(uWorld < 0\.5 && uDive > 0\.001\) \{/);
  assert.match(
    lens,
    /float ana = smoothstep\(0\.02, 0\.22, uDive\) \* \(1\.0 - smoothstep\(0\.5, 0\.85, uDive\)\);/,
  );
  assert.match(lens, /float fringe = 0\.007 \* smoothstep\(0\.1, 0\.9, uDive\);/);
  // Frame 0 is the title's own framing; the landing frame is the world.
  assert.equal(diveUniformsAt(0).uDive, 0);
  assert.equal(diveUniformsAt(OPENING_DIVE.glEnd).uWorld, 1);
});
