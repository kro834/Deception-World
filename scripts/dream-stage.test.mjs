import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/* Dream stage (2026-10-02): src/styles-dream-stage.css, linked after the
   arrival sheet and before the cinematic skin. It clips <body> so the
   document is the scroller again (every named view timeline on Dream had
   bound to a never-scrolling <body>), moves the one-sheet, the act numerals,
   the arches, slips, plates, notes and tanzaku on named view timelines, opens
   the file as a 襖, and recolours the Zeus button. Copy is pinned elsewhere
   (owner-copy, dream-expansion, dream-chapter-site). */

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const page = read("src/components/dream-chapter/dream-chapter.tsx");
const route = read("src/routes/dream-chapter.tsx");
const stage = strip(read("src/styles-dream-stage.css"));

const flat = (text) => text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

// Style rules with their at-rule context; keyframe blocks by name.
function parse(css) {
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

const splitSelectors = (group) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of group) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()];
};

const { rules, keyframes } = parse(stage);
const declaration = (body, property) =>
  body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim();

const FULL_GATE =
  'html:not([data-world-effects="economy"]):not([data-side-menu-open]):not([data-loading]):not([data-dialog-open]) .dream-page.dream-page';

test("the stage sheet loads after the arrival sheet and before the cinematic skin", () => {
  assert.match(route, /import dreamStageCssUrl from "@\/styles-dream-stage\.css\?url";/);
  const links = route.slice(route.search(/links:\s*\[/));
  const arrival = links.indexOf("href: dreamArrivalCssUrl");
  const stageLink = links.indexOf("href: dreamStageCssUrl");
  const cinematic = links.indexOf("CINEMATIC_STYLESHEET_LINK");
  assert.ok(arrival > 0 && stageLink > arrival && cinematic > stageLink);
});

test("every rule is scoped to the Dream page", () => {
  assert.ok(rules.length > 30, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitSelectors(selector)) {
      assert.match(
        part,
        /^(?:html(?:\[data-dream-chapter="true"\]|\[data-world-effects="economy"\]|:not\([^)]*\))*\s+(?:body\s+)?)?\.dream-page\.dream-page\b|^html\[data-dream-chapter="true"\]:not\(\[data-loading\]\):not\(\[data-side-menu-open\]\):not\(\[data-dialog-open\]\) body$|^html\[data-dream-chapter="true"\] body \.zeus-button/,
        part,
      );
    }
  }
});

test("the document is the scroller: body is clipped outside the lock states", () => {
  const clip = rules.find(({ selector }) => selector.endsWith(" body"));
  assert.equal(
    clip.selector,
    'html[data-dream-chapter="true"]:not([data-loading]):not([data-side-menu-open]):not([data-dialog-open]) body',
  );
  assert.equal(clip.body.replace(/;$/, ""), "overflow: clip visible");
  assert.deepEqual(clip.context, []);
});

test("scroll-linked motion is named, fully gated, and animates transform and opacity only", () => {
  const timelineRules = rules.filter(({ body }) => {
    const timeline = declaration(body, "animation-timeline");
    return timeline && !/^(?:auto|none)$/.test(timeline);
  });
  assert.ok(timelineRules.length >= 6, String(timelineRules.length));
  const scrollLinkedNames = new Set();
  for (const { selector, body, context } of timelineRules) {
    const timelines = declaration(body, "animation-timeline")
      .split(",")
      .map((value) => value.trim());
    for (const timeline of timelines) {
      if (timeline === "auto") continue;
      assert.match(timeline, /^--ts-[\w-]+$/, `${selector}: ${timeline}`);
      assert.doesNotMatch(timeline, /^(?:view|scroll)\(/, selector);
    }
    assert.ok(
      context.some((head) => head === "@media (prefers-reduced-motion: no-preference)") ||
        context.some((head) => head.includes("prefers-reduced-motion: no-preference")),
      `reduced-motion gate: ${selector}`,
    );
    const inDialog = selector.includes(".dream-dossier-rail-mark");
    if (inDialog) {
      // The rail mark rides the plates rail's own inline scroll timeline,
      // which exists only while the file is open: economy and reduced
      // motion gate it, the dialog flag cannot.
      assert.match(selector, /^html:not\(\[data-world-effects="economy"\]\) \.dream-page\.dream-page/);
    } else {
      assert.ok(selector.startsWith(FULL_GATE), selector);
    }
    // Each animation layer pairs with its own timeline layer; ts-settle is
    // the Taisho sheet's finite settle, kept beside the drift.
    const isName = (token) => token === "ts-settle" || keyframes.some((k) => k.name === token);
    const names = (declaration(body, "animation-name") ?? declaration(body, "animation") ?? "")
      .split(",")
      .map((layer) => layer.trim().split(/\s+/).find(isName))
      .filter(Boolean);
    const list = timelines.length;
    names.forEach((name, index) => {
      if (timelines[index % list] !== "auto") scrollLinkedNames.add(name);
    });
  }
  assert.deepEqual(
    [...scrollLinkedNames].sort(),
    ["ts-stage-art", "ts-stage-ghost", "ts-stage-hang", "ts-stage-in", "ts-stage-rail", "ts-stage-title"],
  );
  // Every keyframe outside the file's finite opening may ride a timeline
  // (ts-stamp and ts-stage-hang-right are swapped in by animation-name), so
  // all of them animate transform and opacity only.
  const finite = new Set(["ts-stage-veil", "ts-stage-sheet", "ts-stage-plate", "ts-stage-rise"]);
  for (const { name, body } of keyframes) {
    if (finite.has(name)) continue;
    const properties = new Set([...body.matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]));
    for (const property of properties) {
      assert.ok(["opacity", "translate", "scale", "rotate"].includes(property), `${name}: ${property}`);
    }
  }
  assert.match(stage, /\.dream-footer-end \{\s*animation-name: ts-stamp;/);
  // Nothing loops, and the finite file opening is at rest within 1.2s.
  assert.doesNotMatch(stage, /infinite|animation-iteration-count/);
  for (const [, duration, delay] of stage.matchAll(/animation:\s*[\w-]+\s+(\d+)ms[^;]*?\s(\d+)ms/g)) {
    assert.ok(Number(duration) + Number(delay) <= 1200, `${duration}+${delay}`);
  }
  for (const [, delay] of stage.matchAll(/animation-delay:\s*(\d+)ms/g)) assert.ok(Number(delay) <= 500);
});

test("the one-sheet keeps its finite settle beside the drift, and the copy block never moves", () => {
  const art = rules.find(({ selector }) => selector === `${FULL_GATE} .dream-hero-art`);
  assert.ok(art);
  assert.match(art.body, /animation: ts-settle 9s cubic-bezier\(0\.25, 0\.1, 0\.25, 1\) both, ts-stage-art linear both;/);
  assert.match(art.body, /animation-timeline: auto, --ts-stage;/);
  assert.match(art.body, /animation-range: normal, exit 0% exit 100%;/);
  assert.doesNotMatch(stage, /\.dream-hero-copy|\.dream-title-logo|\.dream-hero-field|\.dream-hero-vignette/);
  const drift = keyframes.find((k) => k.name === "ts-stage-art");
  assert.doesNotMatch(drift.body, /scale|opacity/);
});

test("the act numerals and the file spine are HUD codes with an empty alternative", () => {
  for (const numeral of ["I", "II", "III", "IV"]) {
    assert.match(page, new RegExp(`<header className="dream-section-heading" data-film-reveal data-ts-numeral="${numeral}">`));
  }
  assert.match(stage, /\.dream-section-heading\[data-ts-numeral\]::after \{[^}]*content: attr\(data-ts-numeral\) \/ "";/);
  assert.match(stage, /\.dream-dossier-visuals\[data-ts-order\]::before \{[^}]*content: attr\(data-ts-order\) \/ "";/);
  assert.match(stage, /\.dream-dossier-visuals\[data-ts-roman\]::after \{[^}]*content: attr\(data-ts-roman\) \/ "";/);
  assert.equal(page.match(/data-ts-order=\{(?:character|record)\.order\}/g)?.length, 2);
  assert.equal(page.match(/data-ts-roman=\{(?:character|record)\.roman\}/g)?.length, 2);
  // Only the ghosts and the rail mark are new markup: textless, aria-hidden.
  assert.equal(
    page.match(/<i className="dream-dossier-rail-mark" aria-hidden="true" \/>/g)?.length,
    2,
  );
  assert.match(page, /\{character\.secondary \? <i className="dream-dossier-rail-mark"/);
  assert.match(page, /\{record\.secondary \? <i className="dream-dossier-rail-mark"/);
  // The spine hangs only where the plate column is sticky beside the copy.
  const spine = rules.find(({ selector }) => selector.includes("[data-ts-order]::before"));
  assert.deepEqual(spine.context, ["@media (min-width: 1181px) and (min-height: 700px)"]);
});

test("the file opens finite and gated: veil, sheet, plates, copy", () => {
  for (const name of ["ts-stage-veil", "ts-stage-sheet", "ts-stage-plate", "ts-stage-rise"]) {
    const rule = rules.find(({ body }) => new RegExp(`animation: ${name} `).test(body));
    assert.ok(rule, name);
    assert.match(rule.selector, /^html:not\(\[data-world-effects="economy"\]\) \.dream-page\.dream-page \.dream-dossier-dialog\[open\]/);
    assert.deepEqual(rule.context, ["@media (prefers-reduced-motion: no-preference)"]);
    assert.doesNotMatch(declaration(rule.body, "animation-timeline") ?? "", /--/);
  }
  // The shell itself never transforms: the CLOSE plate is fixed inside it.
  assert.doesNotMatch(stage, /\.dream-dossier-shell\b/);
  // The plate wipe is the only clip-path, and it is time-based.
  const clipped = keyframes.filter((k) => /clip-path/.test(k.body)).map((k) => k.name);
  assert.deepEqual(clipped, ["ts-stage-plate"]);
});

test("phones: the rail's ink band keeps the CLOSE plate off the face, and the mark is ornament", () => {
  const band = rules.find(
    ({ selector, context }) =>
      selector === ".dream-page.dream-page .dream-dossier-visuals" &&
      context[0] === "@media (max-width: 640px)",
  );
  assert.match(band.body, /padding-top: 60px;/);
  const hidden = rules.find(({ selector, context }) =>
    selector === ".dream-page.dream-page .dream-dossier-rail-mark" && !context.length,
  );
  assert.equal(hidden.body.replace(/;$/, ""), "display: none");
  const mark = rules.find(({ selector }) => selector.endsWith(".dream-dossier-rail-mark") && selector.startsWith("html"));
  assert.match(mark.body, /pointer-events: none;/);
  assert.match(stage, /@media \(prefers-reduced-motion: reduce\) \{\s*\.dream-page\.dream-page \.dream-dossier-rail-mark \{\s*display: none;/);
  assert.match(stage, /html\[data-world-effects="economy"\] \.dream-page\.dream-page \.dream-dossier-rail-mark \{\s*display: none;/);
});

test("the Zeus button keeps its logic: colour only, with the lite tier's shadow untouched", () => {
  const zeus = rules.filter(({ selector }) => selector.includes(".zeus-button"));
  assert.equal(zeus.length, 2);
  for (const { body } of zeus) {
    assert.doesNotMatch(
      body,
      /(?:^|;)\s*(?:position|inset|top|left|right|bottom|transform|translate|width|height|display|pointer-events|touch-action):/,
    );
  }
  assert.match(zeus[0].selector, /\.zeus-button:not\(\[data-dragging="true"\]\):not\(\[data-return-loading="true"\]\)$/);
});

test("no text under 12px, no !important, no filters on hot paths, forced colours drop the ghosts", () => {
  for (const [, size] of stage.matchAll(/font-size:\s*([^;]+);/g)) {
    const minimum = size.match(/^clamp\((\d+)px/)?.[1] ?? size.match(/^(\d+)px$/)?.[1];
    if (minimum != null) assert.ok(Number(minimum) >= 12, size);
  }
  assert.doesNotMatch(stage, /!important|backdrop-filter|filter:/);
  const forced = stage.slice(stage.indexOf("@media (forced-colors: active)"));
  for (const selector of [
    ".dream-section-heading[data-ts-numeral]::after",
    ".dream-dossier-visuals[data-ts-order]::before",
    ".dream-dossier-visuals[data-ts-roman]::after",
    ".dream-dossier-rail-mark",
  ]) {
    assert.ok(forced.includes(selector), selector);
  }
  assert.match(forced, /display: none;/);
});
