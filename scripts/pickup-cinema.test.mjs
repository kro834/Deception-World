import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/* The record viewers (src/styles-pickup-cinema.css): the form pickups on the
   character files, the nightmare pickup, and the episode and column pickups
   on /world. The sheet is scoped to those four dialogs, keeps every label at
   12px or more, moves only on a finite, gated opening (plus the record's
   scroll-linked position line), never animates a dialog's transform (the
   Zeus button is portalled into the open dialog), and writes forced colours
   out. */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "");
const splitSelector = (selector) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    if (selector[i] === "(") depth += 1;
    else if (selector[i] === ")") depth -= 1;
    else if (selector[i] === "," && depth === 0) {
      parts.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  return [...parts, selector.slice(start)].map((part) => part.trim().replace(/\s+/g, " "));
};
// Style rules with their at-rule context.
const parse = (source) => {
  const css = stripComments(source);
  const rules = [];
  const keyframes = new Map();
  const stack = [];
  let prelude = "";
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      const head = prelude.replace(/\s+/g, " ").trim();
      prelude = "";
      const frames = head.match(/^@keyframes ([\w-]+)$/);
      if (frames) {
        let depth = 1;
        let end = index + 1;
        for (; end < css.length && depth > 0; end += 1) {
          if (css[end] === "{") depth += 1;
          if (css[end] === "}") depth -= 1;
        }
        keyframes.set(frames[1], css.slice(index + 1, end - 1));
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
    } else if (character === ";" && !stack.length) prelude = "";
    else prelude += character;
  }
  return { rules, keyframes };
};

const source = await read("src/styles-pickup-cinema.css");
const { rules, keyframes } = parse(source);
// The four dialogs, and the resonance gate the Rexonance pickup opens with.
const DIALOGS =
  /\.form-pickup-dialog|\.rider-nightmare-dialog|#episode-pickup-dialog|#world-column-pickup|\.rexonance-gate /;

test("the sheet is linked last among the dossier sheets and before Mirage on /world", async () => {
  const head = await read("src/lib/world-head.ts");
  assert.match(head, /import pickupCinemaCssUrl from "@\/styles-pickup-cinema\.css\?url";/);
  const dossier = head.slice(head.indexOf("export const DOSSIER_STYLESHEET_LINKS"));
  const list = dossier.slice(0, dossier.indexOf("];"));
  assert.ok(list.indexOf("href: dossierCinemaCssUrl") > 0);
  assert.ok(
    list.indexOf("PICKUP_CINEMA_STYLESHEET_LINK") > list.indexOf("href: dossierCinemaCssUrl"),
  );
  // Not in the World links: Final Stage and the special sites keep their own records.
  const world = head.slice(head.indexOf("export const WORLD_STYLESHEET_LINKS"));
  assert.doesNotMatch(world.slice(0, world.indexOf("];")), /PICKUP_CINEMA/);
  assert.doesNotMatch(head, /mirage/i);
  const route = await read("src/routes/world.tsx");
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  const order = [
    "href: worldAnnexCssUrl",
    "PICKUP_CINEMA_STYLESHEET_LINK",
    "href: MIRAGE_FONTS_URL",
    "href: worldMirageCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(
    order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])),
    String(order),
  );
});

test("every rule reaches only the four record dialogs, and adds one label", () => {
  assert.ok(rules.length > 100, String(rules.length));
  for (const { selector } of rules) {
    if (/^(from|to|\d+%)$/.test(selector)) continue;
    for (const part of splitSelector(selector)) assert.match(part, DIALOGS, part);
  }
  // The only generated text is the episode close's plate name, with an empty
  // alternative so the control keeps announcing its own aria-label.
  const contents = [...stripComments(source).matchAll(/(?<![\w-])content:\s*([^;]+);/g)].map((m) =>
    m[1].trim(),
  );
  assert.ok(contents.length > 10);
  for (const value of contents) assert.ok(value === '""' || value === '"CLOSE" / ""', value);
  assert.equal(contents.filter((value) => value !== '""').length, 1);
});

test("Final Stage's record dialog is never reached, even when the sheet lingers", () => {
  // A route's sheets stay linked after an in-app navigation, and Final
  // Stage's record dialog shares .form-pickup-dialog: every compound that
  // names it excludes .fst-pickup-dialog (or is the Rexonance dialog).
  for (const { selector } of rules) {
    if (/^(from|to|\d+%)$/.test(selector)) continue;
    for (const part of splitSelector(selector)) {
      const tight = part.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/,\s+/g, ",");
      for (const [compound] of tight.matchAll(/\.form-pickup-dialog[^\s>+~]*/g)) {
        assert.match(compound, /:not\([^)]*\.fst-pickup-dialog|\.is-rexonance-dialog/, part);
      }
    }
  }
});

test("no label falls under 12px", () => {
  const sizes = [];
  for (const { body } of rules) {
    for (const [, value] of body.matchAll(/(?:^|;)\s*font-size:\s*([^;]+)/g))
      sizes.push(value.trim());
    for (const [, value] of body.matchAll(/(?:^|;)\s*font:\s*([^;]+)/g)) {
      if (value.trim() === "inherit") continue;
      sizes.push(value.trim().match(/(\d+(?:\.\d+)?px)(?:\/[\d.]+)?\s/)?.[1] ?? "?");
    }
  }
  assert.ok(sizes.length > 40, String(sizes.length));
  for (const size of sizes) {
    const px = size.match(/^(\d+(?:\.\d+)?)px$/);
    const clamp = size.match(/^clamp\((\d+(?:\.\d+)?)px,/);
    const floor = size.match(/^max\((\d+(?:\.\d+)?)px,/);
    const value = Number((px ?? clamp ?? floor)?.[1]);
    assert.ok(value >= 12, `font-size ${size}`);
  }
  // The column rail's labels (7-11px before) and the Rexonance labels.
  assert.match(
    source,
    /#world-column-pickup \.world-column-dialog-tabs > button\[role="tab"\] :is\(small, b\) \{\s*font-size: 12px;/,
  );
  assert.match(
    source,
    /\.is-rexonance-dialog \.form-pickup-heading h2 > span \{\s*font-size: max\(12px, 0\.34em\);/,
  );
});

test("the opening is finite and gated; the dialog's transform never moves", () => {
  const moving = rules.filter(({ body }) =>
    /(?:^|;)\s*animation(?:-name)?\s*:(?!\s*none\s*(?:;|$))/.test(body),
  );
  assert.ok(moving.length >= 10, String(moving.length));
  for (const { selector, body, context } of moving) {
    assert.ok(context.includes("@media (prefers-reduced-motion: no-preference)"), selector);
    assert.doesNotMatch(body, /infinite/);
    const scrollLinked = /animation-timeline:\s*--pc-record/.test(body);
    for (const part of splitSelector(selector)) {
      if (scrollLinked) {
        // Only the record's own position line reads a scroll, inside the dialog.
        assert.match(
          part,
          /^html:not\(\[data-world-effects="economy"\]\)\[data-dialog-open\] /,
          part,
        );
        assert.match(part, /::after$/, part);
      } else {
        // Full motion outside economy; economy keeps only the column's plain fade.
        assert.match(
          part,
          /^html(:not\(\[data-world-effects="economy"\]\)|\[data-world-effects="economy"\])/,
          part,
        );
        if (part.startsWith('html[data-world-effects="economy"]')) {
          assert.match(body, /animation: pc-fade /);
          assert.match(part, /#world-column-pickup\[data-closing="true"\]/);
        }
      }
    }
  }
  // The scroll-linked line sits under @supports for scroll timelines.
  const line = moving.find(({ body }) => /animation-timeline/.test(body));
  assert.ok(line.context.some((at) => at.startsWith("@supports (animation-timeline: scroll())")));
  // Keyframes: compositor-friendly properties only.
  assert.ok(keyframes.size >= 6);
  for (const [name, body] of keyframes) {
    for (const [, property] of body.matchAll(/([a-z-]+):/g)) {
      assert.ok(["opacity", "transform", "clip-path"].includes(property), `${name}: ${property}`);
    }
  }
  // What plays on a dialog element itself fades; it never transforms (the
  // Zeus button is portalled into the open dialog), and only the column's
  // closing retract clips: a clip on an opening sheet would let a quick
  // second tap reach the backdrop, which closes the record.
  for (const { selector, body } of moving) {
    for (const part of splitSelector(selector)) {
      if (
        !/(dialog(\.[\w-]+)*(:not\([^)]*\))?(\[[^\]]+\])*|#episode-pickup-dialog(\[[^\]]+\])*|#world-column-pickup(\[[^\]]+\]|:not\([^)]*\))*)(::backdrop)?$/.test(
          part,
        )
      )
        continue;
      const name = body.match(/animation:\s*([\w-]+)/)?.[1];
      assert.ok(name, part);
      assert.doesNotMatch(keyframes.get(name), /transform/, `${name} on ${part}`);
      if (!/\[data-closing="true"\]/.test(part))
        assert.doesNotMatch(keyframes.get(name), /clip-path/, `${name} on ${part}`);
    }
  }
  // The sheet fades up while its record drops in; the name strike leaves no
  // clip behind (backwards fill).
  assert.match(source, /animation: pc-fade 220ms ease-out backwards;/);
  assert.match(
    source,
    /\.form-pickup-panel,[\s\S]*?\{\s*animation: pc-drop 480ms var\(--pc-ease\) backwards;/,
  );
  assert.match(source, /animation: pc-strike 560ms 200ms [^;]* backwards;/);
  for (const [, ms] of stripComments(source).matchAll(/animation: [\w-]+ (\d+)ms/g)) {
    assert.ok(Number(ms) <= 800, ms);
  }
});

test("hover moves nothing unless motion is welcome", () => {
  const moved = rules.filter(({ body }) =>
    /(?:^|;)\s*(?:transform|translate|scale|rotate)\s*:(?!\s*none\s*(?:;|$))/.test(body),
  );
  assert.ok(moved.length >= 2, String(moved.length));
  for (const { selector, context } of moved) {
    assert.ok(
      context.some((at) => at.includes("(prefers-reduced-motion: no-preference)")),
      selector,
    );
    for (const part of splitSelector(selector)) {
      assert.match(part, /^html:not\(\[data-world-effects="economy"\]\)/, part);
    }
  }
});

test("each record has one scroller, and the phone rail never squeezes its files", () => {
  const scrollers = rules.filter(({ body }) =>
    /(?:^|;)\s*scroll-timeline:\s*--pc-record block/.test(body),
  );
  assert.equal(scrollers.length, 1);
  assert.equal(splitSelector(scrollers[0].selector).length, 4);
  assert.match(scrollers[0].body, /overflow-y: auto;/);
  assert.match(scrollers[0].body, /min-height: 0;/);
  const shrink = rules.find(({ selector }) => selector.includes(".episode-pickup-panel > *"));
  assert.ok(shrink, "the phone episode panel's children");
  assert.match(shrink.body, /flex-shrink: 0;/);
  assert.ok(shrink.context.includes("@media (max-width: 760px), (max-height: 500px)"));
});

test("controls keep 44px targets and one warm focus ring", () => {
  assert.match(source, /--pc-close: 44px;/);
  assert.doesNotMatch(source, /--pc-close: (?:[0-3]\d|4[0-3])px/);
  assert.match(source, /min-height: var\(--pc-close\);/);
  assert.match(source, /\.form-pickup-end-close \{[^}]*min-height: 48px;/);
  assert.match(source, /--pc-focus: #fff0b5;/);
  assert.match(source, /:focus-visible \{\s*outline: 2px solid var\(--pc-focus\) !important;/);
  assert.match(
    source,
    /\.episode-pickup-item:focus-visible \{\s*outline: 2px solid var\(--pc-focus\);/,
  );
});

test("forced colours get plain ink, opaque plates and system buttons", () => {
  const forced = rules.filter(({ context }) => context.includes("@media (forced-colors: active)"));
  assert.ok(forced.length >= 8, String(forced.length));
  const text = forced.map(({ selector, body }) => `${selector}{${body}}`).join("\n");
  // Chrome ink and outlined numerals fall back to CanvasText.
  assert.match(
    text,
    /#episode-pickup-title[^{]*\{[^}]*color: CanvasText;[^}]*background: none;[^}]*filter: none;/,
  );
  assert.match(text, /-webkit-text-stroke: 0;/);
  // The bar is an opaque Canvas plate; the sheets too.
  assert.match(text, /::before[^{]*\{[^}]*background: Canvas;/);
  assert.match(text, /background: Canvas !important;/);
  // Controls are system buttons.
  assert.match(text, /color: ButtonText;[^}]*background: ButtonFace !important;/);
  assert.match(text, /outline-color: Highlight !important;/);
});

test("the form records carry their section hooks, class names only", async () => {
  const stub = await read("src/components/world/manager-stub.tsx");
  for (const [hook, label] of [
    ["is-ability", "ABILITY"],
    ["is-arsenal", "ARSENAL"],
    ["is-finisher", "FINISHER"],
  ]) {
    assert.match(
      stub,
      new RegExp(
        `<section className="${hook}">\\s*<header>\\s*<span>0\\d</span>\\s*<p>${label}</p>`,
      ),
    );
  }
  // The finishers' cards take the gold edge.
  assert.match(
    source,
    /section\.is-finisher\s*>\s*div \{[^}]*border-left-color: var\(--pc-gold\);/,
  );
});
