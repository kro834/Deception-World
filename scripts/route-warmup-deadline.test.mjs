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

test("cancellation stops waiting for an unsettled preload immediately", async () => {
  const request = new AbortController();
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const pending = preloadRouteWithDeadline(() => held, request.signal);
  await Promise.resolve();
  request.abort();
  assert.equal(await pending, false);
  release();
});

test("a cancelled request never starts work queued for the next microtask", async () => {
  const request = new AbortController();
  let started = false;
  const pending = preloadRouteWithDeadline(async () => {
    started = true;
  }, request.signal);
  request.abort();
  assert.equal(await pending, false);
  assert.equal(started, false);
});

test("a rejected navigation is distinct from a rejected preload", async () => {
  assert.equal(
    await preloadRouteWithDeadline(
      async () => {
        throw new Error("commit failed before rendering");
      },
      undefined,
      { proceedOnError: false },
    ),
    false,
  );
});
