import assert from "node:assert/strict";
import test from "node:test";
import {
  preloadRouteWithDeadline,
  ROUTE_WARMUP_DEADLINE_MS,
} from "../src/lib/route-warmup-deadline.ts";

test("stalled route preload settles without starting late navigation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let navigations = 0;
  const pending = preloadRouteWithDeadline(() => held).then((ready) => {
    if (ready) navigations += 1;
    return ready;
  });
  await Promise.resolve();
  t.mock.timers.tick(ROUTE_WARMUP_DEADLINE_MS);
  assert.equal(await pending, false);
  release();
  await Promise.resolve();
  assert.equal(navigations, 0);
});

test("successful preload clears its timer and continues once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(await preloadRouteWithDeadline(async () => undefined), true);
  t.mock.timers.tick(ROUTE_WARMUP_DEADLINE_MS);
});

for (const failure of ["reject", "throw"]) {
  test(`${failure} allows the router's existing error recovery to handle a failed chunk`, async () => {
    assert.equal(
      await preloadRouteWithDeadline(() => {
        if (failure === "throw") throw new Error("chunk failed");
        return Promise.reject(new Error("chunk failed"));
      }),
      true,
    );
  });
}
