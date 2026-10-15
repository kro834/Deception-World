import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";
import { LIBRARY_ENTRIES, LIBRARY_KINDS, searchLibrary } from "../src/lib/library-data.ts";
import * as browse from "../src/lib/library-browse-state.ts";
import { filterLibraryBrowse } from "../src/lib/library-browse-filter.ts";
import * as guides from "../src/lib/inquiry-guides.ts";

const plain = (value) => JSON.parse(JSON.stringify(value));
const compile = (path) =>
  ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
const pageSource = compile("src/components/library/library-page.tsx");
const cardId = (source, id) => `record-return-${source}-${id}`;

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  return typeof tree === "object" ? text(tree.props?.children) : String(tree);
}

test("library browse URLs are compact, bounded, allowlisted and preserve the guide", () => {
  assert.deepEqual(
    browse.validateLibraryBrowseSearch({
      q: "  シエル  ",
      kind: "person",
      scope: "saved",
      guide: "keepers",
      unknown: "x",
    }),
    {
      guide: "keepers",
      q: "シエル",
      kind: "person",
      scope: "saved",
    },
  );
  for (const value of [undefined, [], {}]) {
    assert.deepEqual(
      browse.validateLibraryBrowseSearch({ q: value, kind: value, scope: value, guide: value }),
      {},
    );
  }
  for (const value of [null, 42, false]) {
    assert.equal(browse.validateLibraryBrowseSearch({ q: value }).q, String(value));
  }
  assert.deepEqual(
    browse.validateLibraryBrowseSearch({
      q: "　 \n ",
      kind: "all",
      scope: "all",
      guide: "missing",
    }),
    {},
  );
  assert.equal(browse.validateLibraryBrowseSearch({ q: "a".repeat(200) }).q.length, 160);
  assert.equal(browse.validateLibraryBrowseSearch({ kind: "__proto__" }).kind, undefined);
  assert.equal(browse.validateLibraryBrowseSearch({ kind: "toString" }).kind, undefined);
  assert.equal(
    browse.libraryBrowseKey({ q: "  シエル  ", kind: "all", scope: "all" }),
    browse.libraryBrowseKey({ q: "シエル", kind: "all", scope: "all" }),
  );
});

test("facets combine query, kind and saved IDs without altering owner data or order", () => {
  const before = JSON.stringify(LIBRARY_ENTRIES);
  const bookmarks = ["saga", "realm", "dream-case-2", "not-published", "saga"];
  const result = filterLibraryBrowse({ q: "ＳＡＧＡ", kind: "person", scope: "saved" }, bookmarks);
  assert.deepEqual(
    result.entries.map((entry) => entry.id),
    ["saga"],
  );
  assert.deepEqual(result.counts, { all: 1, page: 0, person: 1, chapter: 0 });
  const kinds = filterLibraryBrowse({ q: "", kind: "person", scope: "saved" }, bookmarks);
  assert.deepEqual(kinds.counts, { all: 3, page: 0, person: 2, chapter: 1 });
  assert.deepEqual(
    kinds.entries.map((entry) => entry.id),
    ["saga", "realm"],
  );
  assert.deepEqual(
    filterLibraryBrowse({ q: "CASE ２", kind: "chapter", scope: "all" }).entries.map(
      (entry) => entry.id,
    ),
    ["dream-case-2"],
  );
  assert.equal(JSON.stringify(LIBRARY_ENTRIES), before);
});

function mount(initial = {}, savedState = {}) {
  let props = {
    query: "",
    kind: "all",
    scope: "all",
    guide: "keepers",
    locationKey: "initial",
    ...initial,
  };
  const state = [];
  const refs = [];
  const effects = [];
  const timers = new Map();
  const events = new Map();
  const writes = [];
  const captures = [];
  const arrivals = [];
  const toggles = [];
  const departures = [];
  const focused = [];
  const scrolls = [];
  const scroller = { scrollWidth: 1200, clientWidth: 1024, scrollHeight: 6000, clientHeight: 1366 };
  const targets = new Map();
  const store = {
    ready: true,
    error: "",
    saved: { version: 1, bookmarks: [], recent: [] },
    ...savedState,
  };
  let hook = 0;
  let timerId = 0;
  let dirty = false;
  let pendingEffects = [];
  let tree;
  let now = 1000;
  let writePromise;
  const window = {
    scrollX: 0,
    scrollY: 0,
    scrollTo(options) {
      scrolls.push(plain(options));
    },
    location: {
      pathname: "/library",
      search: defaultStringifySearch(
        browse.validateLibraryBrowseSearch({
          q: props.query,
          kind: props.kind,
          scope: props.scope,
          guide: props.guide,
        }),
      ),
    },
    setTimeout(fn, delay) {
      timers.set(++timerId, { fn, delay });
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(name, fn) {
      events.set(name, fn);
    },
    removeEventListener(name, fn) {
      if (events.get(name) === fn) events.delete(name);
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const GuardedLink = Symbol("GuardedLink");
  const Link = Symbol("Link");
  const exported = {};
  runInNewContext(pageSource, {
    exports: exported,
    window,
    document: { getElementById: (id) => targets.get(id), scrollingElement: scroller },
    URLSearchParams,
    performance: { now: () => now },
    require(name) {
      if (name === "react")
        return {
          useState(initial) {
            const index = hook++;
            if (!(index in state)) state[index] = initial;
            return [
              state[index],
              (value) => {
                const next = typeof value === "function" ? value(state[index]) : value;
                if (next !== state[index]) {
                  state[index] = next;
                  dirty = true;
                }
              },
            ];
          },
          useRef(current) {
            const index = hook++;
            return (refs[index] ??= { current });
          },
          useMemo(fn) {
            hook++;
            return fn();
          },
          useCallback(fn) {
            const index = hook++;
            return (refs[index] ??= { current: fn }).current;
          },
          useEffect(fn, dependencies) {
            const index = hook++;
            const previous = effects[index];
            if (
              !dependencies ||
              !previous ||
              dependencies.some((item, at) => item !== previous.dependencies?.[at])
            ) {
              pendingEffects.push(() => {
                previous?.cleanup?.();
                effects[index] = { dependencies, cleanup: fn() };
              });
            }
          },
          useLayoutEffect(fn, dependencies) {
            const index = hook++;
            const previous = effects[index];
            if (
              !dependencies ||
              !previous ||
              dependencies.some((item, at) => item !== previous.dependencies?.[at])
            ) {
              pendingEffects.push(() => {
                previous?.cleanup?.();
                effects[index] = { dependencies, cleanup: fn() };
              });
            }
          },
        };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: Symbol("Fragment") };
      if (name === "@tanstack/react-router") return { Link, defaultParseSearch };
      if (name === "@/components/load-gate")
        return {
          GuardedLink,
          useLoadGate: () => ({
            go: (options) => {
              departures.push(options);
              return Promise.resolve();
            },
          }),
        };
      if (name === "@/components/name-text") return { DisplayName: Symbol("DisplayName") };
      if (name === "@/components/world/use-world-mode") return { useWorldMode() {} };
      if (name === "@/components/world/world-chrome")
        return { SideMenuLayer: Symbol("Menu"), SideMenuTrigger: Symbol("MenuTrigger") };
      if (name === "@/lib/library-data") return { LIBRARY_ENTRIES, LIBRARY_KINDS, searchLibrary };
      if (name === "@/lib/record-art")
        return { pathArt: () => ({}), RIDER_ART: [], titleRunStyle: () => ({}) };
      if (name === "@/lib/library-browse-state") return browse;
      if (name === "@/lib/library-browse-filter") return { filterLibraryBrowse };
      if (name === "@/lib/record-arrival")
        return { watchRecordArrival: (...args) => arrivals.push(args) };
      if (name === "@/lib/record-return-state")
        return { captureRecordReturn: (value) => captures.push(value), recordReturnCardId: cardId };
      if (name === "./library-store")
        return { useLibraryStore: () => store, toggleBookmark: (id) => toggles.push(id) };
      if (name === "./library-hub") return { LibraryHub: Symbol("Hub") };
      if (name === "./library-inquiry") return { LibraryInquiry: Symbol("Inquiry") };
      if (name === "./record-art") return { RecordArtFrame: Symbol("Art") };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  function render(next = {}) {
    props = { ...props, ...next };
    for (let pass = 0; pass < 10; pass++) {
      hook = 0;
      dirty = false;
      pendingEffects = [];
      tree = exported.LibraryPage({
        ...props,
        onBrowseChange: (selection, options) => {
          writes.push({ selection, options });
          window.location.search = defaultStringifySearch(
            browse.validateLibraryBrowseSearch({ ...selection, guide: props.guide }),
          );
          return writePromise ?? Promise.resolve();
        },
        onGuideChange() {},
      });
      for (const effect of pendingEffects) effect();
      if (!dirty) return tree;
    }
    throw new Error("Render did not settle");
  }
  function field() {
    return nodes(tree, (node) => node.type === "input" && node.props.id === "library-search")[0];
  }
  function input(value) {
    field().props.onChange({ target: { value } });
    render();
  }
  function flush() {
    const scheduled = [...timers.values()];
    timers.clear();
    for (const { fn } of scheduled) fn();
    render();
  }
  function acknowledge(index = -1) {
    const next = browse.validateLibraryBrowseSearch(writes.at(index).selection);
    render({
      query: next.q ?? "",
      kind: next.kind ?? "all",
      scope: next.scope ?? "all",
      locationKey: `write-${writes.length}`,
    });
  }
  function button(label) {
    return nodes(tree, (node) => node.type === "button" && text(node).startsWith(label))[0];
  }
  function cards() {
    return nodes(tree, (node) => typeof node.type === "function" && node.type.name === "EntryCard");
  }
  function target(id) {
    targets.set(cardId("library", id), {
      querySelector: () => ({ focus: (options) => focused.push({ id, options }) }),
    });
  }
  render();
  return {
    render,
    field,
    input,
    flush,
    acknowledge,
    button,
    cards,
    writes,
    captures,
    arrivals,
    toggles,
    departures,
    store,
    window,
    events,
    timers,
    focused,
    scrolls,
    scroller,
    target,
    tree: () => tree,
    time: (value) => {
      now = value;
    },
    holdWrites: (promise) => {
      writePromise = promise;
    },
    attachResults() {
      const result = nodes(
        tree,
        (node) => node.type === "p" && node.props.ref && node.props.role === "status",
      )[0];
      result.props.ref.current = {
        focus: (options) => focused.push({ id: "results", options }),
        scrollIntoView() {},
      };
    },
    unmount() {
      for (const effect of effects) effect?.cleanup?.();
    },
  };
}

async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function clickEvent(overrides = {}) {
  const link = { focus() {} };
  const event = {
    defaultPrevented: false,
    button: 0,
    detail: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    target: { closest: () => link },
    currentTarget: { contains: () => true },
    preventDefault() {
      event.defaultPrevented = true;
    },
    stopPropagation() {},
    ...overrides,
  };
  return event;
}

test("debounced drafts survive their own acknowledgement, and record capture flushes newer input", async () => {
  const h = mount();
  h.input("sag");
  assert.equal(h.writes.length, 0);
  h.flush();
  assert.equal(h.writes.length, 1);
  h.input("saga");
  h.acknowledge();
  assert.equal(
    h.field().props.value,
    "saga",
    "an older write acknowledgement does not replace the newer field",
  );
  const card = h.cards()[0];
  const markup = card.type(card.props);
  assert.equal(markup.props.id, cardId("library", card.props.entry.id));
  assert.equal(markup.props["data-library-entry"], card.props.entry.id);
  markup.props.onClickCapture(clickEvent());
  await settle();
  assert.equal(h.writes.at(-1).selection.q, "saga");
  assert.equal(h.timers.size, 0);
  assert.equal(h.captures.at(-1).source.search.q, "saga");
  assert.equal(h.captures.at(-1).source.search.guide, "keepers");
  assert.equal(h.captures.at(-1).source.cardId, markup.props.id);
  assert.equal(h.arrivals.length, 1);
});

test("a result clicked before debounce waits for the source history write before leaving and Back restores it", async () => {
  const h = mount();
  let finish;
  h.holdWrites(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  h.input("saga");
  const card = h.cards()[0];
  const markup = card.type(card.props);
  markup.props.onClickCapture(clickEvent());
  assert.equal(h.writes.length, 1, "the click flushes without waiting 280ms");
  assert.equal(h.departures.length, 0, "load-gate navigation must wait for the URL commit");
  assert.equal(h.captures.length, 0);
  h.acknowledge();
  finish();
  await settle();
  assert.equal(h.departures.length, 1);
  assert.equal(h.departures[0].focusDestination, true);
  assert.equal(h.captures[0].source.search.q, "saga");
  h.window.location.search = "?q=saga&guide=keepers";
  h.events.get("popstate")();
  h.render({ locationKey: "back-from-result" });
  h.flush();
  assert.equal(h.field().props.value, "saga");
  assert.equal(h.writes.length, 1, "Back does not rewrite the restored URL");
});

test("overlapping A/B URL acknowledgements do not discard newer draft C", () => {
  const h = mount();
  h.input("A");
  h.flush();
  h.input("B");
  h.flush();
  h.input("C");
  h.acknowledge(0);
  assert.equal(h.field().props.value, "C");
  h.acknowledge(1);
  assert.equal(h.field().props.value, "C");
  h.flush();
  assert.equal(h.writes.at(-1).selection.q, "C");
});

test("a global location update before the matched query acknowledgement does not cancel opening", async () => {
  const h = mount({ kind: "person" });
  let finish;
  h.holdWrites(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  h.input("ゼウス");
  const card = h.cards()[0];
  card.type(card.props).props.onClickCapture(clickEvent());
  // TanStack's global location can update while Route.useSearch still holds
  // the previous match. A history key must not create a hybrid source tuple.
  h.render({ locationKey: "global-key-before-match" });
  assert.equal(h.field().props.value, "ゼウス");
  h.acknowledge();
  finish();
  await settle();
  assert.equal(h.captures.length, 1);
  assert.equal(h.departures.length, 1);
  assert.equal(h.departures[0].to, "/managers/zeus");
});

test("result capture leaves modifier clicks, other buttons and prevented actions native", () => {
  const h = mount();
  const card = h.cards()[0];
  const markup = card.type(card.props);
  for (const options of [
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { defaultPrevented: true },
    { target: { closest: () => null } },
  ]) {
    markup.props.onClickCapture(clickEvent(options));
  }
  assert.equal(h.writes.length, 0);
  assert.equal(h.captures.length, 0);
  assert.equal(h.departures.length, 0);
});

test("an older A cannot capture or open after B, unmount, Back, or a changed source", async () => {
  const rapid = mount();
  const [a, b] = rapid.cards();
  a.type(a.props).props.onClickCapture(clickEvent());
  b.type(b.props).props.onClickCapture(clickEvent());
  await settle();
  assert.equal(rapid.captures.length, 1);
  assert.equal(rapid.departures.length, 1);
  assert.equal(rapid.departures[0].to, b.props.entry.path);
  for (const reason of ["unmount", "back", "different-source", "input"]) {
    const h = mount();
    let finish;
    h.holdWrites(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    h.input("saga");
    const card = h.cards()[0];
    card.type(card.props).props.onClickCapture(clickEvent());
    if (reason === "unmount") h.unmount();
    else if (reason === "back") {
      h.window.location.search = "?guide=keepers";
      h.events.get("popstate")();
      h.render({ query: "", locationKey: "back" });
    } else if (reason === "different-source") h.window.location.pathname = "/world";
    else h.input("realm");
    finish();
    await settle();
    assert.equal(h.captures.length, 0, `${reason} cancels capture`);
    assert.equal(h.departures.length, 0, `${reason} cancels go`);
    assert.equal(h.arrivals.length, 0, `${reason} cancels the focus observer`);
  }
});

test("TanStack primitive-looking and quoted queries survive serialization, reload and Back", () => {
  for (const query of ["2", "true", "null", '"名前"']) {
    const encoded = defaultStringifySearch({ q: query, guide: "keepers" });
    const canonical = browse.validateLibraryBrowseSearch(defaultParseSearch(encoded));
    assert.equal(canonical.q, query);
    const h = mount({ query: canonical.q });
    assert.equal(h.field().props.value, query);
    h.input("pending replacement");
    h.window.location.search = encoded;
    h.events.get("popstate")();
    h.render({ locationKey: `back-${query}` });
    h.flush();
    assert.equal(h.field().props.value, query);
    assert.equal(h.writes.length, 0);
  }
  for (const query of ["2", "true", "null"]) {
    assert.equal(browse.validateLibraryBrowseSearch(defaultParseSearch(`?q=${query}`)).q, query);
  }
});

test("the route validator does not import catalogue runtime or eagerly filter records", () => {
  const output = compile("src/lib/library-browse-state.ts");
  assert.doesNotMatch(output, /require\(["'].*library-data|searchLibrary|LIBRARY_ENTRIES/);
  const route = readFileSync(new URL("../src/routes/library.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(route, /library-browse-filter|library-data/);
});

test("IME never debounces or submits a confirming Enter; finished text writes once", () => {
  const h = mount();
  h.input("し");
  h.field().props.onCompositionStart();
  h.render();
  h.input("しえる");
  h.flush();
  assert.equal(h.writes.length, 0);
  let prevented = false;
  h.field().props.onKeyDown({
    key: "Enter",
    nativeEvent: { isComposing: true },
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  h.field().props.onCompositionEnd({ currentTarget: { value: "シエル" } });
  h.render();
  const form = nodes(h.tree(), (node) => node.type === "form")[0];
  form.props.onSubmit({ preventDefault() {} });
  assert.equal(h.writes.length, 0, "Safari's immediately following submit is not a search action");
  h.time(1100);
  h.flush();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].selection.q, "シエル");
});

test("Back/Forward cancels pending text, and reload starts from validated URL state", () => {
  const h = mount({ query: "サーガ", kind: "person", scope: "saved" });
  assert.equal(h.field().props.value, "サーガ");
  h.input("未確定の別の検索");
  h.window.location.search = "?q=CASE%202&kind=chapter&guide=keepers";
  h.events.get("popstate")();
  h.render({ query: "CASE 2", kind: "chapter", scope: "all", locationKey: "back" });
  h.flush();
  assert.equal(h.field().props.value, "CASE 2");
  assert.equal(h.writes.length, 0);
  h.input("discard this even though the URL text is unchanged");
  h.window.location.search = "?q=CASE%202&kind=chapter";
  h.events.get("popstate")();
  h.render({ locationKey: "forward-same-query" });
  h.flush();
  assert.equal(h.field().props.value, "CASE 2");
  assert.equal(h.writes.length, 0);
  h.unmount();
  assert.equal(h.timers.size, 0);
  assert.equal(h.events.size, 0);
});

test("kind and saved facets write the latest draft atomically and reset explicitly", () => {
  const h = mount({}, { saved: { version: 1, bookmarks: ["saga"], recent: [] } });
  h.input("saga");
  h.button("人物資料").props.onClick();
  assert.deepEqual(plain(h.writes.at(-1)), {
    selection: { q: "saga", kind: "person", scope: "all" },
    options: { replace: false },
  });
  h.acknowledge();
  h.button("しおりのみ").props.onClick();
  assert.deepEqual(plain(h.writes.at(-1).selection), { q: "saga", kind: "person", scope: "saved" });
  h.acknowledge();
  assert.deepEqual(
    h.cards().map((card) => card.props.entry.id),
    ["saga"],
  );
  h.button("条件をリセット").props.onClick();
  assert.deepEqual(plain(h.writes.at(-1).selection), { q: "", kind: "all", scope: "all" });
});

test("saved loading and storage failures are never reported as a genuine zero-result shelf", () => {
  for (const savedState of [{ ready: false }, { error: "保存データを読み込めませんでした。" }]) {
    const h = mount({ scope: "saved" }, savedState);
    assert.equal(h.cards().length, 0);
    assert.equal(text(h.tree()).includes("条件に合う資料が見つかりません"), false);
    assert.ok(
      text(h.tree()).includes(
        savedState.ready === false ? "保存データを確認しています" : "保存データを利用できません",
      ),
    );
    assert.ok(
      h.button("しおりのみ").props.children.some((child) => child?.props?.children === "—"),
    );
  }
  const empty = mount({ scope: "saved" });
  assert.ok(text(empty.tree()).includes("条件に合う資料が見つかりません"));
});

test("own bookmark commits clear a pending native fragment at the same viewport offset once", () => {
  const h = mount();
  h.window.location.hash = "#library-browser";
  h.window.scrollY = 1710;
  h.cards()[0].props.onBookmark("saga");
  assert.equal(h.scrolls.length, 0, "never scroll in the input handler before the DOM commit");
  h.store.saved = { ...h.store.saved, bookmarks: ["saga"] };
  h.render();
  assert.deepEqual(h.scrolls, [{ left: 0, top: 1710, behavior: "instant" }]);
  assert.equal(h.window.scrollY, 1710);
  assert.equal(h.window.location.hash, "#library-browser");
  assert.equal(h.writes.length, 0);
  assert.equal(h.focused.length, 0);
  h.render();
  assert.equal(h.scrolls.length, 1, "an unrelated render must not keep adjusting the viewport");
  h.window.location.hash = "";
  h.cards()[0].props.onBookmark("realm");
  h.render();
  assert.equal(h.scrolls.length, 1, "normal non-fragment browsing needs no adjustment");
});

test("bookmark commits do not clamp Safari overscroll or run for cold saved data", () => {
  const h = mount({}, { saved: { version: 1, bookmarks: ["saga"], recent: [] } });
  assert.equal(h.scrolls.length, 0, "cold hydration is not an own bookmark mutation");
  h.window.location.hash = "#library-browser";
  for (const [x, y] of [
    [0, -1],
    [-1, 100],
    [0, 100000],
    [100000, 100],
  ]) {
    h.window.scrollX = x;
    h.window.scrollY = y;
    h.cards()[0].props.onBookmark("saga");
    h.render();
  }
  assert.equal(h.scrolls.length, 0, "out-of-range offsets stay under native browser control");
});

test("removing a saved result keeps focus on a remaining card or the results status", () => {
  const h = mount(
    { scope: "saved" },
    { saved: { version: 1, bookmarks: ["saga", "realm"], recent: [] } },
  );
  h.target("realm");
  h.attachResults();
  h.cards()[0].props.onBookmark("saga");
  h.store.saved = { ...h.store.saved, bookmarks: ["realm"] };
  h.render();
  assert.deepEqual(plain(h.focused.at(-1)), { id: "realm", options: { preventScroll: true } });
  h.attachResults();
  h.cards()[0].props.onBookmark("realm");
  h.store.saved = { ...h.store.saved, bookmarks: [] };
  h.render();
  assert.deepEqual(plain(h.focused.at(-1)), { id: "results", options: { preventScroll: true } });
});

test("a failed save keeps the known saved shelf and the original button focus", () => {
  const h = mount({ scope: "saved" }, { saved: { version: 1, bookmarks: ["saga"], recent: [] } });
  h.cards()[0].props.onBookmark("saga");
  h.store.error = "保存できませんでした。既存の保存データは変更していません。";
  h.render();
  assert.equal(h.cards().length, 1);
  assert.equal(h.focused.length, 0);
  assert.ok(text(h.tree()).includes("1件の資料"));
  assert.equal(text(h.tree()).includes("保存データを利用できません"), false);
});

test("library navigation preserves guide and hash while canonicalizing filter writes", () => {
  const exported = {};
  const calls = [];
  let options;
  runInNewContext(compile("src/routes/library.tsx"), {
    exports: exported,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }) };
      if (name === "@tanstack/react-router")
        return {
          createFileRoute: () => (config) => {
            options = config;
            return {
              useSearch: () => ({ guide: "keepers", q: "サーガ", kind: "person", scope: "saved" }),
              useNavigate: () => (next) => calls.push(next),
            };
          },
          useRouterState: ({ select }) =>
            select({ location: { state: { __TSR_key: "back" }, href: "/library" } }),
        };
      if (name === "@/components/library/library-page") return { LibraryPage: Symbol("Page") };
      if (name === "@/lib/inquiry-guides") return guides;
      if (name === "@/lib/library-browse-state") return browse;
      if (name === "@/lib/world-head")
        return { createWorldHead() {}, WORLD_CORE_STYLESHEET_LINKS: [] };
      if (name.endsWith(".css?url")) return { default: name };
      throw new Error(`Unexpected route dependency ${name}`);
    },
  });
  const page = options.component();
  assert.equal(page.props.query, "サーガ");
  page.props.onBrowseChange({ q: "  シエル  ", kind: "all", scope: "all" });
  assert.deepEqual(
    plain(calls[0].search({ guide: "keepers", q: "サーガ", kind: "person", scope: "saved" })),
    { guide: "keepers", q: "シエル" },
  );
  assert.equal(calls[0].hash, true);
  assert.equal(calls[0].replace, true);
  assert.equal(calls[0].resetScroll, false);
  page.props.onGuideChange("forms");
  assert.deepEqual(
    plain(calls[1].search({ q: "サーガ", kind: "person", scope: "saved", guide: "keepers" })),
    { q: "サーガ", kind: "person", scope: "saved", guide: "forms" },
  );
  assert.equal(calls[1].hash, true);
});
