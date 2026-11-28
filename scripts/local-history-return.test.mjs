import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const code = ts.transpileModule(read("src/lib/local-history-return.ts"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadHelper() {
  const context = { exports: {} };
  runInNewContext(code, context);
  return context.exports;
}

function historyWindow() {
  const origin = "http://localhost";
  const environment = new EventTarget();
  const frames = new Map();
  let frameId = 0;
  Object.assign(environment, {
    location: new URL(origin),
    history: { state: null },
    requestAnimationFrame(callback) {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
  });
  return {
    environment,
    enter(path, key) {
      environment.location = new URL(path, origin);
      environment.history.state = key ? { __TSR_key: key } : null;
    },
    pop() {
      environment.dispatchEvent(new Event("popstate"));
    },
    hashChange() {
      environment.dispatchEvent(new Event("hashchange"));
    },
    paint() {
      for (const [id, callback] of frames) {
        frames.delete(id);
        callback();
      }
    },
  };
}

test("Final Stage reads Rex Loi on return to the matching characters entry only", () => {
  const { rememberLocalHistoryReturn, readLocalHistoryReturn } = loadHelper();
  assert.equal(readLocalHistoryReturn(), null, "SSR starts at the default cast");

  const { environment, enter } = historyWindow();
  const source = "/final-stage#characters";
  enter(source, "cast-original");
  assert.equal(readLocalHistoryReturn(environment), null);
  rememberLocalHistoryReturn({ value: "rex-loi" }, environment);
  enter("/managers/rex-loi", "dossier");
  assert.equal(readLocalHistoryReturn(environment), null);
  enter(source, "cast-original");
  assert.equal(readLocalHistoryReturn(environment)?.value, "rex-loi");
  assert.equal(loadHelper().readLocalHistoryReturn(environment), null, "reload starts fresh");
  enter(source, "cast-fresh");
  assert.equal(readLocalHistoryReturn(environment), null, "a new visit still opens Yuma");
  enter("/final-stage#story", "cast-original");
  assert.equal(readLocalHistoryReturn(environment), null, "another URL cannot reuse the selection");
});

function chapterIndex() {
  const { mountChapterHistoryReturn } = loadHelper();
  const browser = historyWindow();
  const calls = [];
  let indexTop = 125;
  browser.environment.innerHeight = 375;
  browser.environment.scrollY = 0;
  browser.environment.scrollBy = (options) => {
    assert.equal(options.behavior, "instant");
    indexTop -= options.top;
    calls.push(["scroll", options.top]);
  };
  browser.environment.scrollTo = (options) => {
    assert.equal(options.behavior, "instant");
    browser.environment.scrollY = options.top;
    calls.push(["scroll to", options.top]);
  };
  const makeLinks = (fixed) => ["#p14", "#stages"].map((hash) => ({
    get href() { return new URL(hash, browser.environment.location).href; },
    getAttribute: () => hash,
    getBoundingClientRect: () => fixed
      ? { top: 0, bottom: 48, height: 48 }
      : { top: indexTop, bottom: indexTop + 124, height: 124 },
    focus: (options) => calls.push([fixed ? `bar ${hash}` : hash, options.preventScroll]),
  }));
  const links = makeLinks(false);
  const barLinks = makeLinks(true);
  const bar = new EventTarget();
  bar.querySelectorAll = () => barLinks;
  const nav = new EventTarget();
  nav.querySelectorAll = () => links;
  nav.ownerDocument = {
    activeElement: null,
    getElementById: (id) => ({ focus: (options) => calls.push([id, options.preventScroll]) }),
  };
  const cleanup = mountChapterHistoryReturn(nav, bar, browser.environment);
  return {
    ...browser,
    calls,
    cleanup,
    setIndexTop(value) {
      indexTop = value;
    },
    focusIndexLink(index) {
      nav.ownerDocument.activeElement = links[index];
    },
    activate(index, properties = {}, fixed = false) {
      const controls = fixed ? barLinks : links;
      const event = new Event("click", { cancelable: true });
      Object.defineProperties(event, {
        button: { value: 0 },
        detail: { value: 0 }, // Enter emits a click.
        target: { value: { closest: () => controls[index] } },
        ...Object.fromEntries(
          Object.entries(properties).map(([name, value]) => [name, { value }]),
        ),
      });
      return (fixed ? bar : nav).dispatchEvent(event);
    },
  };
}

test("Extreme restores the P14 index link without scrolling on Back and repeated Back", () => {
  const index = chapterIndex();
  index.enter("/extreme-saga", "index");
  assert.equal(index.activate(0), true, "the browser can follow the native link");

  index.enter("/extreme-saga#p14");
  index.pop();
  index.enter("/extreme-saga#p14", "chapter");
  index.hashChange();
  index.paint();
  assert.deepEqual(index.calls, [], "fresh fragment entry keeps native focus");

  index.enter("/extreme-saga", "index");
  index.pop();
  index.paint();
  assert.deepEqual(index.calls, [["#p14", true]]);

  index.enter("/extreme-saga#p14", "chapter");
  index.pop();
  index.paint();
  assert.equal(index.calls.length, 1, "Forward into the chapter keeps native focus");
  index.enter("/extreme-saga", "index");
  index.pop();
  index.paint();
  assert.deepEqual(index.calls, [["#p14", true], ["#p14", true]]);
});

test("Extreme Forward releases a stale index focus to the destination chapter without scrolling", () => {
  const index = chapterIndex();
  index.enter("/extreme-saga", "index");
  index.activate(0);
  index.enter("/extreme-saga#p14", "chapter");
  index.pop();
  index.paint();

  index.enter("/extreme-saga", "index");
  index.pop();
  index.paint();
  index.focusIndexLink(1);

  index.enter("/extreme-saga#p14", "chapter");
  index.pop();
  index.paint();
  assert.deepEqual(index.calls, [["#p14", true], ["p14", true]]);
  index.cleanup();
});

test("Extreme Back returns to the saved index position when native scrolling leaves it offscreen", () => {
  const index = chapterIndex();
  index.enter("/extreme-saga", "index");
  index.activate(0);
  index.enter("/extreme-saga#p14", "chapter");
  index.pop();
  index.paint();
  index.setIndexTop(125 - 2616);

  index.enter("/extreme-saga", "index");
  index.pop();
  index.paint();
  assert.deepEqual(index.calls, [["scroll", -2616], ["#p14", true]]);
  index.cleanup();
});

test("Extreme ignores modified links, new visits, and a return interrupted by leaving the page", () => {
  const index = chapterIndex();
  index.enter("/extreme-saga", "index");
  index.activate(1, { ctrlKey: true });
  index.pop();
  index.paint();
  assert.deepEqual(index.calls, []);

  index.activate(1);
  index.enter("/extreme-saga", "fresh-index");
  index.pop();
  index.paint();
  assert.deepEqual(index.calls, []);

  index.enter("/extreme-saga", "index");
  index.pop();
  index.enter("/world", "world");
  index.paint();
  assert.deepEqual(index.calls, []);

  index.enter("/extreme-saga", "index");
  index.pop();
  index.cleanup();
  index.paint();
  index.pop();
  index.paint();
  assert.deepEqual(index.calls, []);
});

test("Extreme restores an opener only when returning from the exact chapter visit it opened", () => {
  const index = chapterIndex();
  index.enter("/extreme-saga", "index");
  index.activate(0);
  index.enter("/extreme-saga#p14", "original");
  index.pop();
  index.paint();
  index.enter("/extreme-saga", "index");
  index.pop();
  index.paint();
  assert.deepEqual(index.calls, [["#p14", true]]);

  index.enter("/extreme-saga#p14", "another-visit");
  index.pop();
  index.paint();
  index.setIndexTop(-2491);
  index.enter("/extreme-saga", "index");
  index.pop();
  index.paint();
  assert.deepEqual(index.calls, [["#p14", true]], "a separate entry keeps native restoration");
  index.cleanup();
});

test("Extreme Back from the fixed bar restores its own control and departure scroll", () => {
  const index = chapterIndex();
  index.enter("/extreme-saga", "index");
  index.activate(0);
  index.enter("/extreme-saga#p14", "original");
  index.pop();
  index.paint();
  index.enter("/extreme-saga", "index");
  index.pop();
  index.paint();

  index.environment.scrollY = 1406;
  index.activate(0, {}, true);
  index.enter("/extreme-saga#p14", "bar-visit");
  index.pop();
  index.paint();
  index.environment.scrollY = 5536;
  index.enter("/extreme-saga", "index");
  index.pop();
  index.paint();
  assert.deepEqual(index.calls, [["#p14", true], ["scroll to", 1406], ["bar #p14", true]]);
  index.cleanup();
});

test("Extreme gives a focus change made during Back priority over the scheduled opener", () => {
  const index = chapterIndex();
  index.enter("/extreme-saga", "index");
  index.activate(0);
  index.enter("/extreme-saga#p14", "chapter");
  index.pop();
  index.paint();

  index.enter("/extreme-saga", "index");
  index.pop();
  index.focusIndexLink(1);
  index.environment.dispatchEvent(new Event("focusin"));
  index.paint();
  assert.deepEqual(index.calls, []);
  index.cleanup();
});

test("the history return is wired to the cast dossier and to Extreme's own chapter index", () => {
  const finalStage = read("src/components/final-stage/final-stage.tsx");
  assert.match(finalStage, /CAST\.findIndex\(\(person\) => person\.id === id && person\.to\)/);
  assert.match(finalStage, /useState\(Math\.max\(0, returningCastIndex\)\)/);
  assert.match(finalStage, /to=\{activeCast\.to\}[\s\S]*?beforeNavigate=\{\(\) => rememberLocalHistoryReturn\(\{ value: activeCast\.id \}\)\}/);
  assert.match(finalStage, /#fst-cast-panel \.fst-cast-copy > a"[\s\S]*?\.focus\(\{ preventScroll: true \}\)/);

  const extreme = read("src/components/extreme-saga/extreme-saga.tsx");
  assert.match(extreme, /mountChapterHistoryReturn\(\s*chapterIndexRef\.current,\s*pageRef\.current\?\.querySelector\("\.rxs-local-nav nav"\)/);
  assert.match(extreme, /<nav className="rxs-chapter-index exs-chapter-index"[^>]*\bref=\{chapterIndexRef\}/);
});
