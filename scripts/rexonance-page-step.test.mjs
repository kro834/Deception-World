import assert from "node:assert/strict";
import test from "node:test";
import { scheduleRexonancePageStep } from "../src/lib/rexonance-page-step.ts";

function fixture({ idle = true, hidden = false } = {}) {
  const jobs = new Map();
  const idles = new Map();
  const listeners = new Set();
  let id = 0;
  const env = {
    document: {
      hidden,
      addEventListener: (_, cb) => listeners.add(cb),
      removeEventListener: (_, cb) => listeners.delete(cb),
    },
    setTimeout: (cb, delay) => {
      jobs.set(++id, { cb, delay });
      return id;
    },
    clearTimeout: (key) => jobs.delete(key),
    requestIdleCallback: idle
      ? (cb) => {
          idles.set(++id, cb);
          return id;
        }
      : undefined,
    cancelIdleCallback: (key) => idles.delete(key),
  };
  return { env, jobs, idles, listeners };
}

test("an abandoned native idle callback cannot strand the lower chapters", () => {
  const t = fixture();
  let count = 0;
  scheduleRexonancePageStep(() => count++, 32, t.env);
  const lateIdle = [...t.idles.values()][0];
  const timer = [...t.jobs.values()][0];
  assert.equal(timer.delay, 260);
  timer.cb();
  lateIdle();
  assert.equal(count, 1);
  assert.equal(t.jobs.size + t.idles.size + t.listeners.size, 0);
});

test("successful idle work cancels its fallback and runs exactly once", () => {
  const t = fixture();
  let count = 0;
  scheduleRexonancePageStep(() => count++, 32, t.env);
  const lateTimer = [...t.jobs.values()][0].cb;
  [...t.idles.values()][0]();
  lateTimer();
  assert.equal(count, 1);
  assert.equal(t.jobs.size + t.idles.size + t.listeners.size, 0);
});

test("hidden chapters do no work and resume with a bounded task on return", () => {
  const t = fixture({ hidden: true });
  let count = 0;
  const cancel = scheduleRexonancePageStep(() => count++, 32, t.env);
  assert.equal(t.jobs.size + t.idles.size, 0);
  t.env.document.hidden = false;
  [...t.listeners][0]();
  const stale = [...t.idles.values()][0];
  t.env.document.hidden = true;
  [...t.listeners][0]();
  stale();
  assert.equal(count, 0);
  t.env.document.hidden = false;
  [...t.listeners][0]();
  cancel();
  assert.equal(t.jobs.size + t.idles.size + t.listeners.size, 0);
});

test("Safari without idle callbacks retains the requested reveal delay", () => {
  const t = fixture({ idle: false });
  let count = 0;
  const cancel = scheduleRexonancePageStep(() => count++, 400, t.env);
  const timer = [...t.jobs.values()][0];
  assert.equal(timer.delay, 400);
  cancel();
  timer.cb();
  assert.equal(count, 0);
});
