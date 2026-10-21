import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { REXONANCE_ENTRY_CALLS } from "../src/lib/rexonance-calls.ts";

/* Sweep 2 (2026-10-21), the suit-up's UI: the opening call on phones (F04),
   readiness in the pinned HUD's hint (F21), unlit lines and parts that stay
   readable (F22), the runway's script for assistive technology (F23), the
   chant two beats to a line (F81), the guide's copy after Reduce Motion
   comes back (F82), the page's word 形態 in the phases (F83) and the way
   back to this page's own top (F92). The entry call's jolt (F84) is pinned
   in rexonance-suitup.test.mjs. */

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const zenith = strip(read("src/styles-rexonance-zenith.css"));
const page = read("src/components/rexonance-saga/rexonance-saga.tsx");
const guideSource = read("src/components/rexonance-saga/rexonance-assembly-guide.tsx");

const flat = (text) =>
  text.replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").trim();

function parse(text) {
  const rules = [];
  const stack = [];
  let prelude = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") {
      const head = flat(prelude);
      prelude = "";
      if (/^@keyframes/.test(head)) {
        let depth = 1;
        let end = index + 1;
        for (; end < text.length && depth > 0; end += 1) {
          if (text[end] === "{") depth += 1;
          if (text[end] === "}") depth -= 1;
        }
        index = end - 1;
        continue;
      }
      if (head.startsWith("@")) {
        stack.push(head);
        continue;
      }
      const end = text.indexOf("}", index);
      rules.push({ selector: head, body: flat(text.slice(index + 1, end)), context: [...stack] });
      index = end;
      continue;
    }
    if (character === "}") {
      stack.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
  }
  return rules;
}

const rules = parse(zenith);
const declaration = (body, property) =>
  body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))?.[1].trim();
const PAGE = 'html[data-family="special"] body .rxs-page.rxs-page.rxs-rexonance-page';
/** The rules whose selector ends with `tail`, at the top level or in `media`. */
const find = (tail, media) =>
  rules.filter(
    ({ selector, context }) =>
      selector.endsWith(tail) &&
      (media === undefined ? context.length === 0 : context.some((query) => media.test(query))),
  );
const one = (tail, media) => {
  const found = find(tail, media);
  assert.equal(found.length, 1, `one rule for ${tail}`);
  return found[0];
};

// WCAG 2.x relative luminance and contrast; an opacity over the runway's
// floor is composited in sRGB, as the browser does.
const luminance = ([r, g, b]) => {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const RUNWAY = [3, 7, 13]; // #03070d, the runway's floor under the call
const CALL = [242, 247, 251]; // the call's and the parts' white
const contrast = (opacity) => {
  const shown = CALL.map((value, index) => RUNWAY[index] + opacity * (value - RUNWAY[index]));
  return (luminance(shown) + 0.05) / (luminance(RUNWAY) + 0.05);
};
const opacity = (tail, media) => Number(declaration(one(tail, media).body, "opacity"));

test("F04: under 420 px the opening call breaks where its words do, never past the frame", () => {
  // The call's text carries the break (Ultra DEUS！ / REXONANCE！).
  assert.equal(REXONANCE_ENTRY_CALLS[0], "Ultra DEUS！\nREXONANCE！");
  const phone = one(
    ".rxs-page.rxs-page.rxs-rexonance-page > .rzn-suitup[data-rzn-state] .rzn-line:first-child .rzn-chip",
    /\(max-width: 419\.98px\)/,
  );
  const query = phone.context.join(" ");
  assert.match(query, /prefers-reduced-motion: no-preference/, "the motion layout only");
  assert.match(query, /forced-colors: none/);
  assert.match(phone.selector, /^html\[data-family="special"\]:not\(\[data-world-effects="economy"\]\)/);
  assert.equal(declaration(phone.body, "white-space"), "pre-line");
  assert.equal(declaration(phone.body, "font-size"), undefined, "the call keeps its size");
  // Wider screens keep the one line.
  assert.equal(declaration(one(`${PAGE} > .rzn-suitup .rzn-chip`).body, "white-space"), "nowrap");
  // The phone's lines share one cell: the rows pack at its top.
  assert.equal(
    declaration(one(`${PAGE} > .rzn-suitup .rzn-line`).body, "align-content"),
    "flex-start",
  );
});

test("F21: while the scene prepares, the hint says so instead of asking for the scroll", () => {
  assert.match(
    page,
    /<p className="rzn-hint">\s*<span className="rzn-hint-live">スクロールで装着<\/span>\s*<span className="rzn-hint-wait">装着準備中<\/span>\s*<\/p>/,
  );
  const hide = rules.find(
    ({ selector, context }) =>
      context.length === 0 &&
      selector.includes('.rzn-suitup:not([data-rzn-state="loading"]) .rzn-hint-wait') &&
      selector.includes('.rzn-suitup[data-rzn-state="loading"] .rzn-hint-live'),
  );
  assert.ok(hide, "one state shows one word");
  assert.equal(declaration(hide.body, "display"), "none");
});

test("F22: unlit and passed lines and the parts stay readable; the lit line stays brightest", () => {
  const state = `${PAGE} > .rzn-suitup[data-rzn-state]`;
  const unlit = opacity(`${state} .rzn-chip:not([data-on])`);
  const passedChip = opacity(`${state} .rzn-line[data-done] .rzn-chip`);
  const passedLine = opacity(`${state} .rzn-line[data-done]`);
  const part = opacity(`${state} .rzn-part:not([data-on])`);
  // The chant's lines are 14-20 px: normal text, 4.5:1 (as are the 12 px parts).
  assert.ok(contrast(unlit) >= 4.5, `unlit ${contrast(unlit).toFixed(2)}:1`);
  assert.ok(contrast(passedLine * passedChip) >= 4.5, `passed ${contrast(passedLine * passedChip).toFixed(2)}:1`);
  assert.ok(contrast(part) >= 4.5, `parts ${contrast(part).toFixed(2)}:1`);
  assert.ok(unlit < 1 && passedLine * passedChip < 1 && part < 1, "dimmed below the lit line");
  // The unlit chips still sit a little low until the call reaches them.
  assert.equal(declaration(one(`${state} .rzn-chip:not([data-on])`).body, "translate"), "0 0.14em");
  // Once the form has formed the side information yields, above the floor.
  const formed = `${PAGE} > .rzn-suitup[data-rzn-form-complete]`;
  const side = opacity(`${formed} :is(.rzn-readout, .rzn-nanites, .rzn-parts)`);
  const lines = opacity(`${formed} .rzn-lines`);
  assert.ok(side < 1 && lines < 1, "the yield stays");
  assert.ok(contrast(side) >= 4.5, `yielded parts ${contrast(side).toFixed(2)}:1`);
  assert.ok(
    contrast(lines * passedLine * passedChip) >= 4.5,
    `yielded passed line ${contrast(lines * passedLine * passedChip).toFixed(2)}:1`,
  );
});

test("F81: the chant runs two beats to a line, never three and one", () => {
  const chant = `${PAGE} > .rzn-suitup .rzn-line:is(:nth-child(3), :nth-child(4))`;
  const marker = one(`${chant}::after`);
  assert.equal(declaration(marker.body, "content"), '""');
  assert.equal(declaration(marker.body, "flex"), "0 0 100%", "a full-width break");
  assert.equal(declaration(marker.body, "order"), "1");
  assert.equal(declaration(marker.body, "height"), "0");
  assert.equal(declaration(one(`${chant} > .rzn-chip:nth-child(n + 3)`).body, "order"), "2");
  // The beats still wrap where two do not fit.
  assert.equal(declaration(one(`${PAGE} > .rzn-suitup .rzn-line`).body, "flex-wrap"), "wrap");
  // Both chant calls are four beats each.
  const chants = REXONANCE_ENTRY_CALLS.slice(2, 4).map(
    (call) => call.match(/SA-GA！DEUS！|REXONANCE！/g).length,
  );
  assert.deepEqual(chants, [4, 4]);
});

// The guide, transpiled, with a hook runtime small enough to drive by hand:
// state persists across renders, effects run once on the first render.
function loadGuide() {
  const exports = {};
  const hooks = { state: [], effects: [], index: 0 };
  runInNewContext(
    ts.transpileModule(guideSource, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      Event,
      MutationObserver: class {
        constructor(callback) {
          hooks.observer = { callback, options: null, disconnected: false };
        }
        observe(target, options) {
          hooks.observer.target = target;
          hooks.observer.options = options;
        }
        disconnect() {
          hooks.observer.disconnected = true;
        }
      },
      require(name) {
        if (name === "react")
          return {
            ...React,
            useState(initial) {
              const slot = hooks.index++;
              if (!(slot in hooks.state)) hooks.state[slot] = initial;
              return [
                hooks.state[slot],
                (value) => {
                  hooks.state[slot] = typeof value === "function" ? value(hooks.state[slot]) : value;
                },
              ];
            },
            useEffect(effect) {
              const slot = hooks.index++;
              if (!(slot in hooks.effects)) hooks.effects[slot] = effect;
            },
          };
        return require(name);
      },
    },
  );
  const render = (props) => {
    hooks.index = 0;
    exports.RexonanceAssemblyGuide(props);
    for (const [slot, effect] of hooks.effects.entries()) {
      if (typeof effect === "function") {
        hooks.effects[slot] = effect() || true;
      }
    }
    hooks.index = 0;
    return renderToStaticMarkup(exports.RexonanceAssemblyGuide(props));
  };
  return { exports, hooks, render };
}

const fakeRunway = (attributes) => {
  const runway = {
    attributes: { ...attributes },
    get dataset() {
      const set = {};
      for (const [name, value] of Object.entries(this.attributes))
        set[name.replace(/^data-/, "").replace(/-(\w)/g, (_, c) => c.toUpperCase())] = value;
      return set;
    },
    hasAttribute(name) {
      return name in this.attributes;
    },
    set(name, value) {
      if (value === null) delete this.attributes[name];
      else this.attributes[name] = value;
    },
    dispatchEvent() {},
  };
  return runway;
};
const statusOf = (html) =>
  html.match(/<p class="rxs-assembly-status" role="status"[^>]*>([^<]*)<\/p>/)?.[1];
const announcementOf = (html) =>
  html.match(/<div class="rxk-sr">[\s\S]*<p role="status" aria-live="polite" aria-atomic="true">([^<]*)<\/p><\/div>/)?.[1];

test("F23: the guide lists the runway's phases and call for assistive technology", () => {
  const { render, hooks } = loadGuide();
  const runway = fakeRunway({ "data-rzn-load": "waiting" });
  const html = render({ runwayRef: { current: runway }, calls: REXONANCE_ENTRY_CALLS });
  const hidden = html.match(/<div class="rxk-sr">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(hidden, "a visually hidden script");
  const lists = [...hidden.matchAll(/<ol aria-label="([^"]+)">([\s\S]*?)<\/ol>/g)].map(([, label, items]) => [
    label,
    [...items.matchAll(/<li>([^<]*)<\/li>/g)].map(([, text]) => text),
  ]);
  assert.deepEqual(lists, [
    [
      "装着の流れ",
      [
        "01 構成情報を読み込み",
        "02 装甲を装着",
        "03 構造を固定",
        "04 出力を起動",
        "05 選択形態へ進化",
        "06 装着完了",
      ],
    ],
    ["変身コール", REXONANCE_ENTRY_CALLS.map((call) => call.replace(/\s+/g, " "))],
  ]);
  assert.doesNotMatch(html, /aria-hidden/);
  // One polite announcement as the suit completes; none on the phases between.
  assert.deepEqual([...hooks.observer.options.attributeFilter].sort(), [
    "data-rzn-load",
    "data-rzn-phase",
    "data-rzn-state",
  ]);
  const step = (changes) => {
    for (const [name, value] of Object.entries(changes)) runway.set(name, value);
    hooks.observer.callback();
    return render({ runwayRef: { current: runway }, calls: REXONANCE_ENTRY_CALLS });
  };
  let frame = step({ "data-rzn-load": "ready", "data-rzn-state": "live", "data-rzn-phase": "assemble" });
  assert.equal(announcementOf(frame), "");
  frame = step({ "data-rzn-phase": "evolve" });
  assert.equal(announcementOf(frame), "");
  frame = step({ "data-rzn-phase": "complete" });
  assert.equal(announcementOf(frame), "装着完了。上へ戻ると分解します。");
  assert.equal(statusOf(frame), "準備完了。下へ進むと装着、上へ戻ると分解します。", "the visible line holds");
  frame = step({ "data-rzn-phase": "ignite" });
  assert.equal(announcementOf(frame), "");
  // The page hands the guide its call; the runway itself stays hidden, and
  // its phase captions come from the guide's one list.
  assert.match(page, /<RexonanceAssemblyGuide runwayRef=\{runwayRef\} calls=\{REXONANCE_ENTRY_CALLS\} \/>/);
  assert.match(page, /className="rzn-suitup"\s+aria-hidden="true"/);
  assert.match(
    page,
    /\{REXONANCE_ASSEMBLY_PHASES\.map\(\(\{ phase, step, label \}\) => \(\s*<span key=\{phase\} data-phase=\{phase\}>\s*<b>\{step\}<\/b>\s*\{label\}\s*<\/span>\s*\)\)\}/,
  );
});

test("F82: the stand-in on screen never reads as the reduced-motion still", () => {
  const { render, hooks } = loadGuide();
  const WAITING = "表示設定に合わせて変身演出を準備します。";
  // Reduce Motion on: the still and its copy; off again with the reader
  // above the runway: the undersuit stands in (data-rzn-state) while the
  // load flag still says static.
  const runway = fakeRunway({ "data-rzn-load": "static" });
  const step = (changes) => {
    for (const [name, value] of Object.entries(changes)) runway.set(name, value);
    hooks.observer.callback();
    return statusOf(render({ runwayRef: { current: runway } }));
  };
  assert.match(statusOf(render({ runwayRef: { current: runway } })), /^現在は完成図を表示しています。/);
  assert.equal(step({ "data-rzn-state": "loading" }), WAITING);
  // The still again (the stand-in gone): its own copy.
  assert.match(step({ "data-rzn-state": null }), /^現在は完成図を表示しています。/);
  // The other states print as they are; an unknown one waits.
  assert.equal(step({ "data-rzn-load": "ready", "data-rzn-state": "live" }), "準備完了。下へ進むと装着、上へ戻ると分解します。");
  assert.equal(step({ "data-rzn-load": "preparing" }), "装甲とナノマシンの配置を準備しています。");
  assert.equal(step({ "data-rzn-load": "unknown" }), WAITING);
  assert.equal(step({ "data-rzn-load": null, "data-rzn-state": null }), WAITING);
});

test("F83: the phases call the forms by the page's word, 形態", () => {
  assert.doesNotMatch(page + guideSource, /選択フォーム/);
  assert.match(guideSource, /\{ phase: "evolve", step: "05", label: "選択形態へ進化" \}/);
});

test("F92: the end card leads with a way back to this page's own top", () => {
  const footer = page.slice(page.lastIndexOf("<footer"), page.lastIndexOf("</footer>"));
  const top = footer.indexOf('<p className="rxs-footer-top">');
  assert.ok(top > 0, "the link sits in the end card");
  assert.ok(top < footer.indexOf("<div>"), "first in its reading order");
  assert.match(
    footer,
    /<p className="rxs-footer-top">\s*<a href="#top">\s*<span>ページの先頭へ<\/span>\s*<i aria-hidden="true">↑<\/i>\s*<\/a>\s*<\/p>/,
  );
  // The page's main is the target the native jump lands on.
  assert.match(page, /<main\s+ref=\{setPageRef\}\s+id="top"/);
  const holder = one(`${PAGE} > .rxs-footer > .rxs-footer-top`);
  assert.equal(declaration(holder.body, "position"), "absolute");
  const link = one(`${PAGE} > .rxs-footer > .rxs-footer-top > a`);
  assert.equal(declaration(link.body, "min-block-size"), "44px");
  assert.equal(declaration(link.body, "min-inline-size"), "44px");
  assert.match(declaration(link.body, "font"), /^700 13px/);
  const ring = one(`${PAGE} > .rxs-footer > .rxs-footer-top > a:focus-visible`);
  assert.match(declaration(ring.body, "outline"), /^2px solid/);
  assert.equal(declaration(ring.body, "outline-offset"), "3px");
});
