import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* The Overdrive edition of /extreme-saga (rx3, 2026-10-03):
   src/styles-extreme-overdrive.css plus textless ornaments, headline line
   wrappers and a change-of-form flag in the component. These pins keep it
   safe: where the sheet loads, what it may select, how its motion is gated
   and timed, what its keyframes touch, the 12px floor, forced colours, the
   resting state under a scroll lock, and the markup and copy it relies on
   (rx3/COPY3-extreme.md lists every changed string). */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const source = read("src/styles-extreme-overdrive.css");
const css = strip(source);
const route = read("src/routes/extreme-saga.tsx");
const component = read("src/components/extreme-saga/extreme-saga.tsx");

// Style rules with their at-rule context, and keyframe blocks by name.
function parse(text) {
  const body = strip(text);
  const flat = (value) =>
    value.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();
  const rules = [];
  const keyframes = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      const frames = head.match(/^@keyframes\s+([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < body.length && depth > 0; end += 1) {
          if (body[end] === "{") depth += 1;
          if (body[end] === "}") depth -= 1;
        }
        keyframes.push({ name: frames[1], body: body.slice(index + 1, end - 1) });
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = body.indexOf("}", index);
      rules.push({ selector: head, body: body.slice(index + 1, end), context: [...stack] });
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

const declarations = (body, property) =>
  [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map((match) =>
    match[1].trim(),
  );

const { rules, keyframes } = parse(source);
const timed = (body) =>
  declarations(body, "animation-timeline").some((value) => !/^(?:auto|none)$/.test(value));
const FULL_GATE =
  /^html:not\(\[data-world-effects="economy"\]\):not\(\[data-side-menu-open\]\):not\(\[data-loading\]\):not\(\[data-dialog-open\]\) \.rxs-page\.rxs-page\.exs-page\[data-motion-ready="true"\]/;

test("the sheet loads on /extreme-saga only, after the edition and before the cinematic sheet", () => {
  assert.match(
    route,
    /import extremeOverdriveCssUrl from "@\/styles-extreme-overdrive\.css\?url";/,
  );
  const links = route.slice(route.search(/links:\s*\[/));
  const edition = links.indexOf("href: extremeEditionCssUrl");
  const overdrive = links.indexOf("href: extremeOverdriveCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(edition > 0 && edition < overdrive && overdrive < cinematic);
  assert.equal(links.lastIndexOf('rel: "stylesheet"') < cinematic, true);
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/world.tsx",
    "src/routes/rexonance-saga.tsx",
    "src/routes/final-stage.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(read(path), /extreme-overdrive|extremeOverdrive/, path);
  }
});

test("every rule is scoped to the Extreme page, so Rexonance and Final Stage never see it", () => {
  assert.ok(rules.length > 80, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitTopLevel(selector)) {
      assert.match(
        part,
        /^(?:html(?:\[[^\]]+\])?(?::not\(\[[^\]]+\]\))* )?\.rxs-page\.rxs-page\.exs-page\b/,
        part,
      );
    }
  }
  assert.doesNotMatch(css, /\.fst-|\.rxs-rexonance-page|\.rx-call/);
});

test("keyframes are its own, move only opacity, transforms and clip-path, and turn once at most", () => {
  assert.ok(keyframes.length >= 25, String(keyframes.length));
  for (const { name, body } of keyframes) {
    assert.match(name, /^exo-/, name);
    const properties = new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]));
    for (const property of properties) {
      assert.ok(
        [
          "opacity",
          "transform",
          "translate",
          "scale",
          "rotate",
          "clip-path",
          "animation-timing-function",
        ].includes(property),
        `${name}: ${property}`,
      );
    }
    // One rise and one fall of opacity per run at most (one flash pair).
    const opacities = [...body.matchAll(/opacity:\s*([\d.]+)/g)].map((match) => Number(match[1]));
    let turns = 0;
    for (let index = 2; index < opacities.length; index += 1) {
      const before = Math.sign(opacities[index - 1] - opacities[index - 2]);
      const after = Math.sign(opacities[index] - opacities[index - 1]);
      if (before && after && before !== after) turns += 1;
    }
    assert.ok(turns <= 1, `${name}: ${opacities.join(" → ")}`);
  }
  assert.doesNotMatch(css, /\binfinite\b|animation-iteration-count/);
  // The only keyframes borrowed from another sheet: the dial's own lock-on
  // (the zone locks with the dial it belongs to).
  const used = new Set(
    rules.flatMap(({ body }) =>
      [...declarations(body, "animation"), ...declarations(body, "animation-name")].flatMap(
        (value) =>
          [...value.matchAll(/(?<![-\w])((?:exo|ex|mx)-[\w-]+)/g)].map((match) => match[1]),
      ),
    ),
  );
  for (const name of used) {
    if (name.startsWith("exo-"))
      assert.ok(
        keyframes.some((frame) => frame.name === name),
        name,
      );
    else assert.equal(name, "ex-dial-lock", name);
  }
});

test("time-based motion waits for its moment, stands down for reduced motion and economy, and ends", () => {
  let arrivals = 0;
  for (const { selector, body, context } of rules) {
    const animations = declarations(body, "animation").filter((value) => value !== "none");
    if (!animations.length || timed(body)) continue;
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    for (const part of splitTopLevel(selector)) {
      assert.match(part, /^html:not\(\[data-world-effects="economy"\]\)/, part);
      // The arrival waits for the load gate's hand-over; the cut for a
      // reader's change of form; the comparator for being reached.
      assert.match(part, /:not\(\[data-loading\]\)|\[data-exo-cut="true"\]|\.is-visible/, part);
    }
    for (const value of splitTopLevel(animations.join(","))) {
      const times = [...value.matchAll(/(\d+)ms/g)].map((match) => Number(match[1]));
      assert.ok(times.length >= 1, `${selector}: ${value}`);
      const [duration, ...offsets] = times;
      assert.ok(duration <= 1500, `${selector}: ${value}`);
      assert.ok(duration + Math.max(0, ...offsets) <= 2000, `${selector}: ${value}`);
      arrivals += 1;
    }
  }
  assert.ok(arrivals >= 20, String(arrivals));
  // The spark rides the strike: the cinema sheet's duration, delay and curve.
  assert.match(
    css,
    /h1::after \{\s*animation:\s*exo-spark-run 600ms var\(--sx-project\) calc\(var\(--sx-delay\) \+ 100ms\) backwards,\s*exo-spark-show 600ms linear calc\(var\(--sx-delay\) \+ 100ms\) both;/,
  );
  // Clip entrances fill backwards only, so nothing rests clipped.
  for (const { body } of rules) {
    for (const value of declarations(body, "animation")) {
      for (const layer of splitTopLevel(value)) {
        if (/\bexo-cut\b/.test(layer)) assert.match(layer, /\bbackwards$/, layer);
      }
    }
  }
});

test("scroll-linked motion rides named timelines behind the full gate", () => {
  let linked = 0;
  for (const { selector, body, context } of rules) {
    if (!timed(body) && !/view-timeline\s*:/.test(body)) continue;
    assert.ok(
      context.some((at) => at.startsWith("@supports (animation-timeline: view())")),
      selector,
    );
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    const timelines = declarations(body, "animation-timeline");
    for (const part of splitTopLevel(selector)) assert.match(part, FULL_GATE, part);
    if (!timelines.length) continue;
    linked += 1;
    for (const timeline of splitTopLevel(timelines.at(-1))) assert.match(timeline, /^--[\w-]+$/);
    // Longhands, so a minifier cannot write a zero duration into the range.
    assert.deepEqual(declarations(body, "animation-duration"), ["auto"], selector);
  }
  assert.ok(linked >= 20, String(linked));
  // Scroll-linked keyframes never animate clip-path (main-thread paint).
  const scrollNames = new Set(
    rules
      .filter(({ body }) => timed(body))
      .flatMap(({ body }) => declarations(body, "animation-name")),
  );
  for (const name of scrollNames) {
    const frame = keyframes.find((entry) => entry.name === name);
    assert.ok(frame, name);
    assert.doesNotMatch(frame.body, /clip-path/, name);
  }
});

test("under a scroll lock the choreographed page rests drawn", () => {
  for (const flag of ["data-side-menu-open", "data-dialog-open", "data-loading"]) {
    const rest = rules.filter(
      ({ selector, body }) =>
        selector.startsWith(`html[${flag}] .rxs-page.rxs-page.exs-page`) &&
        /animation:\s*none/.test(body),
    );
    assert.equal(rest.length, 1, flag);
    for (const element of [
      ".rxs-section-heading h2",
      ".rxs-footer h2",
      ".exo-line",
      ".rxs-headline-metrics article strong",
      ".rxs-p14-copy .exo-read",
      ".exs-p14-comparison article",
      ".rxs-system-grid article",
      ".rxs-specs > div strong",
      ".rxs-footer > :is(.exo-door, .rxs-footer-return)",
    ]) {
      assert.ok(rest[0].selector.includes(element), `${flag}: ${element}`);
    }
  }
});

test("rules that turn on a page flag select narrowly, so the hand-over restyles little", () => {
  // Removing html[data-loading] (and opening the menu or a dialog) restyles
  // every element matching the subject of a rule gated on that flag. A bare
  // div, span, a, i, p or li there restyled hundreds of elements in the
  // dive's hand-over (a new 55 ms task at 4x CPU on a Pixel); subjects carry
  // a class or an id, or are one of a few rare tags.
  for (const { selector } of rules) {
    if (!/data-loading|data-side-menu-open|data-dialog-open/.test(selector)) continue;
    for (const part of splitTopLevel(selector)) {
      const subject = part.split(/\s*[ >+~]\s*(?![^(]*\))/).pop();
      const bare = subject.replace(/::?[\w-]+(?:\([^)]*\))?/g, "");
      if (/[.#]/.test(bare) || /^:is\(/.test(subject)) continue;
      assert.match(bare, /^(?:h1|h2|article|figure|strong)$/, part);
    }
  }
});

test("12px floor, no !important, no images but the site's own two forms, a forced-colours path", () => {
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px\b/);
  assert.doesNotMatch(css, /!important/);
  const urls = [...css.matchAll(/url\(([^)]*)\)/g)].map((match) => match[1]);
  assert.deepEqual(urls.sort(), ['"/saga-extreme-middle.webp"', '"/saga-extreme-ultra.jpeg"']);
  // The other form stands behind the cut only after a reader's change, and
  // always the form being replaced.
  const backdrops = rules.filter(({ body }) => /url\(/.test(body));
  assert.equal(backdrops.length, 2);
  for (const { selector, body } of backdrops) {
    const [, form] =
      selector.match(
        /#exs-stage-panel\[data-exo-cut="true"\] figure\[data-form="(ultra|middle)"\]$/,
      ) ?? [];
    assert.ok(form, selector);
    assert.match(body, form === "ultra" ? /saga-extreme-middle/ : /saga-extreme-ultra/, selector);
  }
  // Generated text: the round label and numbers, each with an empty alt.
  for (const [, value] of css.matchAll(/content:\s*([^;]+);/g)) {
    assert.match(value.trim(), /^(?:""|"ROUND"(?: \/ "")?|"0[2-4]"(?: \/ "")?)$/, value);
  }
  for (const label of ["ROUND", "02", "03", "04"]) {
    assert.ok(css.includes(`content: "${label}" / "";`), label);
  }
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.ok(forced.length > 200);
  assert.match(
    forced,
    /:is\(\.exo-zone, \.exo-rev, \.exo-shock, \.exo-burst, \.exo-speed, \.exo-lock, \.exo-slash\)/,
  );
  assert.match(forced, /\.rxs-hero h1::after/);
  // The stage art holds still on scroll, so the old form lines up behind a cut.
  assert.match(
    css,
    /\.rxs-page\.rxs-page\.exs-page #exs-stage-panel figure img \{\s*animation: none;/,
  );
  assert.match(forced, /\.rxs-hero h1 \{\s*background-image: none;\s*filter: none;/);
  // Economy: a change of form simply stands.
  assert.match(
    css,
    /html\[data-world-effects="economy"\] \.rxs-page\.rxs-page\.exs-page #exs-stage-panel figure \{\s*animation: none;/,
  );
  assert.match(
    forced,
    /\.rxs-bars i\.is-rexonance, \.rxs-comparison-key \.is-rexonance\) \{\s*background: CanvasText;/,
  );
  assert.match(
    forced,
    /#exs-stage-panel\[data-exo-cut="true"\] figure\[data-form\] \{\s*background: Canvas;/,
  );
  // Transitions run only with motion allowed and outside economy rendering.
  for (const { selector, body, context } of rules) {
    if (!declarations(body, "transition").some((value) => value !== "none")) continue;
    assert.ok(
      context.some((at) => at.includes("(prefers-reduced-motion: no-preference)")),
      selector,
    );
    for (const part of splitTopLevel(selector)) {
      assert.match(part, /^html:not\(\[data-world-effects="economy"\]\)/, part);
    }
  }
});

test("the blocks with scroll choreography and the comparator skip the hidden reveal", () => {
  const reveal = rules.find(({ selector }) => selector.includes(").rxs-reveal"));
  assert.ok(reveal);
  assert.ok(reveal.context.some((at) => at.startsWith("@supports (animation-timeline: view())")));
  for (const block of [
    ".rxs-section-heading",
    ".rxs-headline-metrics article",
    ".rxs-comparison",
    ".rxs-p14-overview",
    ".exs-p14-comparison",
    ".rxs-system-grid article",
    ".rxs-specs",
  ]) {
    assert.ok(reveal.selector.includes(block), block);
  }
  assert.match(reveal.body, /opacity:\s*1;\s*translate:\s*none;\s*transition:\s*none/);
  // The metric cards and the two art panels clip instead of scrolling, so
  // their view timelines follow the page.
  assert.match(
    css,
    /\.rxs-headline-metrics article,\s*\.rxs-page\.rxs-page\.exs-page \.rxs-p14-overview figure,\s*\.rxs-page\.rxs-page\.exs-page \.rxs-stage-panel figure \{\s*overflow: clip;/,
  );
});

test("the component adds only textless, hidden ornaments, line wrappers and the cut flag", () => {
  const visual = component.match(
    /<div className="rxs-hero-visual" aria-hidden="true">[\s\S]*?<\/div>/,
  )?.[0];
  assert.ok(visual);
  for (const ornament of ["exs-dial", "exo-zone", "exo-rev", "exo-shock"]) {
    assert.ok(visual.includes(`<i className="${ornament}" />`), ornament);
  }
  for (const ornament of ["exo-burst", "exo-speed", "exo-lock", "exo-slash", "exo-joint"]) {
    assert.ok(component.includes(`<i className="${ornament}" aria-hidden="true" />`), ornament);
  }
  // Hooks for the narrow selectors above (class names only).
  assert.equal((component.match(/<div className="exo-read">/g) ?? []).length, 3);
  assert.match(component, /<span className="exo-arrow" aria-hidden="true">\s*→\s*<\/span>/);
  assert.match(component, /<span className="exo-frame" aria-hidden="true" \/>/);
  assert.match(component, /<span className="exo-number">\{system\.number\}<\/span>/);
  assert.equal((component.match(/assets=\{\[\]\} className="exo-door"/g) ?? []).length, 2);
  // Every headline keeps its two lines, each in a wrapper and unchanged.
  for (const [first, second] of [
    ["肉弾戦なら、", "話が早い。"],
    ["可能性は増やす。", "答えは一つ。"],
    ["ミドルで育てて、", "ウルトラで決める。"],
    ["学習、充填、", "結果固定。"],
    ["長期戦なら、", "なおさら歓迎。"],
  ]) {
    assert.match(
      component,
      new RegExp(
        `<span className="exo-line">${first}</span>\\s*<br />\\s*<span className="exo-line">${second}</span>`,
      ),
    );
  }
  // The coupling between the processors carries no glyph (COPY3-extreme E2).
  const specs = component.match(
    /<div className="rxs-specs rxs-reveal">[\s\S]*?<\/div>\s*<\/section>/,
  )?.[0];
  assert.ok(specs);
  assert.match(specs, /<i className="exo-joint" aria-hidden="true" \/>/);
  assert.doesNotMatch(specs, /×/);
  // The cut is armed by a change of form only, never at first paint, and
  // the art swaps at most once every STAGE_CUT_GAP_MS (never two flashes a
  // second, whatever the tapping cadence); the tabs and the copy follow the
  // selection at once, the selection handlers are the original ones.
  assert.match(component, /const STAGE_CUT_GAP_MS = 1100;/);
  assert.match(component, /const \[stageCut, setStageCut\] = useState\(false\);/);
  assert.match(
    component,
    /const \[shownStage, setShownStage\] = useState<ExtremeStage>\("middle"\);/,
  );
  assert.match(
    component,
    /useLayoutEffect\(\(\) => \{\s*if \(shownStage === stage\) return;\s*const cut = \(\) => \{\s*lastCutRef\.current = performance\.now\(\);\s*setStageCut\(true\);\s*setShownStage\(stage\);\s*\};\s*const wait = lastCutRef\.current \+ STAGE_CUT_GAP_MS - performance\.now\(\);\s*if \(wait <= 0\) \{\s*cut\(\);\s*return;\s*\}\s*const timer = window\.setTimeout\(cut, wait\);\s*return \(\) => window\.clearTimeout\(timer\);\s*\}, \[stage, shownStage\]\);/,
  );
  assert.match(component, /onClick=\{\(\) => setStage\(key\)\}/);
  assert.match(component, /if \(nextStage\) setStage\(nextStage\);/);
  assert.match(component, /data-exo-cut=\{stageCut \? "true" : undefined\}/);
  assert.match(component, /<figure key=\{shownStage\} data-form=\{shownStage\}>/);
  assert.match(component, /src=\{shownArt\.image\}\s*alt=\{shownArt\.alt\}/);
  // The panel stays named by the selected tab at once.
  assert.match(component, /aria-labelledby=\{`exs-stage-tab-\$\{stage\}`\}/);
  // Both stage titles stand on two lines (no jump of the figure on phones).
  assert.match(
    component,
    /<h3>\s*<span className="exo-title-line">\s*\{activeStage\.title\.slice\(0, activeStage\.title\.indexOf\("、"\) \+ 1\)\}\s*<\/span>\s*<span className="exo-title-line">\s*\{activeStage\.title\.slice\(activeStage\.title\.indexOf\("、"\) \+ 1\)\}\s*<\/span>\s*<\/h3>/,
  );
  // No lookbehind or other syntax older Safari cannot parse in the bundle.
  assert.doesNotMatch(component, /\(\?<[=!]/);
  // The overdrive margin is computed from the metric's own two bars.
  assert.match(
    component,
    /\["--exo-base" as string\]: `\$\{Math\.min\(100, \(metric\.baselineBar \/ metric\.currentBar\) \* 100\)\.toFixed\(1\)\}%`/,
  );
  assert.doesNotMatch(component, /レクソナンス|to="\/rexonance-saga"/);
});

test("the copy keeps the 2026-10-02 voice and the meta speaks it (COPY3-extreme E1)", () => {
  for (const line of [
    "THE SUPREME ARRIVAL OF SA-GA",
    "<span>戦うほど、勝ち筋が増す。</span>",
    "<span>長引くほど、こっちのもの。</span>",
    "腕っぷしを、数字で。",
    "肉弾戦に最適化したエクスプリーム。",
    "<span>負けた欄も、隠さない。</span>",
    "<h3>選んだ結果を、勝利に固定する。</h3>",
    'title: "殴られるほど、賢くなる。"',
    'title: "50秒で、片をつける。"',
  ]) {
    assert.ok(component.includes(line), line);
  }
  assert.match(
    route,
    /"殴り合い、歓迎。戦うほど勝ち筋が増すエクスプリームサーガの公式特設サイト。標準性能と専用P14、ディルクルムサーガ／ヴィンクルムサーガとのカタログ比較を、負けた欄まで隠さず並べています。"/,
  );
  assert.match(
    route,
    /content: "殴り合い、歓迎。長引くほど、こっちのもの。エクスプリームサーガ公式特設サイト。"/,
  );
  assert.doesNotMatch(route, /至高、極まれり/);
});
