import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const compile = (path) =>
  ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;

const timing = {};
runInNewContext(compile("src/components/cinematic/opening-timing.ts"), { exports: timing });
const burnCode = compile("src/components/cinematic/opening-burn.ts");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function runtime() {
  const requests = [];
  const closed = [];
  const engine = {};
  runInNewContext(burnCode, {
    exports: engine,
    require(name) {
      if (name === "@/lib/rendering-profile") return { hasConstrainedResources: () => false };
      if (name === "./opening-timing") return timing;
      if (name === "./opening-gl") {
        return {
          ShaderPass: class {},
          loadGlImage(source) {
            const pending = deferred();
            requests.push({ source, ...pending });
            return pending.promise;
          },
          closeGlImage(image) {
            if (image) closed.push(image);
          },
          shouldDegrade: () => false,
        };
      }
      return {};
    },
  });
  return { engine, requests, closed };
}

const image = (source) => ({ source, width: 100, height: 80 });
const settlePair = (ui, start, first, final) => {
  ui.requests[start].resolve(first);
  ui.requests[start + 1].resolve(final);
};

test("successful preparation is shared, cached, and released once", async () => {
  const ui = runtime();
  const pending = ui.engine.prepareOpeningBurn("ice.webp", "prism.webp", 1024);
  assert.equal(ui.engine.prepareOpeningBurn("ice.webp", "prism.webp", 1024), pending);
  assert.deepEqual(ui.requests.map(({ source }) => source), ["ice.webp", "prism.webp"]);

  const first = image("ice");
  const final = image("prism");
  settlePair(ui, 0, first, final);
  const assets = await pending;
  assert.equal(assets.first, first);
  assert.equal(assets.final, final);
  assert.equal(ui.engine.prepareOpeningBurn("ice.webp", "prism.webp", 1024), pending);
  assert.deepEqual(ui.closed, []);

  ui.engine.releaseOpeningBurn();
  assert.deepEqual(ui.closed, [first, final]);
});

for (const successIndex of [0, 1]) {
  test(`a fulfilled image is closed when its partner rejects (success request ${successIndex + 1})`, async () => {
    const ui = runtime();
    const pending = ui.engine.prepareOpeningBurn("ice.webp", "prism.webp", 1024);
    const successful = image(`success-${successIndex}`);
    const failure = new Error(`decode-${successIndex}`);
    ui.requests[successIndex].resolve(successful);
    ui.requests[1 - successIndex].reject(failure);

    await assert.rejects(pending, (error) => error === failure);
    assert.deepEqual(ui.closed, [successful]);

    const retry = ui.engine.prepareOpeningBurn("ice.webp", "prism.webp", 1024);
    assert.notEqual(retry, pending);
    assert.equal(ui.requests.length, 4);
    const retriedFirst = image("retry-ice");
    const retriedFinal = image("retry-prism");
    settlePair(ui, 2, retriedFirst, retriedFinal);
    const retriedAssets = await retry;
    assert.equal(retriedAssets.first, retriedFirst);
    assert.equal(retriedAssets.final, retriedFinal);
    assert.deepEqual(ui.closed, [successful]);
  });
}

test("release during pending decode prevents adoption and closes late successes", async () => {
  const ui = runtime();
  const abandoned = ui.engine.prepareOpeningBurn("ice.webp", "prism.webp", 1024);
  ui.engine.releaseOpeningBurn();

  const active = ui.engine.prepareOpeningBurn("ice.webp", "prism.webp", 1024);
  assert.notEqual(active, abandoned);
  assert.equal(ui.engine.prepareOpeningBurn("ice.webp", "prism.webp", 1024), active);
  assert.equal(ui.requests.length, 4);

  const abandonedFirst = image("abandoned-ice");
  const abandonedFinal = image("abandoned-prism");
  const activeFirst = image("active-ice");
  const activeFinal = image("active-prism");
  settlePair(ui, 0, abandonedFirst, abandonedFinal);
  settlePair(ui, 2, activeFirst, activeFinal);
  const abandonedAssets = await abandoned;
  const activeAssets = await active;
  assert.equal(abandonedAssets.first, abandonedFirst);
  assert.equal(abandonedAssets.final, abandonedFinal);
  assert.equal(activeAssets.first, activeFirst);
  assert.equal(activeAssets.final, activeFinal);
  assert.deepEqual(ui.closed, [abandonedFirst, abandonedFinal]);

  ui.engine.releaseOpeningBurn();
  assert.deepEqual(ui.closed, [abandonedFirst, abandonedFinal, activeFirst, activeFinal]);
});
