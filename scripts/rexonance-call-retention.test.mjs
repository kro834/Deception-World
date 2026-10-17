import assert from "node:assert/strict";
import test from "node:test";
import { createRexonanceCallRetention } from "../src/lib/rexonance-call-retention.ts";

function fixture() {
  const timers = new Map();
  const events = new Map();
  let next = 0;
  let releases = 0;
  let drawing = false;
  const environment = {
    location: { pathname: "/rexonance-saga" },
    document: {
      hidden: false,
      documentElement: { dataset: {} },
      addEventListener: (name, fn) => events.set(name, fn),
      removeEventListener: (name) => events.delete(name),
    },
    matchMedia: () => ({ matches: false }),
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
    setTimeout: (fn) => {
      timers.set(++next, fn);
      return next;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const lease = createRexonanceCallRetention(
    () => releases++,
    () => drawing,
    environment,
  );
  return {
    lease,
    environment,
    timers,
    events,
    releases: () => releases,
    drawing: (value) => {
      drawing = value;
    },
    tick: () => {
      const fn = timers.values().next().value;
      timers.clear();
      fn?.();
    },
  };
}

test("one prepared kit survives long visits and immediate World returns without preparation", () => {
  const f = fixture();
  f.lease.retain();
  for (let n = 0; n < 120; n++) f.tick();
  f.environment.location.pathname = "/world";
  f.tick();
  assert.equal(f.releases(), 0);
  assert.equal(f.timers.size, 1);
  f.lease.acquire();
  assert.equal(f.timers.size, 0);
  assert.equal(f.events.size, 0);
  f.lease.retain();
  f.lease.retain();
  assert.equal(f.timers.size, 1, "repeated cleanup does not duplicate timers");
});

for (const reason of ["hidden", "route", "economy", "reduced"]) {
  test(`retained kit is released on ${reason} and leaves no listeners`, () => {
    const f = fixture();
    f.lease.retain();
    if (reason === "hidden") f.environment.document.hidden = true;
    if (reason === "route") f.environment.location.pathname = "/dream-chapter";
    if (reason === "economy")
      f.environment.document.documentElement.dataset.worldEffects = "economy";
    if (reason === "reduced") f.environment.matchMedia = () => ({ matches: true });
    f.tick();
    assert.equal(f.releases(), 1);
    assert.equal(f.timers.size, 0);
    assert.equal(f.events.size, 0);
  });
}

test("visibility cleanup never disposes sheets owned by a drawing call", () => {
  const f = fixture();
  f.drawing(true);
  f.lease.retain();
  f.environment.document.hidden = true;
  f.events.get("visibilitychange")();
  assert.equal(f.releases(), 0);
  f.drawing(false);
  f.tick();
  assert.equal(f.releases(), 1);
  assert.equal(f.timers.size, 0);
});

test("pagehide releases even before visibility changes", () => {
  const f = fixture();
  f.lease.retain();
  f.events.get("pagehide")();
  assert.equal(f.releases(), 1);
  assert.equal(f.timers.size, 0);
  assert.equal(f.events.size, 0);
});
