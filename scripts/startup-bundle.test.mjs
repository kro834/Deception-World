import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  analyzeStartupBundle,
  FORBIDDEN_STARTUP_PAYLOADS,
  STARTUP_BASELINE,
  STARTUP_BUDGET,
} from "./verify-startup-bundle.mjs";

const pageUrl = "https://startup.example/";
const html = '<script type="module" src="/assets/main.js"></script>';
function fixture(assets, options = {}) {
  const reads = [];
  return {
    reads,
    result: analyzeStartupBundle({
      pageUrl,
      html,
      ...options,
      readAsset: async (key) => {
        reads.push(key);
        assert.ok(Object.hasOwn(assets, key), `Unexpected asset read: ${key}`);
        return assets[key];
      },
    }),
  };
}

test("SSR roots include preloaded routes and count static shared/cyclic edges once", async () => {
  const assets = {
    "/assets/main.js": 'import "./shared.js"; import { x } from "./nested/edge.js"; export { x };',
    "/assets/shared.js": 'export const shared = "共通"; export * from "./nested/edge.js";',
    "/assets/nested/edge.js": 'import "../shared.js"; export const x = 1;',
    "/assets/opening.js": 'import "./shared.js"; export const opening = true;',
  };
  const run = fixture(assets, {
    html: `${html}
    <link rel='modulepreload' href='/assets/main.js'>
    <LINK HREF="/assets/opening.js" REL="modulepreload">
    <link rel="stylesheet" href="/assets/main.css">
    <script defer src="https://extensions.example/helper.js"></script>`,
  });
  const report = await run.result;
  assert.equal(report.ok, true);
  assert.equal(run.reads.length, 4);
  assert.equal(new Set(run.reads).size, 4);
  assert.deepEqual(report.criticalGraph, {
    modules: 4,
    bytes: Object.values(assets).reduce((sum, source) => sum + Buffer.byteLength(source), 0),
    gzipBytes: Object.values(assets).reduce((sum, source) => sum + gzipSync(source).length, 0),
  });
  assert.equal(report.entry.bytes, Buffer.byteLength(assets["/assets/main.js"]));
  assert.deepEqual(report.externalScripts, ["https://extensions.example/helper.js"]);
});

test("dynamic imports, preload-helper filename strings and unrelated assets stay deferred", async () => {
  const forbidden = FORBIDDEN_STARTUP_PAYLOADS.map((rule) => rule.markers[0]).join(";");
  const run = fixture(
    {
      "/assets/main.js": `const deps = ["assets/deferred.js"];
      const load = () => import("./deferred.js");
      const text = '<link rel="modulepreload" href="/assets/fake.js">';
      /* import "./comment.js"; */ export { load, text, deps };`,
      "/assets/deferred.js": `export const deferred = ${JSON.stringify(forbidden)};`,
    },
    {
      html: `<!-- <script type="module" src="/assets/comment.js"></script> -->${html}
    <script>const text = '<link rel="modulepreload" href="/assets/fake.js">';</script>`,
    },
  );
  const report = await run.result;
  assert.equal(report.ok, true);
  assert.deepEqual(run.reads, ["/assets/main.js"]);
  assert.deepEqual(report.violations, []);
});

test("every forbidden payload is detected through a static edge, including escaped Unicode", async () => {
  for (const rule of FORBIDDEN_STARTUP_PAYLOADS) {
    const escaped = [...rule.markers[0]]
      .map((character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)
      .join("");
    const report = await fixture({
      "/assets/main.js": 'export * from "./payload.js";',
      "/assets/payload.js": `export const value = "${escaped}";`,
    }).result;
    assert.equal(report.ok, false, rule.name);
    assert.equal(report.violations[0].payload, rule.name);
    assert.equal(report.violations[0].module, "/assets/payload.js");
  }
});

test("lightweight preview handshake and gallery IDs are allowed; implementation markers in comments are ignored", async () => {
  const report = await fixture({
    "/assets/main.js":
      'export const channel="grok-preview-bridge", ids=["g01","starlight"]; /* $ZodType __grokPreviewBridgeRoot */',
  }).result;
  assert.equal(report.ok, true);
});

test("entry budgets independently enforce decoded and gzip savings against the baseline", async () => {
  assert.ok(STARTUP_BUDGET.maxEntryBytes <= STARTUP_BASELINE.entryBytes * 0.8);
  assert.ok(STARTUP_BUDGET.maxEntryGzipBytes <= STARTUP_BASELINE.entryGzipBytes * 0.85);
  const source = 'export const x = "hello";';
  for (const budget of [
    { maxEntryBytes: 1, maxEntryGzipBytes: 1000 },
    { maxEntryBytes: 1000, maxEntryGzipBytes: 1 },
  ]) {
    const report = await fixture({ "/assets/main.js": source }, { budget }).result;
    assert.equal(report.ok, false);
    assert.equal(report.failures.length, 1);
    assert.match(report.failures[0], /Entry (?:gzip )?bytes .* exceed/u);
  }
});

test("moving payload into a static chunk cannot bypass critical graph decoded or gzip budgets", async () => {
  assert.ok(STARTUP_BUDGET.maxCriticalBytes <= STARTUP_BASELINE.criticalBytes * 0.85);
  assert.ok(STARTUP_BUDGET.maxCriticalGzipBytes <= STARTUP_BASELINE.criticalGzipBytes * 0.9);
  const entry = 'import "./payload.js";';
  const assets = {
    "/assets/main.js": entry,
    "/assets/payload.js": `export const payload = ${JSON.stringify(Array.from({ length: 128 }, (_, index) => `item-${index}`))};`,
  };
  for (const budget of [
    { maxCriticalBytes: Buffer.byteLength(entry) },
    { maxCriticalGzipBytes: gzipSync(entry).length },
  ]) {
    const report = await fixture(assets, { budget }).result;
    assert.equal(report.entry.bytes, Buffer.byteLength(entry));
    assert.ok(report.entry.bytes < report.budget.maxEntryBytes);
    assert.ok(report.entry.gzipBytes < report.budget.maxEntryGzipBytes);
    assert.equal(report.ok, false);
    assert.equal(report.failures.length, 1);
    assert.match(report.failures[0], /Critical graph (?:gzip )?bytes .* exceed/u);
  }
});

test("missing roots and unresolved static dependencies fail instead of undercounting", async () => {
  await assert.rejects(
    fixture({}, { html: "<html><body>Login required</body></html>" }).result,
    /no same-origin module entry/u,
  );
  await assert.rejects(
    fixture({ "/assets/main.js": 'import "unbundled-package";' }).result,
    /Unresolved module specifier/u,
  );
  await assert.rejects(
    fixture({ "/assets/main.js": 'import "./missing.js";' }).result,
    /Unexpected asset read/u,
  );
  const external = await fixture({ "/assets/main.js": 'import "https://cdn.example/external.js";' })
    .result;
  assert.equal(external.ok, false);
  assert.match(external.failures[0], /External critical module/u);
});

test("inline module static imports seed the graph without following dynamic imports", async () => {
  const run = fixture(
    { "/assets/main.js": "export const x = 1;" },
    {
      html: '<script type="module">import "/assets/main.js"; import("/assets/later.js");</script>',
    },
  );
  const report = await run.result;
  assert.equal(report.ok, true);
  assert.deepEqual(report.entryRoots, ["/assets/main.js"]);
  assert.deepEqual(run.reads, ["/assets/main.js"]);
});
