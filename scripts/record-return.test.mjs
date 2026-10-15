import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";
import * as state from "../src/lib/record-return-state.ts";
import { getInquiryGuide, getInquiryStop } from "../src/lib/inquiry-guides.ts";
import { validateLibraryBrowseSearch } from "../src/lib/library-browse-state.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (path) =>
  ts.transpileModule(read(path), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
const now = 10_000;
const input = {
  source: {
    pathname: "/search",
    search: { q: "毒牙", category: "people", shown: 48 },
    cardId: state.recordReturnCardId("search", "manager-rex-loi"),
  },
  target: { pathname: "/managers/rex-loi", search: {}, hash: "character-section-04" },
};
const sourceLocation = {
  pathname: "/search",
  search: { q: "毒牙", category: "people", shown: 48 },
  hash: "",
};
const context = () => state.makeRecordReturn(input, now);
const plain = (value) => JSON.parse(JSON.stringify(value));

test("source state retains the exact draft, category/count and library saved facet without unrelated parameters", () => {
  assert.deepEqual(context().source.search, { q: "毒牙", category: "people", shown: "48" });
  assert.deepEqual(
    state.recordReturnSourceSearch("/library", {
      q: "　シエル ",
      kind: "person",
      guide: "keepers",
      scope: "saved",
      returnTo: "https://invalid.test",
    }),
    { q: "シエル", kind: "person", guide: "keepers", scope: "saved" },
  );
  assert.deepEqual(
    state.recordReturnSourceSearch("/search", {
      q: "x".repeat(200),
      category: "unknown",
      shown: 999,
    }),
    {
      q: "x".repeat(120),
      shown: "144",
    },
  );
  assert.deepEqual(
    state.recordReturnSourceSearch("/library", { q: "x".repeat(200), kind: "all", scope: "all" }),
    { q: "x".repeat(160) },
  );
});

test("stable card IDs cover Japanese names, punctuation and long IDs without selector syntax or collisions in the examples", () => {
  const ids = [
    "world-term-六詠",
    "world-location-王都／庭園",
    'term 空白・引用"#[x]',
    "id",
    "id-69-64",
    "資料".repeat(300),
    "資料".repeat(300) + "次",
  ];
  const cards = ids.map((id) => state.recordReturnCardId("search", id));
  assert.equal(new Set(cards).size, cards.length);
  for (const [index, cardId] of cards.entries()) {
    assert.equal(state.recordReturnCardId("search", ids[index]), cardId);
    assert.match(cardId, /^record-return-search-[a-zA-Z0-9_-]{1,120}$/);
    assert.ok(state.makeRecordReturn({ ...input, source: { ...input.source, cardId } }, now));
  }
});

test("every real indexed record can make a unique return card, including Japanese glossary and location anchors", () => {
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const exports = {};
    cache.set(path, exports);
    runInNewContext(
      ts.transpileModule(readFileSync(path, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      {
        exports,
        require: (name) => load(resolve(dirname(path), name.endsWith(".ts") ? name : `${name}.ts`)),
      },
    );
    return exports;
  }
  const { SEARCH_DOCUMENTS } = load(
    fileURLToPath(new URL("../src/components/search/search-data.ts", import.meta.url)),
  );
  const cards = new Set();
  for (const document of SEARCH_DOCUMENTS) {
    const cardId = state.recordReturnCardId("search", document.id);
    assert.equal(cards.has(cardId), false, document.id);
    cards.add(cardId);
    const made = state.makeRecordReturn(
      {
        source: { ...input.source, cardId },
        target: { pathname: document.to, search: document.search, hash: document.hash },
      },
      now,
    );
    assert.ok(made, `${document.id}: ${document.to}#${document.hash}`);
    assert.ok(
      state.matchesRecordReturnTarget(made, {
        pathname: document.to,
        search: document.search,
        hash: encodeURIComponent(document.hash),
      }),
      document.id,
    );
  }
});

test("library source canonicalization agrees with its route and restores whitespace-trimmed saved filters", () => {
  for (const q of [" シエル　", "　　", " ".repeat(150) + "六詠".repeat(30)]) {
    const selection = { q, kind: "person", scope: "saved", guide: "keepers" };
    assert.deepEqual(
      state.recordReturnSourceSearch("/library", selection),
      validateLibraryBrowseSearch(selection),
    );
    const made = state.makeRecordReturn(
      {
        ...input,
        source: {
          pathname: "/library",
          search: selection,
          cardId: state.recordReturnCardId("library", "ciel"),
        },
      },
      now,
    );
    assert.ok(
      state.matchesRecordReturnSource(made.source, {
        pathname: "/library",
        search: validateLibraryBrowseSearch(selection),
      }),
    );
  }
  assert.equal(state.recordReturnSourceSearch("/search", { q: " 毒牙　" }).q, " 毒牙　");
});

test("a return can only name a bounded internal source/card and safe destination", () => {
  for (const pathname of [
    "https://invalid.test/search",
    "//invalid.test",
    "/world",
    "/search/../world",
  ])
    assert.equal(
      state.makeRecordReturn({ ...input, source: { ...input.source, pathname } }, now),
      null,
    );
  for (const cardId of [
    "x",
    "record-return-library-saga",
    "record-return-search-<script>",
    "record-return-search-" + "x".repeat(121),
  ])
    assert.equal(
      state.makeRecordReturn({ ...input, source: { ...input.source, cardId } }, now),
      null,
    );
  for (const pathname of [
    "https://invalid.test",
    "//invalid.test",
    "/../world",
    "/%2fexample",
    "/search",
    "/library",
  ])
    assert.equal(
      state.makeRecordReturn({ ...input, target: { ...input.target, pathname } }, now),
      null,
    );
  for (const hash of ["%invalid", "x y", "x".repeat(181)])
    assert.equal(
      state.makeRecordReturn({ ...input, target: { ...input.target, hash } }, now),
      null,
    );
  assert.equal(
    state.makeRecordReturn({ ...input, target: { ...input.target, search: { form: {} } } }, now),
    null,
  );
});

test("destination matching includes both form selection and the exact fragment", () => {
  const form = state.makeRecordReturn(
    {
      ...input,
      target: {
        pathname: "/form-archive",
        search: { archive: "realm", form: "royal" },
        hash: "archive-switcher",
      },
    },
    now,
  );
  const location = {
    pathname: "/form-archive",
    search: { form: "royal", archive: "realm" },
    hash: "#archive-switcher",
  };
  assert.equal(state.matchesRecordReturnTarget(form, location), true);
  assert.equal(
    state.matchesRecordReturnTarget(form, { ...location, search: { form: "royal" } }),
    false,
  );
  assert.equal(state.matchesRecordReturnTarget(form, { ...location, hash: "different" }), false);
  assert.equal(state.matchesRecordReturnTarget(form, { ...location, pathname: "/world" }), false);
});

test("Back preserves router scroll, explicit return restores the card, and Forward reactivates only the same journey", () => {
  const arrived = state.advanceRecordReturn(context(), input.target, now + 1);
  assert.equal(arrived.context.phase, "reading");
  const back = state.advanceRecordReturn(arrived.context, sourceLocation, now + 2);
  assert.equal(back.context.phase, "source");
  assert.equal(back.restore.scroll, false);
  assert.equal(state.advanceRecordReturn(back.context, sourceLocation, now + 3).restore, undefined);
  const forward = state.advanceRecordReturn(back.context, input.target, now + 4);
  assert.equal(forward.context.phase, "reading");
  const returned = state.advanceRecordReturn(
    { ...forward.context, phase: "returning" },
    sourceLocation,
    now + 5,
  );
  assert.equal(returned.restore.scroll, true);
  assert.equal(returned.restore.source.cardId, input.source.cardId);
  assert.equal(
    state.advanceRecordReturn(
      returned.context,
      { ...sourceLocation, search: { q: "別の語" } },
      now + 6,
    ).context,
    null,
  );
});

test("unrelated routes, changed destination hashes, abandoned navigation and expiry clear the journey", () => {
  assert.equal(state.advanceRecordReturn(context(), { pathname: "/world" }, now + 1).context, null);
  const reading = { ...context(), phase: "reading" };
  assert.equal(
    state.advanceRecordReturn(reading, { ...input.target, hash: "dossier-abilities" }, now + 1)
      .context,
    null,
  );
  assert.equal(
    state.advanceRecordReturn(context(), sourceLocation, now + state.RECORD_RETURN_PENDING).context,
    null,
  );
  assert.equal(
    state.advanceRecordReturn(reading, input.target, now + state.RECORD_RETURN_LIFETIME).context,
    null,
  );
  assert.equal(state.advanceRecordReturn(reading, input.target, now - 1).context, null);
  assert.equal(
    state.advanceRecordReturn(context(), { ...sourceLocation, search: {} }, now + 1).context,
    null,
  );
});

function openingHarness() {
  let time = now;
  const events = new Map();
  const storage = new Map();
  const eventTarget = (surface) => ({
    addEventListener(name, callback) {
      events.set(`${surface}:${name}`, callback);
    },
    removeEventListener(name, callback) {
      const key = `${surface}:${name}`;
      if (events.get(key) === callback) events.delete(key);
    },
  });
  const exports = {};
  runInNewContext(compile("src/lib/record-return-state.ts"), {
    exports,
    Date: class extends Date {
      static now() {
        return time;
      }
    },
    window: {
      ...eventTarget("window"),
      sessionStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
    },
    document: eventTarget("document"),
    require: (name) => {
      assert.equal(name, "./library-browse-state.ts");
      return { validateLibraryBrowseSearch };
    },
  });
  return {
    state: exports,
    events,
    storage,
    now: () => time,
    at: (next) => {
      time = next;
    },
    dispatch: (name) => events.get(name)?.(),
  };
}

test("an active capture survives the 15-second boundary in pure transitions and the UI deadline", () => {
  for (const elapsed of [14_999, 15_000, 16_000]) {
    const h = openingHarness();
    const captured = h.state.captureRecordReturn(input, true);
    assert.equal(h.state.recordReturnExpiresAt(captured), now + state.RECORD_RETURN_LIFETIME);
    h.at(now + elapsed);
    // A queued callback from a previous 15-second timer cannot kill the lease.
    h.state.expireRecordReturn(captured);
    assert.equal(h.state.getRecordReturn(), captured);
    h.state.reconcileRecordReturn(sourceLocation);
    assert.equal(h.state.getRecordReturn(), captured);
    assert.equal(
      state.advanceRecordReturn(captured, input.target, now + elapsed, true).context.phase,
      "reading",
    );
    h.state.reconcileRecordReturn(input.target);
    const reading = h.state.getRecordReturn();
    assert.equal(reading.phase, "reading");
    assert.equal(h.events.size, 0);
    // The old leaving callback can also run after the arrival effect.
    h.state.expireRecordReturn(captured);
    h.state.finishRecordReturnOpening(captured, sourceLocation);
    assert.equal(h.state.getRecordReturn(), reading);
    assert.equal(
      h.state.recordReturnExpiresAt(reading),
      now + state.RECORD_RETURN_LIFETIME,
    );
  }
});

test("completion before the destination effect retains only the exact arrived target after 15 seconds", () => {
  for (const elapsed of [14_999, 15_000, 16_000]) {
    const h = openingHarness();
    const captured = h.state.captureRecordReturn(input, true);
    h.at(now + elapsed);
    h.state.finishRecordReturnOpening(captured, input.target);
    assert.equal(h.state.getRecordReturn().phase, "reading");
    h.state.reconcileRecordReturn(input.target);
    assert.equal(h.state.getRecordReturn().phase, "reading");
    assert.equal(h.events.size, 0);
  }
  for (const location of [
    sourceLocation,
    { ...sourceLocation, search: { q: "別の語" } },
    { ...input.target, hash: "dossier-abilities" },
    { ...input.target, search: { guide: "keepers" } },
    { pathname: "/world" },
  ]) {
    const h = openingHarness();
    const captured = h.state.captureRecordReturn(input, true);
    h.at(now + 16_000);
    h.state.finishRecordReturnOpening(captured, location);
    assert.equal(h.state.getRecordReturn(), null, JSON.stringify(location));
    assert.equal(h.events.size, 0);
    h.state.finishRecordReturnOpening(captured, input.target);
    assert.equal(h.state.getRecordReturn(), null);
  }
});

test("Back, pagehide, explicit cancellation and changed source/target never revive a pending capture", () => {
  for (const event of [
    "window:popstate",
    "window:pagehide",
    "document:deception-world:cancel-route-transition",
  ]) {
    const h = openingHarness();
    const captured = h.state.captureRecordReturn(input, true);
    h.dispatch(event);
    assert.equal(h.state.getRecordReturn(), null, event);
    assert.equal(h.events.size, 0);
    h.at(now + 16_000);
    h.state.finishRecordReturnOpening(captured, input.target);
    assert.equal(h.state.getRecordReturn(), null);
  }
  for (const location of [
    { ...sourceLocation, search: { q: "別の語", category: "people", shown: 48 } },
    { ...input.target, hash: "dossier-abilities" },
    { pathname: "/world" },
  ]) {
    const h = openingHarness();
    const captured = h.state.captureRecordReturn(input, true);
    h.state.reconcileRecordReturn(location);
    assert.equal(h.state.getRecordReturn(), null);
    h.state.finishRecordReturnOpening(captured, input.target);
    assert.equal(h.state.getRecordReturn(), null);
    assert.equal(h.events.size, 0);
  }
});

test("same-millisecond captures have independent completion, cancellation and timer identities", () => {
  const h = openingHarness();
  const first = h.state.captureRecordReturn(input, true);
  const oldCancel = h.events.get("window:popstate");
  const second = h.state.captureRecordReturn(input, true);
  assert.equal(first.createdAt, second.createdAt);
  assert.notEqual(first, second);
  h.at(now + 16_000);
  h.state.finishRecordReturnOpening(first, sourceLocation);
  h.state.finishRecordReturnOpening(first, input.target);
  h.state.expireRecordReturn(first);
  oldCancel();
  assert.equal(h.state.getRecordReturn(), second);
  assert.equal(h.events.size, 3);
  h.state.finishRecordReturnOpening(second, input.target);
  const reading = h.state.getRecordReturn();
  assert.equal(reading.phase, "reading");
  h.state.finishRecordReturnOpening(first, sourceLocation);
  assert.equal(h.state.getRecordReturn(), reading);
  assert.equal(h.events.size, 0);
});

test("in-flight state is never persisted, ordinary pending expires at 15 seconds and all journeys expire at 30 minutes", () => {
  const h = openingHarness();
  const captured = h.state.captureRecordReturn(input, true);
  const persisted = h.storage.get(state.RECORD_RETURN_KEY);
  assert.deepEqual(JSON.parse(persisted), plain(captured));
  assert.equal(state.parseRecordReturn(persisted, now + 15_000), null);
  h.at(now + state.RECORD_RETURN_LIFETIME);
  assert.equal(
    state.advanceRecordReturn(captured, input.target, now + state.RECORD_RETURN_LIFETIME, true)
      .context,
    null,
  );
  h.state.expireRecordReturn(captured);
  assert.equal(h.state.getRecordReturn(), null);
  assert.equal(h.events.size, 0);
  h.state.finishRecordReturnOpening(captured, input.target);
  assert.equal(h.state.getRecordReturn(), null);

  const plainPending = openingHarness();
  const pending = plainPending.state.captureRecordReturn(input);
  assert.equal(plainPending.state.recordReturnExpiresAt(pending), now + 15_000);
  plainPending.at(now + 15_000);
  plainPending.state.expireRecordReturn(pending);
  assert.equal(plainPending.state.getRecordReturn(), null);
});

test("the return component schedules the active lifetime and binds effects to capture identity rather than timestamp", () => {
  const h = openingHarness();
  const timers = [];
  const effects = [];
  const exports = {};
  runInNewContext(compile("src/components/library/record-return-navigation.tsx"), {
    exports,
    Date: { now: h.now },
    window: {
      setTimeout(callback, delay) {
        timers.push({ callback, delay });
        return timers.length;
      },
      clearTimeout() {},
    },
    require(name) {
      if (name === "react")
        return {
          useEffect(callback, dependencies) {
            effects.push({ callback, dependencies });
          },
          useSyncExternalStore: () => h.state.getRecordReturn(),
        };
      if (name === "@tanstack/react-router")
        return { useRouterState: ({ select }) => select({ location: sourceLocation }) };
      if (name === "@/lib/record-return-state") return h.state;
      if (name === "@/lib/inquiry-guides") return { getInquiryGuide, getInquiryStop };
      if (name === "@/components/load-gate") return {};
      if (name === "@/lib/record-return-arrival") return {};
      if (name === "react/jsx-runtime") return {};
      if (name.endsWith("?url")) return { default: "/record-return.css" };
      throw new Error(name);
    },
  });
  const first = h.state.captureRecordReturn(input, true);
  exports.RecordReturnNavigation();
  effects[0].callback();
  effects[1].callback();
  assert.equal(timers[0].delay, state.RECORD_RETURN_LIFETIME);
  const second = h.state.captureRecordReturn(input, true);
  exports.RecordReturnNavigation();
  assert.equal(first.createdAt, second.createdAt);
  assert.notEqual(effects[0].dependencies[1], effects[2].dependencies[1]);
  assert.equal(effects[1].dependencies[0], first);
  assert.equal(effects[3].dependencies[0], second);
  h.at(now + 16_000);
  timers[0].callback();
  assert.equal(h.state.getRecordReturn(), second);
  effects[2].callback();
  effects[3].callback();
  assert.equal(timers[1].delay, state.RECORD_RETURN_LIFETIME - 16_000);
  h.at(now + state.RECORD_RETURN_LIFETIME);
  timers[1].callback();
  assert.equal(h.state.getRecordReturn(), null);
});

test("session parsing rejects malformed and expired data, retaining safe reload state", () => {
  const reading = { ...context(), phase: "reading" };
  assert.deepEqual(state.parseRecordReturn(JSON.stringify(reading), now + 20), reading);
  for (const raw of [
    null,
    "not JSON",
    "null",
    "[]",
    "x".repeat(4097),
    JSON.stringify({ ...reading, version: 2 }),
    JSON.stringify({ ...reading, source: null }),
  ])
    assert.equal(state.parseRecordReturn(raw, now + 1), null);
  assert.equal(
    state.parseRecordReturn(JSON.stringify(context()), now + state.RECORD_RETURN_PENDING),
    null,
  );
  assert.equal(
    state.parseRecordReturn(JSON.stringify(reading), now + state.RECORD_RETURN_LIFETIME),
    null,
  );
});

test("blocked session storage still supports a tab-local capture, return and dismissal", () => {
  const exports = {};
  runInNewContext(compile("src/lib/record-return-state.ts"), {
    exports,
    require: (name) => {
      assert.equal(name, "./library-browse-state.ts");
      return { validateLibraryBrowseSearch };
    },
    window: {
      get sessionStorage() {
        throw new Error("blocked");
      },
    },
  });
  let updates = 0;
  const unsubscribe = exports.subscribeRecordReturn(() => updates++);
  assert.equal(exports.getRecordReturn(), null);
  exports.captureRecordReturn(input);
  assert.equal(exports.getRecordReturn().phase, "leaving");
  exports.reconcileRecordReturn(input.target);
  exports.beginRecordReturn();
  assert.equal(exports.getRecordReturn().phase, "returning");
  exports.clearRecordReturn();
  assert.equal(exports.getRecordReturn(), null);
  assert.equal(updates, 4);
  unsubscribe();
});

function arrivalHarness({
  card = true,
  native = false,
  query = input.source.search,
  rawSearch,
  pathname = "/search",
} = {}) {
  const frames = new Map(),
    timers = new Map(),
    listeners = new Map(),
    attributes = new Set();
  let serial = 0,
    observer,
    focus = 0,
    scroll = 0,
    dialog = false,
    blur;
  const cardId = state.recordReturnCardId(
    pathname === "/library" ? "library" : "search",
    "manager-rex-loi",
  );
  const target = {
    id: card
      ? cardId
      : pathname === "/library"
        ? "library-browser-title"
        : "record-results-heading",
    getClientRects: () => [{}],
    closest: () => null,
    matches: () => card,
    set tabIndex(value) {
      assert.equal(value, -1);
    },
    addEventListener(name, callback) {
      assert.equal(name, "blur");
      blur = callback;
    },
    removeAttribute(name) {
      assert.equal(name, "tabindex");
    },
    focus(options) {
      assert.equal(options.preventScroll, true);
      focus++;
    },
    scrollIntoView(options) {
      assert.equal(options.behavior, "instant");
      scroll++;
    },
  };
  const window = {
    location: { pathname, search: rawSearch ?? defaultStringifySearch(query) },
    requestAnimationFrame(callback) {
      frames.set(++serial, callback);
      return serial;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    setTimeout(callback, delay) {
      timers.set(++serial, { callback, delay });
      return serial;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  const document = {
    documentElement: { hasAttribute: (name) => attributes.has(name) },
    getElementById: (id) => (id === target.id ? target : null),
    querySelector: () => (dialog ? {} : null),
    addEventListener(name, handler, options) {
      assert.equal(options.passive, true);
      listeners.set(name, handler);
    },
    removeEventListener(name) {
      listeners.delete(name);
    },
  };
  function MutationObserver(callback) {
    observer = {
      callback,
      active: true,
      observe() {},
      disconnect() {
        observer.active = false;
      },
    };
    return observer;
  }
  const exports = {};
  runInNewContext(compile("src/lib/record-return-arrival.ts"), {
    exports,
    window,
    document,
    MutationObserver,
    URLSearchParams,
    require: (name) => {
      if (name === "@tanstack/react-router") return { defaultParseSearch };
      assert.equal(name, "./record-return-state");
      return state;
    },
  });
  const source = state.makeRecordReturn(
    { ...input, source: { ...input.source, pathname, cardId, search: query } },
    now,
  ).source;
  const stop = exports.watchRecordReturnArrival(source, !native);
  return {
    attributes,
    frames,
    timers,
    listeners,
    window,
    stop,
    counts: () => ({ focus, scroll }),
    active: () => observer.active,
    dialog: (value) => {
      dialog = value;
      observer.callback();
    },
    change: () => observer.callback(),
    blur: () => blur?.(),
    flush() {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback();
      }
    },
    expire(delay) {
      for (const [id, timer] of [...timers])
        if (timer.delay === delay) {
          timers.delete(id);
          timer.callback();
        }
    },
  };
}

test("return focus waits for route covers and dialogs, then restores once and releases global resources", () => {
  const h = arrivalHarness();
  h.attributes.add("data-route-cover");
  h.flush();
  h.expire(240);
  assert.deepEqual(h.counts(), { focus: 0, scroll: 0 });
  h.attributes.delete("data-route-cover");
  h.dialog(true);
  h.flush();
  h.expire(240);
  assert.deepEqual(h.counts(), { focus: 0, scroll: 0 });
  h.dialog(false);
  h.attributes.add("data-route-scroll-settling");
  h.flush();
  h.expire(240);
  assert.deepEqual(h.counts(), { focus: 0, scroll: 0 });
  h.attributes.delete("data-route-scroll-settling");
  h.change();
  h.flush();
  h.expire(240);
  assert.deepEqual(h.counts(), { focus: 1, scroll: 1 });
  assert.equal(h.active(), false);
  assert.equal(h.frames.size + h.timers.size + h.listeners.size, 0);
});

test("native Back and a missing saved card never overwrite the reader's scroll position", () => {
  for (const options of [{ native: true }, { card: false }]) {
    const h = arrivalHarness(options);
    h.flush();
    h.expire(240);
    assert.deepEqual(h.counts(), { focus: 1, scroll: 0 });
    h.blur();
  }
});

test("return arrival decodes JSON-looking string queries with the same parser as the router", () => {
  for (const q of ["2", "true", "false", "null", '"六詠"', "[1,2]", '{"資料":"六詠"}']) {
    const h = arrivalHarness({ query: { q, category: "people", shown: 48 } });
    assert.equal(defaultParseSearch(h.window.location.search).q, q);
    h.flush();
    h.expire(240);
    assert.deepEqual(h.counts(), { focus: 1, scroll: 1 }, q);
  }
});

test("hand-written numeric, boolean and null search URLs match the search route's primitive coercion", () => {
  for (const [rawSearch, q] of [
    ["?q=2", "2"],
    ["?q=true", "true"],
    ["?q=false", "false"],
    ["?q=null", "null"],
  ]) {
    const h = arrivalHarness({ query: { q }, rawSearch });
    h.flush();
    h.expire(240);
    assert.deepEqual(h.counts(), { focus: 1, scroll: 1 }, rawSearch);
  }
});

test("handwritten library primitive queries share route normalization and restore the saved shelf on Back", () => {
  for (const [raw, q] of [
    ["?q=2", "2"],
    ["?q=0", "0"],
    ["?q=true", "true"],
    ["?q=false", "false"],
    ["?q=null", "null"],
  ]) {
    const rawSearch = `${raw}&kind=chapter&scope=saved&guide=forms`;
    const parsed = defaultParseSearch(rawSearch);
    const query = validateLibraryBrowseSearch(parsed);
    assert.deepEqual(state.recordReturnSourceSearch("/library", parsed), query, raw);
    assert.equal(query.q, q);
    const made = state.makeRecordReturn(
      {
        ...input,
        source: {
          pathname: "/library",
          search: query,
          cardId: state.recordReturnCardId("library", "case-02"),
        },
      },
      now,
    );
    const back = state.advanceRecordReturn(
      { ...made, phase: "reading" },
      {
        pathname: "/library",
        search: parsed,
      },
      now + 1,
    );
    assert.equal(back.context.phase, "source", raw);
    assert.equal(back.restore.scroll, false, raw);
    assert.deepEqual(back.restore.source.search, query, raw);
    for (const native of [false, true]) {
      const h = arrivalHarness({ pathname: "/library", query, rawSearch, native });
      h.flush();
      h.expire(240);
      assert.deepEqual(h.counts(), { focus: 1, scroll: native ? 0 : 1 }, raw);
    }
  }
  assert.doesNotMatch(
    compile("src/lib/library-browse-state.ts"),
    /require\(["'].*library-data|searchLibrary|LIBRARY_ENTRIES/,
  );
});

test("new user input, timeout and route departure cancel pending return focus and clean observers", () => {
  for (const input of [
    "pointerdown",
    "wheel",
    "keydown",
    "touchstart",
    "timeout",
    "departure",
    "cleanup",
  ]) {
    const h = arrivalHarness();
    h.flush();
    if (input === "timeout") h.expire(15000);
    else if (input === "departure") {
      h.window.location.pathname = "/world";
      h.change();
      h.flush();
    } else if (input === "cleanup") h.stop();
    else h.listeners.get(input)();
    h.expire(240);
    assert.deepEqual(h.counts(), { focus: 0, scroll: 0 }, input);
    assert.equal(h.active(), false, input);
    assert.equal(h.frames.size + h.timers.size + h.listeners.size, 0, input);
  }
});

test("full-page results can opt into Tab while quick-search defaults and modifier links remain native", () => {
  const exports = {};
  const jsx = (type, props) => ({ type, props });
  runInNewContext(compile("src/components/search/search-ui.tsx"), {
    exports,
    require(name) {
      if (name === "react") return { Fragment: "fragment" };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@tanstack/react-router")
        return { useRouter: () => ({ preloadRoute: () => Promise.resolve() }) };
      if (name === "@/lib/name-breaks") return {};
      if (name === "./search-ui-helpers") return { resultHref: () => "/world#record" };
      throw new Error(name);
    },
  });
  let opened = 0;
  const props = {
    result: { document: { id: "record", to: "/world" } },
    id: "record",
    active: false,
    onOpen: () => opened++,
  };
  assert.equal(exports.ResultOption(props).props.tabIndex, -1);
  const card = exports.ResultOption({ ...props, tabbable: true });
  assert.equal(card.props.tabIndex, 0);
  assert.equal(card.props["data-record-id"], "record");
  for (const modifier of ["metaKey", "ctrlKey", "shiftKey", "altKey", "defaultPrevented"])
    card.props.onClick({
      button: 0,
      [modifier]: true,
      preventDefault: () => assert.fail("native link blocked"),
    });
  card.props.onClick({ button: 1, preventDefault: () => assert.fail("middle click blocked") });
  assert.equal(opened, 0);
  card.props.onClick({ button: 0, detail: 0, preventDefault() {} });
  assert.equal(opened, 1);
  const page = read("src/components/search/search-page.tsx");
  assert.match(page, /className="search-result-card"\s+tabbable/);
  assert.match(page, /className="search-more-option"/);
  assert.match(page, /tabIndex=\{0\}/);
  assert.match(page, /window\.clearTimeout\(queryTimerRef\.current\)/);
});

function openHarness({ store, deferGo = false } = {}) {
  const calls = [],
    pending = [],
    goPending = [],
    finishes = [];
  const location = {
    pathname: input.source.pathname,
    search: defaultStringifySearch(input.source.search),
    hash: "",
  };
  let cleanup;
  const exports = {};
  runInNewContext(compile("src/components/search/use-open-result.ts"), {
    exports,
    window: { location },
    require(name) {
      if (name === "react")
        return {
          useCallback: (fn) => fn,
          useRef: (value) => ({ current: value }),
          useEffect: (fn) => {
            cleanup = fn();
          },
        };
      if (name === "@tanstack/react-router")
        return {
          defaultParseSearch,
          useRouter: () => ({
            navigate: (options) => {
              calls.push(["navigate", plain(options)]);
              location.pathname = options.to;
              location.search = defaultStringifySearch(options.search ?? {});
              return new Promise((resolve, reject) => pending.push({ resolve, reject }));
            },
          }),
        };
      if (name === "@/components/load-gate")
        return {
          useLoadGate: () => ({
            go: (options) => {
              calls.push(["go", plain(options)]);
              if (deferGo)
                return new Promise((resolve, reject) => goPending.push({ resolve, reject }));
            },
          }),
        };
      if (name === "@/lib/record-arrival")
        return { watchRecordArrival: (...args) => calls.push(["arrival", ...args]) };
      if (name === "@/lib/record-return-state")
        return {
          ...state,
          captureRecordReturn: (input, inFlight) => {
            assert.equal(inFlight, true);
            calls.push(["capture", plain(input)]);
            return store ? store.captureRecordReturn(input, inFlight) : state.makeRecordReturn(input);
          },
          finishRecordReturnOpening: (captured, location) => {
            finishes.push([captured, plain(location)]);
            store?.finishRecordReturnOpening(captured, location);
          },
          clearRecordReturn: () => {
            calls.push(["clear"]);
            store?.clearRecordReturn();
          },
        };
      throw new Error(name);
    },
  });
  return {
    open: exports.useOpenResult(), calls, pending, goPending, finishes, location,
    cleanup: () => cleanup(),
  };
}

test("search keeps its exact capture alive while go is pending and completes it after a slow target arrives", async () => {
  const h = openingHarness();
  const open = openHarness({ store: h.state, deferGo: true });
  const result = { document: { to: input.target.pathname }, hash: input.target.hash };
  const promise = open.open(result, false, input.source);
  open.pending[0].resolve();
  await new Promise(setImmediate);
  const captured = h.state.getRecordReturn();
  assert.equal(captured.phase, "leaving");
  h.at(now + 16_000);
  h.state.expireRecordReturn(captured);
  assert.equal(h.state.getRecordReturn(), captured);
  Object.assign(open.location, {
    pathname: input.target.pathname,
    search: "",
    hash: `#${input.target.hash}`,
  });
  open.goPending[0].resolve();
  await promise;
  assert.equal(h.state.getRecordReturn().phase, "reading");
  assert.equal(open.finishes.length, 1);
  assert.equal(open.finishes[0][0], captured);
  assert.equal(h.events.size, 0);
});

test("search consumes rejected go and direct navigation, clears failed or ignored openings, and never revives Back", async () => {
  for (const mode of ["rejected-go", "ignored-go", "rejected-direct", "back"]) {
    const h = openingHarness();
    const open = openHarness({ store: h.state, deferGo: true });
    const result = {
      document: {
        to: input.target.pathname,
        ...(mode === "rejected-direct" ? { search: { guide: "keepers" } } : {}),
      },
      hash: input.target.hash,
    };
    const promise = open.open(result, false, input.source);
    open.pending[0].resolve();
    await new Promise(setImmediate);
    assert.equal(h.state.getRecordReturn().phase, "leaving");
    h.at(now + 16_000);
    if (mode === "back") {
      h.dispatch("window:popstate");
      Object.assign(open.location, {
        pathname: input.target.pathname, search: "", hash: `#${input.target.hash}`,
      });
    }
    if (mode === "rejected-direct") {
      // A rejected direct route did not commit its new browser URL.
      Object.assign(open.location, sourceLocation, {
        search: defaultStringifySearch(sourceLocation.search),
      });
      open.pending[1].reject(new Error("route rejected"));
    } else if (mode === "rejected-go") open.goPending[0].reject(new Error("gate rejected"));
    else open.goPending[0].resolve();
    await assert.doesNotReject(promise);
    assert.equal(h.state.getRecordReturn(), null, mode);
    assert.equal(open.finishes.length, 1);
    assert.equal(h.events.size, 0);
  }
});

test("opening a result commits its latest source URL before capture and destination navigation", async () => {
  const h = openHarness();
  const result = { document: { to: "/managers/rex-loi" }, hash: "character-section-04" };
  const opening = h.open(result, true, input.source);
  assert.deepEqual(h.calls, [
    [
      "navigate",
      {
        to: "/search",
        search: { q: "毒牙", category: "people", shown: "48" },
        replace: true,
        resetScroll: false,
      },
    ],
  ]);
  h.pending.shift().resolve();
  await opening;
  assert.deepEqual(
    h.calls.map(([kind]) => kind),
    ["navigate", "capture", "arrival", "go"],
  );
  assert.equal(h.calls.at(-1)[1].focusDestination, true);
  assert.equal(h.calls.at(-1)[1].hash, "character-section-04");
});

test("a later selection or unmount cancels stale source-navigation completion", async () => {
  const result = { document: { to: "/world" }, hash: "manager-archive" };
  const h = openHarness();
  const first = h.open(result, false, input.source);
  const second = h.open({ ...result, hash: "cast-roster" }, false, input.source);
  h.pending[0].resolve();
  await first;
  assert.equal(
    h.calls.some(([kind]) => kind === "go"),
    false,
  );
  h.pending[1].resolve();
  await second;
  assert.equal(h.calls.filter(([kind]) => kind === "go").length, 1);
  assert.equal(h.calls.at(-1)[1].hash, "cast-roster");
  const unmounted = openHarness();
  const abandoned = unmounted.open(result, false, input.source);
  unmounted.cleanup();
  unmounted.pending[0].resolve();
  await abandoned;
  assert.deepEqual(
    unmounted.calls.map(([kind]) => kind),
    ["navigate"],
  );
});

test("Back to a different query on the mounted search route cancels a pending result without recapturing or navigating", async () => {
  const result = { document: { to: "/world" }, hash: "manager-archive" };
  for (const location of [
    {
      pathname: "/search",
      search: defaultStringifySearch({ q: "別の語", category: "people", shown: 48 }),
    },
    {
      pathname: "/search",
      search: defaultStringifySearch({ ...input.source.search, category: "world" }),
    },
    { pathname: "/search", search: defaultStringifySearch({ ...input.source.search, shown: 24 }) },
    { pathname: "/library", search: "" },
    { pathname: "/world", search: "" },
  ]) {
    const h = openHarness();
    const opening = h.open(result, false, input.source);
    // Native history changes the URL while the source replacement is pending;
    // React does not unmount for the first three same-route cases.
    Object.assign(h.location, location);
    h.pending[0].resolve();
    await opening;
    assert.deepEqual(
      h.calls.map(([kind]) => kind),
      ["navigate"],
      JSON.stringify(location),
    );
  }
});

test("the post-replace source guard accepts JSON-looking queries after the router serializes them", async () => {
  const result = { document: { to: "/world" }, hash: "manager-archive" };
  for (const q of ["2", "true", "null", '"六詠"']) {
    const h = openHarness();
    const source = { ...input.source, search: { ...input.source.search, q } };
    const opening = h.open(result, false, source);
    assert.equal(defaultParseSearch(h.location.search).q, q);
    h.pending[0].resolve();
    await opening;
    assert.deepEqual(
      h.calls.map(([kind]) => kind),
      ["navigate", "capture", "arrival", "go"],
      q,
    );
  }
});

test("failed source navigation stays on the source and quick-search retains its original direct behavior", async () => {
  const h = openHarness();
  const result = { document: { to: "/world" } };
  const failed = h.open(result, false, input.source);
  h.pending[0].reject(new Error("cancelled"));
  await failed;
  assert.deepEqual(
    h.calls.map(([kind]) => kind),
    ["navigate", "clear"],
  );
  const quick = openHarness();
  await quick.open(result, false);
  assert.deepEqual(
    quick.calls.map(([kind]) => kind),
    ["clear", "arrival", "go"],
  );
});

test("return control stays contextual and yields its position to an active inquiry guide", () => {
  const render = (context, location) => {
    const exports = {};
    const jsx = (type, props) => ({ type, props });
    runInNewContext(compile("src/components/library/record-return-navigation.tsx"), {
      exports,
      require(name) {
        if (name === "react") return { useEffect() {}, useSyncExternalStore: () => context };
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
        if (name === "@tanstack/react-router")
          return { useRouterState: ({ select }) => select({ location }) };
        if (name === "@/components/load-gate") return { GuardedLink: "guarded-link" };
        if (name === "@/lib/inquiry-guides") return { getInquiryGuide, getInquiryStop };
        if (name === "@/lib/record-return-state") return state;
        if (name === "@/lib/record-return-arrival") return {};
        if (name.endsWith("?url")) return { default: "/record-return.css" };
        throw new Error(name);
      },
    });
    return exports.RecordReturnNavigation();
  };
  assert.equal(render(null, input.target), null);
  assert.equal(render(context(), input.target), null);
  const reading = { ...context(), phase: "reading" };
  assert.equal(render(reading, { pathname: "/world", search: {} }), null);
  const tree = render(reading, input.target);
  const nav = tree.props.children[1];
  assert.equal(nav.type, "nav");
  assert.equal(nav.props.children[0].props.to, "/search");
  assert.equal(nav.props.children[0].props.hash, input.source.cardId);
  const target = { pathname: "/world", search: { guide: "keepers" }, hash: "manager-archive" };
  const guided = { ...state.makeRecordReturn({ ...input, target }, now), phase: "reading" };
  assert.equal(render(guided, target), null);
  assert.doesNotMatch(
    read("src/components/library/record-return-navigation.tsx"),
    /search-data|library-data|search-engine/,
  );
});
