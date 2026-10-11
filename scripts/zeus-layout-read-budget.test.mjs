import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("src/components/zeus-button.tsx");
const compile = (text) =>
  ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
const duplicateCheck =
  "if (walked.has(element) || element.parentElement?.closest(selector)) continue;";
const boxCheck = "if (!meetsAny(element.getBoundingClientRect(), zones)) continue;";

// Execute the actual text pass and candidate-selection callback. The reference
// differs only in the former read ordering, not a parallel placement policy.
function runtime(reference = false) {
  let text = source;
  if (reference) {
    const earlier = text.indexOf(duplicateCheck);
    const later = text.indexOf(boxCheck, earlier);
    assert.ok(earlier > 0 && later > earlier, "duplicate rejection precedes the box read");
    text = text.slice(0, earlier) + boxCheck + text.slice(earlier + duplicateCheck.length);
    const second = text.indexOf(boxCheck, earlier + boxCheck.length);
    assert.ok(second > earlier, "the existing layout read is present after duplicate rejection");
    text = text.slice(0, second) + duplicateCheck + text.slice(second + boxCheck.length);
    assert.ok(text.includes(".filter(drawn)"), "undrawn controls are filtered before measurement");
    text = text.replace(".filter(drawn)", "");
  }
  const start = text.indexOf("const avoidCriticalControls = useCallback(");
  const end = text.indexOf("const setVisualCenter = useCallback", start);
  assert.ok(start > 0 && end > start);
  const declarations = text.slice(
    text.indexOf("const ZEUS_AVOID_SELECTOR"),
    text.indexOf("// The stylesheet has no glide"),
  );
  const geometry = {};
  runInNewContext(compile(read("src/lib/zeus-drag.ts")), { exports: geometry });
  const exports = {};
  const fixture = { document: null, window: null };
  class Element {
    constructor(id, rect, { drawn = true, style = {}, selectors = [] } = {}) {
      Object.assign(this, {
        id,
        rect,
        style,
        selectors: new Set(selectors),
        children: [],
        nodes: [],
        parentElement: null,
        reads: 0,
        checks: [],
      });
      this.checkVisibility = (options) => {
        this.checks.push(options);
        return drawn;
      };
    }
    getBoundingClientRect() {
      this.reads++;
      return this.rect;
    }
    closest(selector) {
      return this.selectors.has(selector) ? this : (this.parentElement?.closest(selector) ?? null);
    }
    contains(element) {
      return this.children.some((child) => child === element || child.contains(element));
    }
    append(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    word(value, rect = this.rect) {
      this.nodes.push({ nodeValue: value, parentElement: this, rect });
      return this;
    }
  }
  class Button extends Element {}
  const context = {
    exports,
    createContext: () => ({}),
    useCallback: (fn) => fn,
    clampZeusCenter: geometry.clampZeusCenter,
    Element,
    HTMLElement: Element,
    HTMLButtonElement: Button,
    NodeFilter: { SHOW_TEXT: 4 },
    get document() {
      return fixture.document;
    },
    get window() {
      return fixture.window;
    },
  };
  runInNewContext(
    compile(`${declarations}
    exports.words = ZEUS_AVOID_TEXT_SELECTOR;
    exports.display = ZEUS_DISPLAY_TEXT_SELECTOR;
    exports.end = ZEUS_END_TEXT_SELECTOR;
    exports.controls = ZEUS_AVOID_SELECTOR;
    exports.readText = readAvoidText;
    exports.choose = (context) => {
      const { buttonRef, getViewport, restingSize, readBounds, stepAway, droppedHere } = context;
      ${text.slice(start, end)}
      return avoidCriticalControls(context.preferred);
    };`),
    context,
  );
  return { exports, fixture, Element, Button };
}

const rect = (left, top, width = 80, height = 24) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

function scene(reference, { pageEnd = false, dialog = false, unsupported = false } = {}) {
  const api = runtime(reference);
  const { exports: policy, fixture, Element, Button } = api;
  const button = new Button("zeus", rect(282, 645, 60, 60));
  const elements = [];
  const item = (id, box, selectors, options = {}) => {
    const element = new Element(id, box, { ...options, selectors });
    if (unsupported) element.checkVisibility = undefined;
    elements.push(element);
    return element;
  };
  const title = item("title", rect(284, 650), [policy.words]).word("TITLE");
  const nested = title.append(
    item("nested-heading", rect(284, 676), [policy.words]).word("NESTED"),
  );
  const both = item("bold-heading", rect(282, 570), [policy.words, policy.display], {
    style: { fontSize: "32px" },
  }).word("BOTH");
  const small = item("small-bold", rect(282, 550), [policy.display]).word("small");
  item("hidden-title", rect(282, 540), [policy.words], { style: { visibility: "hidden" } }).word(
    "hidden",
  );
  item("transparent-title", rect(282, 530), [policy.words], { style: { opacity: "0" } }).word(
    "transparent",
  );
  item("outside", rect(-500, -500), [policy.words]).word("outside");
  const outsideParent = item("outside-parent", rect(-500, -500), [policy.words]);
  const excludedChild = outsideParent.append(
    item("outside-parent-heading", rect(284, 676), [policy.words]).word("excluded"),
  );
  const closedText = item("closed-text", rect(0, 0, 0, 0), [policy.words], { drawn: false }).word(
    "closed",
  );
  const pending = item("auto-before-paint", rect(282, 485), [policy.words]).word("AUTO");
  if (!unsupported)
    pending.checkVisibility = (options) => {
      pending.checks.push(options);
      return options?.contentVisibilityAuto !== true;
    };
  const paragraph = item("paragraph", rect(282, 395), [policy.end]).word("END");
  paragraph.append(item("nested-span", rect(282, 421), [policy.end]).word("SPAN"));
  const hiddenChild = title.append(
    item("closed-child", rect(0, 0, 0, 0), [], { drawn: false }).word("hidden child"),
  );
  const clipped = title.append(
    item("screen-reader", rect(284, 650, 1, 1), []).word("screen reader"),
  );
  const controls = [
    new Button("visible-control", rect(282, 646, 70, 45)),
    new Button("closed-control", rect(0, 0, 0, 0), { drawn: false }),
    new Button("disabled-control", rect(282, 575, 70, 45)),
    new Button("offscreen-control", rect(-500, -500, 70, 45)),
  ];
  controls[2].disabled = true;
  if (unsupported)
    controls.forEach((control) => {
      control.checkVisibility = undefined;
    });
  const all = [...elements, ...controls];
  const query = (selector) =>
    selector === policy.controls
      ? controls
      : elements.filter((element) => element.selectors.has(selector));
  const dialogRoot = { querySelectorAll: query };
  button.closest = (selector) => (dialog && selector === "dialog" ? dialogRoot : null);
  const document = {
    documentElement: {},
    scrollingElement: { scrollTop: pageEnd ? 1156 : 0, scrollHeight: 2000 },
    querySelectorAll: (selector) => {
      assert.equal(dialog, false, "a dialog placement never scans covered document text/controls");
      return query(selector);
    },
    elementFromPoint: () => null,
    createRange() {
      let node;
      return {
        selectNodeContents(next) {
          node = next;
        },
        getClientRects: () => [node.rect],
      };
    },
    createTreeWalker(element) {
      const nodes = (current) => [...current.nodes, ...current.children.flatMap(nodes)];
      const list = nodes(element);
      let index = 0;
      return { nextNode: () => list[index++] ?? null };
    },
  };
  fixture.document = document;
  fixture.window = {
    innerHeight: 844,
    getComputedStyle: (element) => ({
      visibility: "visible",
      opacity: "1",
      pointerEvents: "auto",
      fontSize: "16px",
      position: "static",
      ...element.style,
    }),
  };
  const zones = [rect(265, 360, 120, 400)];
  const words = plain(policy.readText(button, zones, pageEnd));
  const viewport = { width: 390, height: 844, offsetLeft: 0, offsetTop: 0 };
  const preferred = { x: 312, y: 675 };
  const chosen = plain(
    policy.choose({
      buttonRef: { current: button },
      getViewport: () => viewport,
      restingSize: () => ({ width: 60, height: 60 }),
      readBounds: () => ({ minX: 42, maxX: 348, minY: 42, maxY: 802 }),
      stepAway: { current: null },
      droppedHere: { current: false },
      preferred,
    }),
  );
  const expectedWords = [title.rect, nested.rect, both.rect, pending.rect];
  if (pageEnd && !dialog) expectedWords.push(paragraph.rect, paragraph.children[0].rect);
  return {
    words,
    expectedWords,
    chosen,
    preferred,
    all,
    nested,
    excludedChild,
    both,
    small,
    closedText,
    pending,
    hiddenChild,
    clipped,
    controls,
  };
}

for (const pageEnd of [false, true]) {
  for (const dialog of [false, true]) {
    test(`identical glyphs and position with fewer reads (end=${pageEnd}, dialog=${dialog})`, () => {
      const previous = scene(true, { pageEnd, dialog });
      const current = scene(false, { pageEnd, dialog });
      assert.deepEqual(current.words, previous.words);
      assert.deepEqual(
        current.words,
        current.expectedWords,
        "the selected glyph boxes also match an independent explicit expectation",
      );
      assert.deepEqual(current.chosen, previous.chosen);
      assert.deepEqual(
        current.chosen,
        { x: 312, y: 763 },
        "same-side steps retain their exact candidate order",
      );
      assert.equal(
        current.controls[0].reads,
        1,
        "candidate selection measures the visible control",
      );
      assert.ok(current.words.length >= 4, "the actual glyph pass remains active");
      assert.notDeepEqual(
        current.chosen,
        current.preferred,
        "the visible control/words still cause a dodge",
      );
      assert.equal(
        current.nested.reads,
        previous.nested.reads - 2,
        "nested heading's two redundant element-box reads are removed, not its glyphs",
      );
      assert.equal(
        current.both.reads,
        previous.both.reads - 2,
        "a heading also matching display text is measured once per pass",
      );
      assert.equal(
        current.excludedChild.reads,
        0,
        "a matching ancestor still excludes its descendant even when the ancestor lies outside all candidates",
      );
      assert.equal(current.controls[1].reads, 0, "undrawn control never needs geometry");
      assert.equal(previous.controls[1].reads, 1);
      assert.equal(current.controls[2].reads, 0, "disabled filter still precedes all geometry");
      const oldReads = previous.all.reduce((count, element) => count + element.reads, 0);
      const newReads = current.all.reduce((count, element) => count + element.reads, 0);
      assert.equal(
        oldReads - newReads,
        pageEnd && !dialog ? 9 : 7,
        "each redundant box read is removed in both glyph passes, plus the undrawn control",
      );
      for (const element of current.all)
        assert.ok(
          element.checks.every((options) => options === undefined),
          "checkVisibility remains option-free for pre-paint auto content",
        );
      assert.ok(
        current.words.some((box) => box.top === current.pending.rect.top),
        "visible auto content counts even before its first paint",
      );
    });
  }
}

test("the no-checkVisibility fallback retains all previous glyphs and control behavior", () => {
  const previous = scene(true, { pageEnd: true, unsupported: true });
  const current = scene(false, { pageEnd: true, unsupported: true });
  assert.deepEqual(current.words, previous.words);
  assert.deepEqual(current.chosen, previous.chosen);
  assert.equal(
    current.controls[1].reads,
    1,
    "unsupported browsers retain the old box-based exclusion",
  );
});

test("non-drawn child text and 1px screen-reader text remain excluded", () => {
  const current = scene(false, { pageEnd: true });
  assert.equal(current.closedText.reads, 0);
  assert.equal(current.hiddenChild.reads, 0);
  assert.equal(
    current.clipped.reads,
    2,
    "holder is checked in each of the text and placement passes",
  );
  assert.ok(!current.words.some((box) => box.width === 1));
});
