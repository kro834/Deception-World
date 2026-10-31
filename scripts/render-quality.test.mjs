import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { prefersLightweightRendering } from "../src/lib/rendering-profile.js";
import {
  readRenderQuality,
  RENDER_QUALITY_KEY,
  RENDER_QUALITY_HISTORY_KEY,
  saveRenderQuality,
} from "../src/lib/render-quality.ts";

test("render quality defaults to high and persists an explicit lightweight choice", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const attrs = new Map();
  const root = {
    dataset: {},
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: (key) => attrs.delete(key),
  };
  assert.equal(readRenderQuality(storage), "high");
  assert.equal(
    prefersLightweightRendering({ hardwareConcurrency: 2, connection: { saveData: true } }),
    false,
  );
  assert.equal(saveRenderQuality("lightweight", storage, root), true);
  assert.equal(readRenderQuality(storage), "lightweight");
  assert.equal(JSON.parse(values.get(RENDER_QUALITY_KEY)).quality, "lightweight");
  assert.equal(attrs.get("data-world-effects"), "economy");
  assert.equal(saveRenderQuality("high", storage, root), true);
  assert.equal(readRenderQuality(storage), "high");
  assert.equal(attrs.has("data-world-effects"), false);
});

test("storage and history failures do not falsely apply a choice", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  const attrs = new Map();
  const root = {
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: (key) => attrs.delete(key),
  };
  assert.equal(readRenderQuality(storage), "high");
  assert.equal(saveRenderQuality("lightweight", storage, root), false);
  assert.equal(attrs.has("data-world-effects"), false);
});

test("the menu control offers explicit persistent high and lightweight choices", () => {
  const component = readFileSync(
    new URL("../src/components/world/render-quality-control.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /高品質/);
  assert.match(component, /軽量/);
  assert.match(component, /aria-pressed=\{quality === value\}/);
  assert.match(component, /saveRenderQuality\(next\)/);
  assert.match(component, /window\.location\.reload\(\)/);
});

test("Save-Data suppresses search prefetch while leaving explicit loading available", () => {
  const source = readFileSync(
    new URL("../src/components/search/quick-search-events.ts", import.meta.url),
    "utf8",
  );
  const prefetch = source.slice(source.indexOf("export function prefetchQuickSearch"));
  assert.match(prefetch, /connection\?\.saveData/);
  assert.ok(prefetch.indexOf("return;") < prefetch.indexOf("loadQuickSearch()"));
  assert.match(
    source,
    /export const loadQuickSearch = \(\) => import\("\.\/quick-search-dialog"\)/,
  );
});

test("blocked localStorage retains the newer per-entry choice and preserves Tanstack history fields", () => {
  const storage = {
    getItem() {
      throw Error("blocked");
    },
    setItem() {
      throw Error("blocked");
    },
  };
  const history = {
    state: { __TSR_index: 3, key: "router-key", existing: { value: 1 } },
    replaceState(state) {
      this.state = state;
    },
  };
  assert.equal(saveRenderQuality("lightweight", storage, undefined, history), true);
  assert.equal(readRenderQuality(storage, history), "lightweight");
  assert.equal(history.state.__TSR_index, 3);
  assert.equal(history.state.key, "router-key");
  assert.deepEqual(history.state.existing, { value: 1 });
  assert.equal(saveRenderQuality("high", storage, undefined, history), true);
  assert.equal(readRenderQuality(storage, history), "high");
});
test("newer history quality wins over an old readable saved value in helper and prepaint", async () => {
  const storage = {
    getItem: () => "lightweight",
    setItem() {
      throw Error("quota");
    },
  };
  const history = {
    state: { [RENDER_QUALITY_HISTORY_KEY]: { quality: "high", revision: 1 } },
    replaceState(state) {
      this.state = state;
    },
  };
  assert.equal(readRenderQuality(storage, history), "high");
  const { DEVICE_RULES } = await import("../src/lib/device-profile-gate.js");
  const prepaint = new Function("window", "n", `${DEVICE_RULES}; return economy;`);
  assert.equal(prepaint({ history, localStorage: storage }, {}), false);
  history.state[RENDER_QUALITY_HISTORY_KEY] = { quality: "lightweight", revision: 2 };
  assert.equal(prepaint({ history, localStorage: { getItem: () => "high" } }, {}), true);
});
test("speculative Meta warmup has network gates while explicit preparation remains available", () => {
  const source = readFileSync(
    new URL("../src/lib/meta-unitas-entry-gate.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /connection\?\.saveData/);
  assert.match(
    source,
    /export function prefetchMetaUnitasEntry\(\) \{\s*if \(restrictedSpeculation\(\)\) return;/,
  );
  const prepare = source.slice(
    source.indexOf("export function prepareMetaUnitasTransition"),
    source.indexOf("let warm:"),
  );
  assert.doesNotMatch(prepare, /restrictedSpeculation/);
  assert.match(source, /typeof window === "undefined" \|\| restrictedSpeculation\(\)/);
});
test("when both browser persistence APIs reject the choice, DOM and current quality stay unchanged", () => {
  const storage = {
    getItem: () => "high",
    setItem() {
      throw Error("storage blocked");
    },
  };
  const history = {
    state: { __TSR_index: 2 },
    replaceState() {
      throw Error("history blocked");
    },
  };
  const attrs = new Map();
  const root = {
    setAttribute: (key, value) => attrs.set(key, value),
    removeAttribute: (key) => attrs.delete(key),
  };
  assert.equal(saveRenderQuality("lightweight", storage, root, history), false);
  assert.equal(readRenderQuality(storage, history), "high");
  assert.equal(attrs.size, 0);
  const component = readFileSync(
    new URL("../src/components/world/render-quality-control.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /if \(saveRenderQuality\(next\)\) \{\s*setQuality\(next\)/);
  assert.match(component, /描画品質を保存できませんでした/);
});

test("successful global choices supersede old Back entries and older blocked-storage fallbacks", async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const history = {
    state: { __TSR_index: 0 },
    replaceState(state) {
      this.state = state;
    },
  };
  assert.equal(saveRenderQuality("lightweight", storage, undefined, history), true);
  const entryA = { ...history.state };
  assert.ok(!Object.hasOwn(entryA, RENDER_QUALITY_HISTORY_KEY));
  history.state = { __TSR_index: 1 };
  assert.equal(saveRenderQuality("high", storage, undefined, history), true);
  history.state = entryA;
  assert.equal(readRenderQuality(storage, history), "high");
  const blocked = {
    getItem: storage.getItem,
    setItem() {
      throw Error("blocked");
    },
  };
  assert.equal(saveRenderQuality("lightweight", blocked, undefined, history), true);
  const fallbackEntry = { ...history.state };
  assert.equal(readRenderQuality(blocked, history), "lightweight");
  history.state = { __TSR_index: 2 };
  assert.equal(saveRenderQuality("high", storage, undefined, history), true);
  history.state = fallbackEntry;
  assert.equal(readRenderQuality(storage, history), "high");
  const { DEVICE_RULES } = await import("../src/lib/device-profile-gate.js");
  assert.equal(
    new Function("window", "n", `${DEVICE_RULES}; return economy;`)(
      { history, localStorage: storage },
      {},
    ),
    false,
  );
});
