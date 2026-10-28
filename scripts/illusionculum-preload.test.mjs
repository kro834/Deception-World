import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createIllusionculumPreloader,
  ILLUSIONCULUM_PRELOAD_URLS,
  ILLUSIONCULUM_COMPACT_ENTRY_URLS,
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
    /if \(urls.includes\(ILLUSIONCULUM_HERO.src\)\) void preloadIllusionculumAssembly\(\{ entry: true \}\)/,
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

test("successful intent streams and code are reused across focus, click and page warming", async () => {
  const requests = []; let imports = 0;
  const warm = createIllusionculumPreloader(environment(async (url) => {
    requests.push(url); return new Response(new Uint8Array([1]));
  }), async () => { imports++; });
  await warm(); await warm(); await warm();
  assert.deepEqual(requests, [...ILLUSIONCULUM_PRELOAD_URLS]);
  assert.equal(imports, 1);
});

test("compact entry warms only rendered sheets; the scroll scene still receives its gold and guide", async () => {
  const requests = [];
  const warm = createIllusionculumPreloader(environment(async (url) => {
    requests.push(url); return new Response(new Uint8Array([1]));
  }, { matchMedia: (query) => ({ matches: query.includes("coarse") }) }), async () => {});
  await warm({ entry: true });
  assert.deepEqual(requests, [...ILLUSIONCULUM_COMPACT_ENTRY_URLS]);
  await warm();
  assert.equal(requests.length, ILLUSIONCULUM_PRELOAD_URLS.length);
  assert.equal(new Set(requests).size, requests.length, "shared entry sheets are not streamed twice");
  assert.ok(ILLUSIONCULUM_PRELOAD_URLS.every((url) => requests.includes(url)));
});

test("a full-scene request upgrades an in-flight compact entry without duplicating its streams", async () => {
  const requests = []; let release;
  const ready = new Promise((resolve) => { release = resolve; });
  const warm = createIllusionculumPreloader(environment(async (url) => {
    requests.push(url); await ready; return new Response(new Uint8Array([1]));
  }, { matchMedia: (query) => ({ matches: query.includes("coarse") }) }), async () => {});
  const entry = warm({ entry: true }); const scroll = warm();
  assert.equal(requests.length, ILLUSIONCULUM_COMPACT_ENTRY_URLS.length);
  release(); await Promise.all([entry, scroll]);
  assert.equal(requests.length, ILLUSIONCULUM_PRELOAD_URLS.length);
  assert.equal(new Set(requests).size, requests.length);
});

test("partial failures retry only unfinished bytes while preserving successful code and sheets", async () => {
  const requests = []; let failed = false, imports = 0;
  const retryUrl = ILLUSIONCULUM_PRELOAD_URLS[3];
  const warm = createIllusionculumPreloader(environment(async (url) => {
    requests.push(url);
    if (url === retryUrl && !failed) { failed = true; return new Response(null, { status: 503 }); }
    return new Response(new Uint8Array([1]));
  }), async () => { imports++; });
  await warm(); await warm();
  assert.equal(requests.length, ILLUSIONCULUM_PRELOAD_URLS.length + 1);
  assert.equal(requests.at(-1), retryUrl);
  assert.equal(imports, 1);
});

test("critical entry decoding excludes the unused full cutout and later orbit sprites", () => {
  const loader = readFileSync(new URL("../src/lib/asset-loader.ts", import.meta.url), "utf8");
  const critical = loader.match(/ILLUSIONCULUM_SAGA_ENTER_ASSETS = \[([\s\S]*?)\] as const/)[1];
  assert.match(critical, /ILLUSIONCULUM_HERO\.src/);
  assert.match(critical, /undersuit\.webp/);
  assert.match(critical, /driver-standin\.webp/);
  assert.doesNotMatch(critical, /ENTRY_CUTOUT|orb-/);
});
