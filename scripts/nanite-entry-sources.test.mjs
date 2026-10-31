import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { refinedNaniteSource, NANITE_SURFACE_SOURCES } from "../src/lib/nanite-surface-assets.js";
import { REXONANCE_NANITE_ASSETS, REXONANCE_NANITE_CELLS } from "../src/lib/rexonance-nanites.ts";
import { FAR_FROM_NANITE_CELLS } from "../src/lib/far-from-nanites.ts";
import { FAR_FROM_ENTRY_KITS, FAR_FROM_ENTRY_KIT_ASSETS } from "../src/lib/far-from-entry-kits.ts";
import { ILLUSIONCULUM_PRELOAD_URLS } from "../src/lib/illusionculum-preload.ts";

test("Rexonance entry warmup fetches refined cells once and old/new lookups share the same bitmap", async () => {
  const source = readFileSync(
    new URL("../src/lib/rexonance-nanites-warmup.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const requests = [],
    exports = {};
  runInNewContext(code, {
    exports,
    AbortController,
    Map,
    Promise,
    window: { matchMedia: () => ({ matches: false }) },
    document: { hidden: false, documentElement: { dataset: {} } },
    navigator: {},
    fetch: async (source) => {
      requests.push(source);
      return { ok: true, blob: async () => ({ source }) };
    },
    createImageBitmap: async (blob) => ({ source: blob.source, close() {} }),
    require(name) {
      if (name.includes("nanite-surface-assets")) return { refinedNaniteSource };
      if (name.includes("rexonance-nanites.ts")) return { REXONANCE_NANITE_ASSETS };
      if (name.includes("rexonance-suit-warmup")) return { registerRexonanceNaniteWarm() {} };
      if (name.includes("rexonance-suit-extras")) return { prepareRexonanceNanites() {} };
      throw Error(`unexpected import ${name}`);
    },
  });
  assert.equal(await exports.warmRexonanceNanites("high"), true);
  assert.equal(await exports.warmRexonanceNanites("high"), true);
  assert.deepEqual(requests, REXONANCE_NANITE_ASSETS.map(refinedNaniteSource));
  assert.equal(new Set(requests).size, requests.length);
  const old = REXONANCE_NANITE_CELLS.src,
    current = refinedNaniteSource(old);
  assert.equal(requests.includes(old), false);
  assert.equal(exports.rexonanceNaniteSource(old), exports.rexonanceNaniteSource(current));
  assert.equal(exports.rexonanceNaniteSource(old).source, current);
  exports.releaseRexonanceNaniteSources();
  assert.equal(exports.rexonanceNaniteSource(old), null);
});
test("Far From entry rendering and prefetch share exact UV contracts and the refined sources", () => {
  for (const [i, source] of [REXONANCE_NANITE_CELLS, FAR_FROM_NANITE_CELLS].entries()) {
    const { src, ...layout } = source;
    const { src: entrySource, ...entryLayout } = FAR_FROM_ENTRY_KITS[i];
    assert.deepEqual(entryLayout, layout);
    assert.equal(entrySource, refinedNaniteSource(src));
    assert.ok(FAR_FROM_ENTRY_KIT_ASSETS.includes(entrySource));
    assert.equal(FAR_FROM_ENTRY_KIT_ASSETS.includes(src), false);
  }
});
test("Illusionculum intent requests current cells; arbitrary base, face and eye art pass unchanged", () => {
  assert.ok(
    ILLUSIONCULUM_PRELOAD_URLS.includes(
      NANITE_SURFACE_SOURCES["/illusionculum-nanites-20261027/cells.webp"],
    ),
  );
  assert.equal(
    ILLUSIONCULUM_PRELOAD_URLS.includes("/illusionculum-nanites-20261027/cells.webp"),
    false,
  );
  for (const source of [
    "/rexonance-suit-20261023/face.webp",
    "/rexonance-suit-20261023/figure.webp",
    "/rexonance-suit-20261023/undersuit-20261021.webp",
    "/illusionculum-suit-20261023/standard.webp",
  ])
    assert.equal(refinedNaniteSource(source), source);
});

test("Meta Unitas intent warms only refined cells while keeping base and face sources", async () => {
  const source = readFileSync(
    new URL("../src/lib/meta-unitas-entry-gate.ts", import.meta.url),
    "utf8",
  );
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const requests = [],
    exports = {};
  const suit = {
    META_UNITAS_RX_ASSETS: ["/meta/base.webp", "/meta/face.webp"],
    META_UNITAS_RX_DRIVER_STANDIN: "/meta/driver.webp",
  };
  runInNewContext(code, {
    exports,
    Promise,
    Image: class {
      set src(value) {
        requests.push(value);
      }
      decode() {
        return Promise.resolve();
      }
    },
    require(name) {
      if (name.includes("nanite-surface-assets")) return { refinedNaniteSource };
      if (name.includes("rexonance-nanites.ts")) return { REXONANCE_NANITE_ASSETS };
      if (name.includes("meta-unitas-rx-suit")) return suit;
      if (name.includes("meta-unitas-entry-playback"))
        return { META_UNITAS_ENTRY_DURATION_MS: 3100 };
      throw Error(`unexpected import ${name}`);
    },
  });
  assert.equal(await exports.warmMetaUnitasEntry(), true);
  assert.equal(await exports.warmMetaUnitasEntry(), true);
  assert.deepEqual(requests, [
    ...suit.META_UNITAS_RX_ASSETS,
    suit.META_UNITAS_RX_DRIVER_STANDIN,
    ...REXONANCE_NANITE_ASSETS.map(refinedNaniteSource),
  ]);
  assert.equal(requests.includes(REXONANCE_NANITE_CELLS.src), false);
});
