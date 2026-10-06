import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRexonanceTransitionLoader } from "../src/lib/rexonance-transition-loader.ts";

test("the shared gate loads the renderer before cover and retains it through reveal", () => {
  const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
  const loader = readFileSync(
    new URL("../src/lib/rexonance-transition-loader.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(gate, /from ["']@\/components\/rexonance-saga\/rexonance-call-sequence["']/);
  assert.match(
    loader,
    /\(\) => import\("\.\.\/components\/rexonance-saga\/rexonance-call-sequence"\)/,
  );
  assert.match(
    gate,
    /rexonanceCall = await preparation\.promise;[\s\S]*?if \(!isCurrent\(\)\) return;[\s\S]*?setGate\(\{[\s\S]*?phase: "covering",[\s\S]*?rexonanceCall,/,
  );
  assert.match(gate, /phase: "revealing",\s*scene: landed,\s*rexonanceCall,/);
  assert.match(gate, /const callOnly = Boolean\(rexonanceCall\);/);
  assert.match(gate, /diveVariant === "rexonance" && !rexonanceCall\s*\? CALM_TIMINGS/);
});

test("Rexonance imports only on demand and shares cached successful requests", async () => {
  let imports = 0;
  const renderer = () => null;
  const prepare = createRexonanceTransitionLoader(async () => {
    imports++;
    return { RexonanceCallSequence: renderer };
  });
  assert.equal(imports, 0);
  const first = prepare(),
    second = prepare();
  assert.deepEqual(await Promise.all([first.promise, second.promise]), [renderer, renderer]);
  assert.equal(await prepare().promise, renderer);
  assert.equal(imports, 1);
});

for (const failure of ["throw", "reject"]) {
  test(`a ${failure} is handled and permits retry`, async () => {
    let imports = 0;
    const renderer = () => null;
    const prepare = createRexonanceTransitionLoader(() => {
      imports++;
      if (imports === 1) {
        if (failure === "throw") throw new Error("offline");
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve({ RexonanceCallSequence: renderer });
    });
    assert.equal(await prepare().promise, null);
    assert.equal(await prepare().promise, renderer);
    assert.equal(imports, 2);
  });
}

for (const reason of ["deadline", "cancel"]) {
  test(`${reason} settles preparation without a late import reviving its result`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let release;
    const renderer = () => null;
    const prepare = createRexonanceTransitionLoader(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const request = prepare(50);
    await Promise.resolve();
    if (reason === "cancel") request.cancel();
    else t.mock.timers.tick(50);
    assert.equal(await request.promise, null);
    release({ RexonanceCallSequence: renderer });
    assert.equal(await request.promise, null);
    assert.equal(await prepare().promise, renderer);
  });
}
