import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { LoadingManager } from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GuardianDracoLoader } from "../src/lib/dogs-archive/draco.ts";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("three").replace(/build[/\\]three\.cjs$/, "package.json");
const geometryData = () => ({
  attributes: [
    { name: "position", array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), itemSize: 3 },
  ],
});

test("the scoped adapter matches the reviewed three r186 decoder lifecycle", () => {
  assert.equal(
    JSON.parse(readFileSync(packagePath, "utf8")).version,
    "0.186.1",
    "review private decoder fields when upgrading three",
  );
  for (const method of [
    "_initDecoder",
    "_getWorker",
    "_createGeometry",
    "decodeGeometry",
    "dispose",
  ])
    assert.equal(
      typeof DRACOLoader.prototype[method],
      "function",
      `three decoder changed ${method}`,
    );
  const loader = new GuardianDracoLoader(new AbortController().signal, new LoadingManager());
  assert.ok(Array.isArray(loader.workerPool));
  assert.equal(loader.workerLimit, 1);
  loader.dispose();
});

test("self-hosted decoder bytes and licenses match the reviewed dependency", () => {
  const directory = new URL("../public/dogs-archive-20261028/decoders/draco/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("asset-manifest.json", directory), "utf8"));
  assert.equal(manifest.source, "three@0.186.1/examples/jsm/libs/draco/gltf");
  for (const file of manifest.files) {
    const bytes = readFileSync(new URL(file.name, directory));
    assert.equal(bytes.length, file.bytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      file.sha256,
      `${file.name} was modified`,
    );
    assert.deepEqual(
      bytes,
      readFileSync(resolve(dirname(packagePath), "examples/jsm/libs/draco/gltf", file.name)),
    );
  }
  assert.match(
    readFileSync(new URL("LICENSE-APACHE-2.0.txt", directory), "utf8"),
    /Apache License\s+Version 2\.0/,
  );
  assert.deepEqual(
    readFileSync(new URL("LICENSE-three-MIT.txt", directory)),
    readFileSync(resolve(dirname(packagePath), "LICENSE")),
  );
});

test("abort rejects queued decoder callbacks and terminates the one worker", async (t) => {
  const controller = new AbortController();
  const loader = new GuardianDracoLoader(controller.signal, new LoadingManager());
  t.after(() => loader.dispose());
  let terminated = 0;
  let created = 0;
  const previousWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  // Native DRACOLoader still constructs and configures the worker/callback
  // queues. Only the browser transport is inert, so no decode completes.
  class PendingWorker {
    constructor() {
      created++;
    }
    postMessage() {}
    terminate() {
      terminated++;
    }
  }
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    writable: true,
    value: PendingWorker,
  });
  t.after(() => {
    if (previousWorker) Object.defineProperty(globalThis, "Worker", previousWorker);
    else delete globalThis.Worker;
  });
  loader._initDecoder = () => Promise.resolve();
  const failures = [];
  const waiting = [1, 2, 3].map(() =>
    loader.decodeGeometry(new ArrayBuffer(12), {}).catch((error) => failures.push(error.name)),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(created, 1, "actual r186 scheduling respects the worker limit");
  const worker = loader.workerPool[0];
  assert.equal(
    Object.keys(worker._callbacks).length,
    3,
    "actual decoder registered each unresolved task",
  );
  controller.abort();
  await Promise.all(waiting);
  assert.deepEqual(failures, ["AbortError", "AbortError", "AbortError"]);
  assert.equal(terminated, 1);
  assert.equal(worker.onmessage, null);
  assert.equal(worker.onerror, null);
  assert.equal(loader.getDiagnostics().workers, 0);
  assert.equal(loader.getDiagnostics().closed, true);
  loader.dispose();
  assert.equal(terminated, 1, "repeat cleanup is idempotent");
});

test("uncommitted decoded geometry is released but committed GLTF geometry stays alive", () => {
  const controller = new AbortController();
  const pending = new GuardianDracoLoader(controller.signal, new LoadingManager());
  const partial = pending._createGeometry(geometryData());
  let partialDisposals = 0;
  partial.addEventListener("dispose", () => partialDisposals++);
  controller.abort();
  assert.equal(partialDisposals, 1);
  const completed = new GuardianDracoLoader(new AbortController().signal, new LoadingManager());
  const geometry = completed._createGeometry(geometryData());
  let disposals = 0;
  geometry.addEventListener("dispose", () => disposals++);
  completed.commit();
  completed.dispose();
  assert.equal(disposals, 0, "scene owns committed buffers, not the decoder");
  geometry.dispose();
  assert.equal(disposals, 1);
});

test("decoder cleanup cancels its own pending fetch even before the scene signal aborts", async (t) => {
  const controller = new AbortController();
  const loader = new GuardianDracoLoader(controller.signal, new LoadingManager());
  t.after(() => loader.dispose());
  let requestSignal;
  t.mock.method(
    globalThis,
    "fetch",
    (_, options) =>
      new Promise((_, reject) => {
        requestSignal = options.signal;
        options.signal.addEventListener(
          "abort",
          () => reject(new DOMException("cancelled", "AbortError")),
          { once: true },
        );
      }),
  );
  const pending = assert.rejects(loader._loadLibrary("/local/draco_decoder.wasm", "arraybuffer"), {
    name: "AbortError",
  });
  loader.dispose();
  await pending;
  assert.equal(requestSignal.aborted, true);
  assert.equal(
    controller.signal.aborted,
    false,
    "a failed decoder can close without aborting unrelated scene work",
  );
});

test("late decoder initialization revokes its Blob URL and never starts a worker", async (t) => {
  const controller = new AbortController();
  const loader = new GuardianDracoLoader(controller.signal, new LoadingManager());
  t.after(() => loader.dispose());
  const libraryResolvers = [];
  loader._loadLibrary = () => new Promise((resolve) => libraryResolvers.push(resolve));
  const revoked = [];
  const original = URL.revokeObjectURL.bind(URL);
  t.mock.method(URL, "revokeObjectURL", (url) => {
    revoked.push(url);
    original(url);
  });
  loader.preload();
  assert.equal(libraryResolvers.length, 2, "actual WASM loader requests wrapper and binary");
  controller.abort();
  libraryResolvers[0]("");
  libraryResolvers[1](new ArrayBuffer(0));
  await assert.rejects(loader._initDecoder(), { name: "AbortError" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(revoked.length, 1, "late-generated bootstrap was revoked");
  assert.match(revoked[0], /^blob:/);
  assert.equal(loader.getDiagnostics().workers, 0);
});
