import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/components/dream-chapter/dream-reading-room.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "room.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const capture = ast.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "captureReadingAnchor",
);
assert.ok(capture, "the reader captures the text line before typography or viewport changes");
const code = ts.transpileModule(capture.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture() {
  let reads = 0;
  const text = { nodeType: 3, textContent: "文".repeat(100), length: 100 };
  const paragraphs = [
    { getBoundingClientRect: () => ({ bottom: 150 }) },
    {
      getBoundingClientRect: () => ({ bottom: 360 }),
      childNodes: [{ nodeType: 1, textContent: "02" }, text],
    },
  ];
  const scroller = {
    scrollTop: 300,
    scrollHeight: 2000,
    clientHeight: 600,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: () => paragraphs,
  };
  const document = {
    createRange() {
      let offset = 0;
      return {
        setStart(node, next) {
          assert.equal(node, text, "the decorative folio cannot become the text anchor");
          offset = next;
        },
        setEnd() {},
        getBoundingClientRect() {
          reads += 1;
          const top = 160 + Math.floor(offset / 10) * 20;
          return { top, bottom: top + 20 };
        },
      };
    },
  };
  const captureAnchor = runInNewContext(`${code}\ncaptureReadingAnchor`, {
    document,
    Node: { TEXT_NODE: 3 },
  });
  return { captureAnchor, scroller, text, paragraphs, reads: () => reads };
}

test("reader anchors the first character on the reading line, not an earlier paragraph or folio", () => {
  const f = fixture();
  const anchor = f.captureAnchor(f.scroller);
  assert.equal(anchor.text, f.text);
  assert.equal(anchor.offset, 10);
  assert.equal(anchor.top, 80);
  assert.ok(f.reads() <= 9, "binary search avoids reading every character's layout");
});

test("reader start and absent viewports need no layout measurement", () => {
  const f = fixture();
  assert.equal(f.captureAnchor(null), null);
  f.scroller.scrollTop = 0;
  assert.equal(f.captureAnchor(f.scroller), null);
  assert.equal(f.reads(), 0);
});

test("reader captures the end explicitly so shorter and taller type both remain at the foot", () => {
  const f = fixture();
  f.scroller.scrollTop = 1399;
  const anchor = f.captureAnchor(f.scroller);
  assert.equal(anchor.end, true);
  assert.equal(f.reads(), 0);
});

test("reader tolerates an empty or non-text paragraph without making an invalid range", () => {
  const f = fixture();
  f.paragraphs[1].childNodes = [{ nodeType: 1, textContent: "02" }];
  assert.equal(f.captureAnchor(f.scroller), null);
  assert.equal(f.reads(), 0);
});

test("reader typography reflows synchronously despite global reduced-motion transitions", () => {
  const css = readFileSync(
    new URL("../src/components/dream-chapter/dream-reading-room.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.dream-reading-paper > \[data-room-paragraph\]\s*\{[^}]*transition: none !important;/,
  );
  assert.match(css, /\.dream-reading-scroll\s*\{[^}]*overflow-anchor: none;/);
});

const viewportCode = ts.transpileModule(
  ast.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        [
          "visibleParagraph",
          "captureReadingAnchor",
          "restoreReadingAnchor",
          "readParagraph",
          "watchReadingViewport",
        ].includes(node.name?.text),
    )
    .map((node) => node.getText(ast))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function resizingFixture({ observer = true } = {}) {
  let width = 360;
  let height = 537;
  let lineHeight = 24;
  let scrollTop = 0;
  let nextFrame = 0;
  const frames = new Map();
  const scrollListeners = new Set();
  const resizeListeners = new Set();
  const observers = [];
  const perLine = () => Math.max(1, Math.floor((width - 64) / 17));
  const paragraphHeight = () => Math.ceil(500 / perLine()) * lineHeight + 24;
  const paragraphTop = (index) => 200 + index * paragraphHeight();
  const texts = Array.from({ length: 12 }, (_, index) => ({
    nodeType: 3,
    textContent: "文".repeat(500),
    length: 500,
    isConnected: true,
    index,
  }));
  const paragraphs = texts.map((text, index) => ({
    childNodes: [{ nodeType: 1, textContent: String(index + 1) }, text],
    dataset: { roomParagraph: String(index + 1) },
    getBoundingClientRect: () => ({
      top: 60 + paragraphTop(index) - scrollTop,
      bottom: 60 + paragraphTop(index + 1) - 24 - scrollTop,
    }),
  }));
  const scroller = {
    get clientWidth() {
      return width;
    },
    get clientHeight() {
      return height;
    },
    get scrollHeight() {
      return paragraphTop(12) + 100;
    },
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(value) {
      scrollTop = Math.max(0, Math.min(value, this.scrollHeight - height));
    },
    getBoundingClientRect: () => ({ top: 60 }),
    querySelectorAll: () => paragraphs,
    addEventListener(_name, callback) {
      scrollListeners.add(callback);
    },
    removeEventListener(_name, callback) {
      scrollListeners.delete(callback);
    },
  };
  const document = {
    createRange() {
      let text;
      let offset;
      return {
        setStart(node, value) {
          text = node;
          offset = value;
        },
        setEnd() {},
        getBoundingClientRect() {
          const top =
            60 + paragraphTop(text.index) + Math.floor(offset / perLine()) * lineHeight - scrollTop;
          return { top, bottom: top + lineHeight };
        },
      };
    },
  };
  const api = runInNewContext(
    `${viewportCode}\n({ watchReadingViewport, captureReadingAnchor, restoreReadingAnchor })`,
    {
      document,
      Node: { TEXT_NODE: 3 },
      window: {
        addEventListener(_name, callback) {
          resizeListeners.add(callback);
        },
        removeEventListener(_name, callback) {
          resizeListeners.delete(callback);
        },
      },
      requestAnimationFrame(callback) {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame(id) {
        frames.delete(id);
      },
      ResizeObserver: observer
        ? class {
            constructor(callback) {
              this.callback = callback;
              observers.push(this);
            }
            observe() {}
            disconnect() {
              this.disconnected = true;
            }
          }
        : undefined,
    },
  );
  const pin = { current: null };
  const counts = [];
  return {
    ...api,
    scroller,
    paragraphs,
    pin,
    counts,
    frames,
    scrollListeners,
    resizeListeners,
    observers,
    mount: () => api.watchReadingViewport(scroller, pin, (no) => counts.push(no)),
    land(no) {
      scroller.scrollTop = paragraphTop(no - 1) - 24;
      pin.current = { no, top: scroller.scrollTop };
    },
    scroll(delta) {
      scroller.scrollTop += delta;
      for (const callback of scrollListeners) callback();
    },
    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      for (const callback of resizeListeners) callback();
      for (const entry of observers) if (!entry.disconnected) entry.callback();
    },
    flush() {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    },
    glyphTop(anchor) {
      const range = document.createRange();
      range.setStart(anchor.text, anchor.offset);
      return range.getBoundingClientRect().top - 60;
    },
    enlargeType() {
      lineHeight = 32;
    },
  };
}

test("viewport reflow restores the saved glyph and moves the explicit paragraph pin", () => {
  const f = resizingFixture();
  f.land(7);
  const controller = f.mount();
  f.flush();
  const anchor = f.captureReadingAnchor(f.scroller);
  const oldScroll = f.scroller.scrollTop;
  f.resize(900, 454);
  f.resize(900, 454);
  assert.equal(f.frames.size, 1, "window and observer notifications share one frame");
  f.flush();
  assert.ok(Math.abs(f.glyphTop(anchor) - anchor.top) < 1);
  assert.notEqual(f.scroller.scrollTop, oldScroll);
  assert.equal(f.pin.current.top, f.scroller.scrollTop);
  assert.equal(f.counts.at(-1), 7);
  assert.ok(f.paragraphs[6].getBoundingClientRect().bottom > 60);
  controller.dispose();
});

test("ordinary scrolling refreshes the line retained through portrait and split reflows", () => {
  const f = resizingFixture();
  f.land(7);
  const controller = f.mount();
  f.flush();
  f.scroll(1200);
  f.flush();
  assert.equal(f.pin.current, null, "the reader can leave an explicit paragraph landing");
  for (const [width, height] of [
    [760, 1180],
    [443, 834],
    [900, 454],
  ]) {
    const anchor = f.captureReadingAnchor(f.scroller);
    f.resize(width, height);
    f.flush();
    assert.ok(Math.abs(f.glyphTop(anchor) - anchor.top) < 1, `${width}x${height}`);
    assert.equal(f.counts.at(-1), anchor.text.index + 1);
  }
  controller.dispose();
});

test("a deliberate jump updates the remembered line even before its scroll event", () => {
  const f = resizingFixture();
  const controller = f.mount();
  f.flush();
  f.land(7);
  controller.remember();
  const anchor = f.captureReadingAnchor(f.scroller);
  f.resize(900, 454);
  f.flush();
  assert.ok(Math.abs(f.glyphTop(anchor) - anchor.top) < 1);
  assert.equal(f.counts.at(-1), 7);
  controller.dispose();
});

test("the top and foot survive viewport changes, including the no-observer fallback", () => {
  for (const atEnd of [false, true]) {
    const f = resizingFixture({ observer: false });
    if (atEnd) f.scroller.scrollTop = f.scroller.scrollHeight;
    const controller = f.mount();
    f.flush();
    f.resize(900, 454);
    f.flush();
    assert.equal(
      f.scroller.scrollTop,
      atEnd ? f.scroller.scrollHeight - f.scroller.clientHeight : 0,
    );
    assert.equal(f.counts.at(-1), atEnd ? 12 : 1);
    controller.dispose();
  }
});

test("disposal cancels pending work and Strict Mode remounts one live watcher", () => {
  const f = resizingFixture();
  f.land(7);
  const first = f.mount();
  first.dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.scrollListeners.size, 0);
  assert.equal(f.resizeListeners.size, 0);
  assert.equal(f.observers[0].disconnected, true);
  f.observers[0].callback();
  assert.equal(f.frames.size, 0, "an already delivered observer cannot revive disposed work");
  const second = f.mount();
  assert.equal(f.scrollListeners.size, 1);
  assert.equal(f.resizeListeners.size, 1);
  f.flush();
  assert.equal(f.counts.length, 1);
  second.dispose();
});

test("typography and viewport changes share the same glyph restoration", () => {
  const f = resizingFixture();
  f.land(7);
  const anchor = f.captureReadingAnchor(f.scroller);
  f.enlargeType();
  f.restoreReadingAnchor(f.scroller, anchor);
  assert.ok(Math.abs(f.glyphTop(anchor) - anchor.top) < 1);
  assert.match(source, /restoreReadingAnchor\(scroller, anchor\);[\s\S]*?\[size, spacing\]/);
});

const originFunction = ast.statements.find(
  (node) => ts.isFunctionDeclaration(node) && node.name?.text === "restoreReadingOrigin",
);
assert.ok(originFunction);
const originCode = ts.transpileModule(originFunction.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function originFixture() {
  const calls = [];
  const origin = { top: 320, width: 390, height: 844, pathname: "/dream-chapter" };
  const window = {
    innerWidth: 1024,
    innerHeight: 1366,
    location: { pathname: "/dream-chapter" },
    scrollX: 12,
    scrollY: 9000,
    scrollTo(position) {
      calls.push(position);
      this.scrollY = position.top;
      this.scrollX = position.left;
    },
  };
  const trigger = {
    isConnected: true,
    getBoundingClientRect: () => ({ top: 12000 - window.scrollY, height: 52 }),
  };
  const restore = runInNewContext(`${originCode}\nrestoreReadingOrigin`, { window });
  return { restore, window, trigger, origin, calls };
}

test("resized room close brings the opener back to its saved screen position synchronously", () => {
  const f = originFixture();
  f.restore(f.trigger, f.origin);
  assert.equal(f.trigger.getBoundingClientRect().top, 320);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].behavior, "instant");
  assert.equal(f.window.scrollX, 12);
  f.restore(f.trigger, f.origin);
  assert.equal(f.calls.length, 1, "a second release cannot add another scroll correction");
});

test("opener return clamps the old screen position inside a shorter viewport", () => {
  const f = originFixture();
  f.origin.top = 720;
  f.window.innerHeight = 540;
  f.restore(f.trigger, f.origin);
  assert.equal(f.trigger.getBoundingClientRect().top, 540 - 52 - 16);
  f.origin.top = -100;
  f.restore(f.trigger, f.origin);
  assert.equal(f.trigger.getBoundingClientRect().top, 16);
});

test("unchanged size, a new route or a detached opener preserves the released scroll", () => {
  for (const reason of ["same-size", "new-route", "detached", "no-origin"]) {
    const f = originFixture();
    if (reason === "same-size") {
      f.window.innerWidth = f.origin.width;
      f.window.innerHeight = f.origin.height;
    }
    if (reason === "new-route") f.window.location.pathname = "/world";
    if (reason === "detached") f.trigger.isConnected = false;
    f.restore(f.trigger, reason === "no-origin" ? null : f.origin);
    assert.equal(f.calls.length, 0, reason);
    assert.equal(f.window.scrollY, 9000, reason);
  }
});

test("opener snapshot precedes freezing and correction runs once only for an explicit close", () => {
  const captureAt = source.indexOf("const origin: ReadingOrigin");
  const lockAt = source.indexOf("acquireViewportScrollLock({ freezeBody: true })");
  assert.ok(captureAt > 0 && captureAt < lockAt);
  const releaseAt = source.indexOf("const release = () =>");
  const restoreAt = source.indexOf("restoreReadingOrigin(trigger, origin)");
  assert.ok(source.indexOf("releaseScroll();", releaseAt) < restoreAt);
  assert.match(source, /if \(released\) return;\s*released = true;/);
  assert.match(
    source,
    /if \(closing\.current && !historyDismissed\) restoreReadingOrigin\(trigger, origin\);/,
  );
  assert.match(source, /historyDismissed = true;\s*release\(\);\s*close\(\);/);
  assert.match(source, /if \(window\.location\.pathname === origin\?\.pathname\)/);
  assert.doesNotMatch(originCode, /requestAnimationFrame|setTimeout|queueMicrotask|Promise/);
});
