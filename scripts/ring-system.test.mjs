// The ring system (owner, 2026-11-22: 円環型の構成と弾んだアニメーション;
// 「展開時は弾む様なアニメーションにして」). Guards the contract every ring
// sheet shares, so the phase-2 page sheets (src/styles-ring-*.css) inherit it:
// springs are the helper's own curves, motion is gated, nothing loops, only
// compositor properties move, and the suit-up engines are never selected.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  RING_LINK_HANG,
  RING_LINK_STEP_MS,
  RING_SPRINGS,
  ringSpringLinear,
  ringSpringPosition,
  ringSpringStep,
} from "../src/lib/ring-motion.js";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const foundation = read("src/styles-ring.css");
const helper = read("src/lib/ring-motion.js");
const root = read("src/routes/__root.tsx");
const sheets = readdirSync(new URL("../src/", import.meta.url))
  .filter((name) => /^styles-ring(?:-[a-z0-9-]+)?\.css$/.test(name))
  .map((name) => `src/${name}`);

const blocksOf = (css, pattern) =>
  [...css.matchAll(pattern)].map((match) => {
    let depth = 1;
    let index = match.index + match[0].length;
    while (depth && index < css.length) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    return [match.index, index];
  });
const inside = (ranges, at) => ranges.some(([a, b]) => at >= a && at < b);
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));

test("the sheet's spring curves are the helper's presets, sampled", () => {
  const names = { soft: "soft", spring: "", bounce: "bounce", elastic: "elastic", snap: "snap" };
  for (const [preset, suffix] of Object.entries(names)) {
    const { css, ms } = ringSpringLinear(RING_SPRINGS[preset]);
    const token = suffix ? `--ring-spring-${suffix}` : "--ring-spring";
    assert.ok(foundation.includes(`${token}: ${css};`), token);
    const dur = suffix ? `--ring-dur-${suffix}` : "--ring-dur-spring";
    assert.ok(foundation.includes(`${dur}: ${ms}ms;`), dur);
  }
  // Every curve has a cubic fallback for engines without linear().
  assert.match(foundation, /@supports \(transition-timing-function: linear\(0, 1\)\)/);
  assert.equal((foundation.match(/--ring-spring[a-z-]*: cubic-bezier\(/g) ?? []).length, 5);
});

test("the presets overshoot as documented and the expansion spring bounces", () => {
  const peak = (spring) => {
    let max = 0;
    for (let t = 0; t < 2; t += 1 / 240) max = Math.max(max, ringSpringPosition(spring, t));
    return max - 1;
  };
  assert.ok(peak(RING_SPRINGS.soft) < 0.02);
  assert.ok(peak(RING_SPRINGS.spring) > 0.05 && peak(RING_SPRINGS.spring) < 0.12);
  assert.ok(peak(RING_SPRINGS.bounce) > 0.16 && peak(RING_SPRINGS.bounce) < 0.26);
  assert.ok(peak(RING_SPRINGS.elastic) > 0.3 && peak(RING_SPRINGS.elastic) < 0.4);
  assert.ok(peak(RING_SPRINGS.snap) < 0.01);
  // The integrator settles on its target and survives a dropped frame.
  const state = { x: 0, v: 0 };
  for (let i = 0; i < 240; i += 1) ringSpringStep(state, 1, RING_SPRINGS.bounce, i === 5 ? 0.4 : 1 / 60);
  assert.ok(Math.abs(state.x - 1) < 0.01, String(state.x));
});

test("the root links the ring sheets and mounts the helper", () => {
  assert.match(root, /import \{ watchRingMotion \} from "@\/lib\/ring-motion\.js";/);
  assert.match(root, /useEffect\(\(\) => watchRingMotion\(\), \[\]\);/);
  assert.match(
    root,
    /\{ rel: "stylesheet", href: fxMotionCss \},\s*(?:\/\/[^\n]*\n\s*)*\{ rel: "stylesheet", href: ringCss \},\s*\{ rel: "stylesheet", href: ringChromeCss \},/,
  );
  const bundle = read("src/styles-opening-interface.css");
  assert.match(bundle, /styles-fx-motion\.css";\n@import "\.\/styles-ring\.css";\n@import "\.\/styles-ring-chrome\.css";/);
});

test("every ring sheet gates its motion on reduced motion and economy, and never loops", () => {
  assert.ok(sheets.length >= 4, sheets.join());
  for (const file of sheets) {
    const css = strip(read(file));
    const noPref = blocksOf(css, /@media[^{]*prefers-reduced-motion: no-preference[^{]*\{/g);
    const keyframes = blocksOf(css, /@keyframes [^{]+\{/g);
    for (const line of css.matchAll(/^\s*(?:animation|transition)(?:-[a-z-]+)?:/gm)) {
      if (inside(keyframes, line.index)) continue;
      assert.ok(inside(noPref, line.index), `${file}: ${css.slice(line.index, line.index + 70).trim()}`);
    }
    // Leaf rules only ([^{}] on both sides), so the scan stays linear.
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(?:^|[\s;])(?:animation|transition)(?:-[a-z-]+)?:/.test(rule[2])) continue;
      if (/^\s*(?:from|to|\d+%)/.test(rule[1])) continue;
      assert.match(rule[1], /data-world-effects="economy"/, `${file}: ${rule[1].trim()}`);
    }
    // 2026-11-23: the one loop is the glass rings' slow turn (owner-approved
    // pre-rendered rings). It may only be declared on .ring-glass layers whose
    // pictures are in (data-ring-seen); see the glass test below for its gates.
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*\binfinite\b[^{}]*)\}/g)) {
      assert.match(rule[1], /\.ring-glass\[data-ring-seen\]/, `${file}: ${rule[1].trim()}`);
      assert.match(rule[2], /ring-glass-spin/, file);
    }
  }
});

test("ring keyframes move compositor properties only, and no sheet blurs", () => {
  const allowed = new Set(["opacity", "scale", "translate", "rotate"]);
  for (const file of sheets) {
    const css = strip(read(file));
    for (const [a, b] of blocksOf(css, /@keyframes [^{]+\{/g)) {
      for (const prop of css.slice(a, b).matchAll(/^\s*([a-z-]+):/gm)) {
        assert.ok(allowed.has(prop[1]), `${file}: keyframe animates ${prop[1]}`);
      }
    }
    assert.doesNotMatch(css, /backdrop-filter|filter:\s*blur/, file);
    // No flash: nothing here animates brightness or paints a white field.
    assert.doesNotMatch(css, /brightness\(|invert\(/, file);
  }
});

test("the glass rings turn only on screen in a visible tab, all four layers on every device", () => {
  const css = strip(foundation);
  // Declared paused; running only while live and the tab is visible.
  assert.match(
    css,
    /\.ring-glass\[data-ring-seen\] > i \{[^}]*animation-play-state: paused, running;/,
  );
  assert.match(
    css,
    /:not\(\[data-ring-hidden\]\)\s+\.ring-glass\[data-ring-seen\]\[data-ring-live\]\s+> i \{\s*animation-play-state: running, running;/,
  );
  // 2026-11-23 (owner: 「高品質モードで、スマホでもPC版と同クオリティ」): the old
  // phone cap (layers 2 and 3 still on a narrow or coarse-pointer device) is
  // gone. No ring sheet reduces an effect by device: a width, pointer or
  // hover query may change layout and hover only, never an animation's name.
  // (The side menu's rules in the chrome sheet belong to the side-menu owner.)
  for (const file of sheets) {
    const sheet = strip(read(file));
    for (const [a, b] of blocksOf(sheet, /@media[^{]*(?:max-width|pointer: coarse)[^{]*\{/g)) {
      assert.doesNotMatch(sheet.slice(a, b), /animation(?:-name)?:\s*none/, file);
    }
  }
  // The pictures are requested only once the stack is near the viewport.
  for (const layer of ["hero-outer", "hero-mid", "hero-inner", "hero-holo"]) {
    assert.match(
      foundation,
      new RegExp(`\\.ring-glass-hero\\[data-ring-seen\\] > i:nth-child\\(\\d\\) \\{\\s*background-image: url\\("/ring-glass-20261123/${layer}\\.webp"\\);`),
      layer,
    );
  }
  // Pictures only: no blend, no filter on them.
  assert.doesNotMatch(css, /mix-blend-mode|(?:^|[\s;])filter:/m);
  // The helper marks seen/live, flags a hidden tab and fetches the cover on idle.
  assert.match(helper, /setAttribute\("data-ring-seen", ""\)/);
  assert.match(helper, /toggleAttribute\("data-ring-live", entry\.isIntersecting\)/);
  assert.match(helper, /toggleAttribute\("data-ring-hidden", doc\.visibilityState === "hidden"\)/);
  assert.match(helper, /requestIdleCallback\(fetchCover/);
  assert.match(helper, /if \(!bounces\(\) \|\| saver\?\.saveData\) return;/);
  // Every picture the sheets name exists, and the generator is kept beside them.
  for (const file of sheets) {
    for (const url of read(file).matchAll(/url\("(\/ring-glass-20261123\/[a-z-]+\.webp)"\)/g)) {
      assert.ok(existsSync(new URL(`../public${url[1]}`, import.meta.url)), url[1]);
    }
  }
  assert.ok(existsSync(new URL("../scripts/blender/ring_glass.py", import.meta.url)));
});

test("the suit-up engines and their covers are never selected", () => {
  for (const file of sheets) {
    const css = strip(read(file));
    // The special sites' page chrome may wear the ring, whatever its class
    // prefix; the suit-up, entry and call staging and their canvases may not
    // be selected at all (their look, timings and end frames are pinned).
    assert.doesNotMatch(
      css,
      /\.[a-z0-9]+-[a-z0-9-]*(?:suitup|suit-up|henshin|assembly|entry|ignition|nanite|wire|burst|reactor|vortex|swarm|flame|engine|canvas|call)(?![a-z])/,
      file,
    );
    assert.doesNotMatch(css, /(?:^|[\s>+~,])canvas(?![a-z-])/m, file);
    for (const rule of css.matchAll(/([^{}]*\.load-gate[^{}]*)\{/g)) {
      assert.match(rule[1], /:not\(\.rider-route-dive\)/, `${file}: ${rule[1].trim()}`);
    }
  }
});

test("the expansion rule is opt-in, springs with overshoot and leaves nothing at rest", () => {
  const css = strip(foundation);
  const rule = css.match(/\.ring-expand:is\(([\s\S]*?)\)\s*\{([\s\S]*?)\}/);
  assert.ok(rule);
  for (const state of ["[open]", '[data-open="true"]', '[data-state="open"]', ".is-open"])
    assert.ok(rule[1].includes(state), state);
  assert.match(rule[2], /animation: ring-expand-in var\(--ring-dur-bounce\) var\(--ring-spring-bounce\) backwards;/);
  // No bare [open] / dialog rule: a surface must ask for the bounce.
  assert.doesNotMatch(css, /(?:^|[\s,])(?:dialog)?\[open\]\s*\{/m);
  assert.doesNotMatch(css, /animation:[^;]*\b(?:forwards|both)\b/);
  assert.doesNotMatch(css, /will-change/);
});

test("the helper never blocks input and writes only the ring's own properties", () => {
  const code = helper.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /preventDefault|stopPropagation/);
  assert.match(code, /passive: true/);
  assert.match(code, /prefers-reduced-motion: reduce/);
  assert.match(code, /data-world-effects/);
  const writes = [...code.matchAll(/style\.setProperty\(\s*"([^"]+)"/g)].map((m) => m[1]);
  // 2026-11-23: the linked sections add the chain's delays (on a part and on
  // its thread) and the thread's own geometry (on the helper's own nodes).
  // 2026-11-23 (chain-all): a part's delays are its own animation-delay, not
  // inherited custom properties (those restyled every node inside the part);
  // --ring-link-d/-f/-a stay on the thread nodes, three children each.
  assert.deepEqual([...new Set(writes)].sort(), [
    "--ring-kick",
    "--ring-link-a",
    "--ring-link-d",
    "--ring-link-f",
    "--ring-p",
    "--ring-pulley-from",
    "--ring-thread-from",
    "--ring-thread-to",
    "animation-delay",
  ]);
  // The scroll bounce moves opted-in elements, never the document.
  assert.doesNotMatch(code, /(?:body|root|documentElement)\.style/);
});

// Owner, 2026-11-23: 「連鎖する感じにしたいです」「Gで。琥珀色の糸と滑車で頼みます」.
test("linked sections: a pulley-and-thread chain, timed by the helper and run by the sheet", () => {
  const css = strip(foundation);
  const code = helper.replace(/^\s*\/\/.*$/gm, "");
  // The hand-off is the bounce spring's first arrival at its seat: cause and effect.
  let cross = 0;
  for (let t = 0; t < 1; t += 1 / 2000) {
    if (ringSpringPosition(RING_SPRINGS.bounce, t) >= 1) {
      cross = Math.round(t * 1000);
      break;
    }
  }
  assert.equal(RING_LINK_STEP_MS, cross);
  assert.ok(RING_LINK_STEP_MS > 100 && RING_LINK_STEP_MS < 160, String(RING_LINK_STEP_MS));
  // One plain animation per property: additive composition would take the lift off the compositor.
  assert.doesNotMatch(css, /animation-composition/);
  // Text hangs less than figures and cards; the sheet and the helper agree.
  assert.ok(RING_LINK_HANG.text < RING_LINK_HANG.figure && RING_LINK_HANG.text <= 32 && RING_LINK_HANG.figure <= 56);
  for (const kind of ["text", "figure"]) {
    assert.match(css, new RegExp(`@keyframes ring-link-lift-${kind} \\{\\s*from \\{\\s*translate: 0 ${RING_LINK_HANG[kind]}px;`), kind);
  }
  // Parts, threads and pulleys all ride the bounce spring on the helper's delays.
  // 2026-11-23 (chain-all): a part's delays are written as its own inline
  // animation-delay (no inherited custom property on a part), and the part
  // rules outrank a page's own reveal rules (the :not(#r) chain).
  for (const kind of ["text", "figure"]) {
    assert.match(
      css,
      new RegExp(
        `\\[data-ring-link="${kind}"\\](?::not\\(#r\\)){6} \\{\\s*animation:\\s*ring-link-lift-${kind} var\\(--ring-dur-bounce\\) var\\(--ring-spring-bounce\\) backwards,\\s*ring-link-seen 320ms ease-out backwards;`,
      ),
      kind,
    );
  }
  assert.match(code, /style\.setProperty\("animation-delay", bounces\(\) \? `\$\{delay\}ms, \$\{seen\}` : seen\);/);
  assert.doesNotMatch(code, /part\.el\.style\.setProperty\("--ring-link/);
  for (const name of ["ring-thread-run", "ring-pulley-turn"]) {
    assert.match(
      css,
      new RegExp(`animation:\\s*${name} var\\(--ring-dur-bounce\\) var\\(--ring-spring-bounce\\) var\\(--ring-link-d, 0ms\\) backwards`),
      name,
    );
  }
  // A part is held only by an attribute the helper sets, and only once the helper runs.
  // (2026-11-23, chain-all: outranking an absorbed reveal's own is-visible rule.)
  assert.match(
    css,
    /html\[data-ring-ready\] \[data-ring-link="hold"\](?::not\(#r\)){6} \{\s*opacity: 0;\s*\}/,
  );
  assert.equal((css.match(/\[data-ring-link="hold"\]/g) ?? []).length, 1);
  assert.doesNotMatch(read("src/routes/__root.tsx"), /data-ring-link/);
  // Economy: the order and a plain fade, no threads. Reduced motion: no thread layer at all.
  assert.match(
    css,
    /html\[data-ring-ready\]\[data-world-effects="economy"\]\s*:is\(\[data-ring-link="text"\], \[data-ring-link="figure"\]\)(?::not\(#r\)){6} \{\s*animation: ring-link-seen 240ms ease-out backwards;/,
  );
  assert.match(css, /\.ring-links \{[^}]*display: none;/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: no-preference\) \{\s*html:not\(\[data-world-effects="economy"\]\) \.ring-links \{\s*display: block;/,
  );
  assert.match(code, /if \(any && bounces\(\)\)/);
  assert.match(code, /const linksOn = \(\) => !calm\.matches;/);
  // Amber thread; decoration only; faint at rest.
  assert.match(foundation, /--ring-amber: #f2b24a;/);
  assert.match(css, /\.ring-thread \{[^}]*background: var\(--ring-amber\);/);
  assert.match(css, /\.ring-links \{[^}]*pointer-events: none;/);
  assert.match(code, /linkLayer\.setAttribute\("aria-hidden", "true"\)/);
  // (2026-11-23, chain-all: the rest opacity is on the thread's pieces, which
  // carry the show fade; the node that holds them no longer animates.)
  const rest = css.match(/\.ring-link\[data-ring-run\] > \* \{\s*opacity: ([\d.]+);/);
  assert.ok(rest && Number(rest[1]) <= 0.3, "the seated thread is faint");
  // No frame loop for the chain: the helper never animates a part itself.
  assert.doesNotMatch(code, /style\.(?:translate|transform|opacity)\b|setProperty\(\s*"(?:translate|transform|opacity)"/);
  // It never takes a suit-up stage, a pinned scene or a box with its own arrival.
  const forbid = code.match(/const LINK_FORBID =\s*\/(.+)\/;/);
  assert.ok(forbid);
  for (const word of ["suitup", "henshin", "assembly", "entry", "nanite", "vortex", "engine", "canvas", "stage", "sticky", "reveal", "ring-(?:stagger", "ring-enter-(?:pop|spin)"])
    assert.ok(forbid[1].includes(word), word);
  // 2026-11-23 (owner: 「変身シーン以外すべて」): the pages' own reveals are
  // absorbed (dg-, rxs-, Dream, the cinema); every other …reveal class, the
  // suit-up words and the stages are still never taken.
  const forbidRe = new RegExp(forbid[1]);
  for (const kept of ["manager-copy-section dg-reveal", "rxs-section-heading rxs-reveal", "dg-reveal dg-reveal-left"])
    assert.doesNotMatch(kept, forbidRe, kept);
  for (const left of ["cine-burn-reveal", "depth-field-reveal", "is-revealing", "rxs-stage-switcher rxs-reveal", "mus-suitup rxs-reveal", "ring-glass"])
    assert.match(left, forbidRe, left);
  for (const family of ['"dg-reveal"', '"data-dg-seen"', '"rxs-reveal"', '"is-visible"', '"data-dream-reveal"', '"data-dream-visible"', '".saga-cinema"'])
    assert.ok(code.includes(family), family);
  // A reveal pinned to the scroll keeps its own; an absorbed reveal's own
  // transition and arrival are off while the chain moves it.
  assert.match(code, /if \(fam && cs\.animationTimeline && !\/\^\(\?:auto/);
  assert.match(
    css,
    /:is\(\[data-ring-absorb=""\], \[data-ring-absorb="open"\]\)(?::not\(#r\)){6} \{\s*translate: none;\s*scale: none;\s*transform: none;\s*transition: none;\s*animation: none;\s*\}/,
  );
  assert.match(css, /\[data-ring-absorb="done"\](?::not\(#r\)){6} \{\s*animation: none;\s*\}/);
  // No node is inserted while the page scrolls: the threads come from a pool
  // made when the page is idle (inserting restyled the whole document through
  // its :has() rules), and the pool's free nodes are out of the layout.
  assert.match(code, /requestIdleCallback\(fillPool/);
  assert.match(code, /let node = pool\.pop\(\);/);
  assert.doesNotMatch(code, /chain\.links\[i\]\?\.remove\(\)/);
  assert.match(css, /\.ring-link\[data-ring-idle\],\s*\.ring-link\[data-ring-nopull\] > \.ring-thread-pull \{\s*display: none;/);
  // A dossier part taken out of the layout lets go of everything it held.
  assert.match(code, /forgetRoot\(rec\);\s*rec\.done = false;/);
  // 2026-11-23 (chain-all): a section is read once its finite entrances have
  // landed (a dossier part springs in while the page scrolls back to its top),
  // and a held part with a sliver on screen is let go when the scroll stops.
  assert.match(code, /const settle = rootSettling\(rec\.el, true\);/);
  assert.match(code, /view\.addEventListener\("scrollend", sweepHeld, \{ passive: true \}\);/);
  assert.match(code, /if \(part\.el\.getBoundingClientRect\(\)\.top < bottom\) release\(part, now\);/);
  // Main-thread cost (2026-11-23, chain-all): every running animation, even a
  // compositor one, is restyled on each frame the page draws while it
  // scrolls. A later part waits on a timer (still held), not in an animation
  // delay, and the thread is animated only while it pulls.
  assert.match(code, /part\.timer = view\.setTimeout\(/);
  assert.equal((css.match(/ring-thread-show 830ms linear var\(--ring-link-f, 0ms\) backwards;/g) ?? []).length, 2);
  assert.doesNotMatch(css, /\.ring-link\[data-ring-run\] \{\s*animation/);
  // A box with its own entrance is never moved; once it has played it is only opened.
  assert.match(code, /child\.getAnimations\(\)\.length === 0\s*\) \{\s*collectParts\(child, depth \+ 1, out, vh, vw, sy\);\s*continue;/);
  // The film reveal stands aside for a part the chain holds or lifts.
  assert.match(read("src/lib/film-motion.js"), /if \(node\.hasAttribute\?\.\("data-ring-link"\)\) continue;/);
  assert.match(code, /cs\.animationName !== "none"/);
  assert.match(code, /cs\.position !== "static" && cs\.position !== "relative"/);
  assert.match(code, /child\.querySelector\("canvas, iframe"\) !== null/);
  // Held parts are always let go: a safety sweep, print, and reduced motion switched on.
  assert.match(code, /view\.setTimeout\(sweepHeld, SAFETY_MS\)/);
  // A plain .ring-enter joins the chain: the helper gives it data-ring-in at its slot.
  assert.match(code, /style\.setProperty\("animation-delay", `\$\{delay\}ms`\);\s*part\.el\.setAttribute\(IN, ""\);/);
  // A thread never spans a wide gap (a skipped stage or full-bleed block).
  assert.match(code, /if \(b\.top - a\.bottom > 96\) return null;/);
  assert.match(code, /addEventListener\("beforeprint", releaseAllLinks\)/);
});
