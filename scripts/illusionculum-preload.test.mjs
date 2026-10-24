import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createIllusionculumPreloader,
  ILLUSIONCULUM_PRELOAD_URLS,
} from "../src/lib/illusionculum-preload.ts";

const environment = (fetch, overrides = {}) => ({
  fetch,
  matchMedia: () => ({ matches: false }),
  document: { documentElement: { dataset: {} } },
  navigator: {},
  ...overrides,
});

test("intent warms exact compressed entry resources and code without decoding or mounting", async () => {
  const requests = [];
  let imports = 0;
  const warm = createIllusionculumPreloader(
    environment(async (url, options) => {
      requests.push([url, options]);
      return new Response(new Uint8Array([1, 2, 3]));
    }),
    async () => {
      imports += 1;
    },
  );
  const first = warm();
  assert.equal(warm(), first);
  await first;
  assert.equal(imports, 1);
  assert.deepEqual(
    requests.map(([url]) => url),
    [...ILLUSIONCULUM_PRELOAD_URLS],
  );
  assert.ok(
    requests.every(
      ([, options]) => options.cache === "force-cache" && options.mode === "same-origin",
    ),
  );
  const source = readFileSync(
    new URL("../src/lib/illusionculum-preload.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /new Image|\.decode\(|createImageBitmap|createElement\(|\.arrayBuffer\(|\.blob\(|mountIllusionculumAssemblyEngine\(/,
  );
  const loader = readFileSync(new URL("../src/lib/asset-loader.ts", import.meta.url), "utf8");
  assert.match(
    loader,
    /if \(urls.includes\(ILLUSIONCULUM_HERO.src\)\) void preloadIllusionculumAssembly\(\)/,
  );
});

test("network and code stalls settle at deadline, abort, and permit another attempt", async () => {
  const signals = [];
  const warm = createIllusionculumPreloader(
    environment((_url, options) => {
      signals.push(options.signal);
      return new Promise(() => {});
    }),
    () => new Promise(() => {}),
    10,
  );
  await warm();
  assert.equal(signals.length, ILLUSIONCULUM_PRELOAD_URLS.length);
  assert.ok(signals.every((signal) => signal.aborted));
  await warm();
  assert.equal(signals.length, ILLUSIONCULUM_PRELOAD_URLS.length * 2);
});

test("HTTP and import failures are retryable and never reject navigation", async () => {
  let attempts = 0;
  const warm = createIllusionculumPreloader(
    environment(async () => {
      attempts += 1;
      return new Response(null, { status: 503 });
    }),
    async () => {
      throw new Error("chunk unavailable");
    },
  );
  await warm();
  await warm();
  assert.equal(attempts, ILLUSIONCULUM_PRELOAD_URLS.length * 2);
});

test("motion, economy and data-saving gates prevent speculative work", async () => {
  const gates = [
    { matchMedia: () => ({ matches: true }) },
    { document: { documentElement: { dataset: { worldEffects: "economy" } } } },
    { navigator: { connection: { saveData: true } } },
    { navigator: { connection: { effectiveType: "2g" } } },
    { navigator: { connection: { effectiveType: "slow-2g" } } },
  ];
  for (const gate of gates) {
    const fail = () => {
      assert.fail("gated preload started");
    };
    await createIllusionculumPreloader(environment(fail, gate), fail)();
  }
});
