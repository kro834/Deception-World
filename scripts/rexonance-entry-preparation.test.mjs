import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/lib/rexonance-entry-preparation.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

function fixture() {
  let now = 0,
    serial = 0;
  const timers = new Map(),
    exports = {};
  runInNewContext(code, {
    exports,
    window: {
      setTimeout(callback, duration) {
        timers.set(++serial, { callback, at: now + duration });
        return serial;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  });
  return {
    prepare: exports.prepareRexonanceEntry,
    pendingTimers: () => timers.size,
    deadlines: () => [...timers.values()].map(({ at }) => at),
    async flush() {
      for (let index = 0; index < 12; index++) await Promise.resolve();
    },
    async tick(duration) {
      now += duration;
      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback();
      }
      for (let index = 0; index < 12; index++) await Promise.resolve();
    },
  };
}

test("decoded layers and plan share one total deadline and clear it on success", async () => {
  const f = fixture(),
    decoded = deferred(),
    plan = deferred();
  let plans = 0;
  const entry = f.prepare({
    decoded: decoded.promise,
    prepare: () => {
      plans++;
      return plan.promise;
    },
    deadlineMs: 1800,
  });
  assert.deepEqual(f.deadlines(), [1800]);
  await f.tick(1500);
  assert.equal(plans, 0);
  decoded.resolve(true);
  await f.flush();
  assert.equal(plans, 1);
  assert.deepEqual(f.deadlines(), [1800], "plan work must not restart the decoder's budget");
  await f.tick(299);
  plan.resolve(true);
  await f.flush();
  assert.equal(await entry.promise, true);
  assert.equal(f.pendingTimers(), 0);
  entry.cancel();
  assert.equal(await entry.promise, true, "a later cancellation cannot overwrite success");
});

test("deadline ends a stalled decoder and late decoding never starts a plan", async () => {
  const f = fixture(),
    decoded = deferred();
  let plans = 0;
  const entry = f.prepare({
    decoded: decoded.promise,
    prepare: () => {
      plans++;
      return Promise.resolve(true);
    },
    deadlineMs: 1800,
  });
  await f.tick(1800);
  assert.equal(await entry.promise, false);
  assert.equal(f.pendingTimers(), 0);
  decoded.resolve(true);
  await f.flush();
  assert.equal(plans, 0);
  assert.equal(await entry.promise, false);
});

test("cancelling before decode resolves releases its timer and never starts a plan", async () => {
  const f = fixture(),
    decoded = deferred();
  let plans = 0;
  const entry = f.prepare({
    decoded: decoded.promise,
    prepare: () => {
      plans++;
      return Promise.resolve(true);
    },
    deadlineMs: 1800,
  });
  entry.cancel();
  entry.cancel();
  assert.equal(await entry.promise, false);
  assert.equal(f.pendingTimers(), 0);
  decoded.resolve(true);
  await f.flush();
  assert.equal(plans, 0);
});

for (const finish of ["cancel", "deadline"]) {
  for (const late of ["resolve", "reject"]) {
    test(`${finish} while a plan waits ignores its late ${late}`, async () => {
      const f = fixture(),
        plan = deferred();
      let plans = 0;
      const entry = f.prepare({
        decoded: Promise.resolve(true),
        prepare: () => {
          plans++;
          return plan.promise;
        },
        deadlineMs: 120,
      });
      await f.flush();
      assert.equal(plans, 1);
      if (finish === "cancel") entry.cancel();
      else await f.tick(120);
      assert.equal(await entry.promise, false);
      assert.equal(f.pendingTimers(), 0);
      if (late === "resolve") plan.resolve(true);
      else plan.reject(new Error("late shared plan failure"));
      await f.flush();
      assert.equal(await entry.promise, false);
    });
  }
}

for (const failure of ["false", "reject"]) {
  test(`decoder ${failure} settles safely without invoking the plan`, async () => {
    const f = fixture();
    let plans = 0;
    const decoded =
      failure === "false" ? Promise.resolve(false) : Promise.reject(new Error("decode failure"));
    const entry = f.prepare({
      decoded,
      prepare: () => {
        plans++;
        return Promise.resolve(true);
      },
      deadlineMs: 1800,
    });
    await f.flush();
    assert.equal(await entry.promise, false);
    assert.equal(plans, 0);
    assert.equal(f.pendingTimers(), 0);
  });
}

for (const failure of ["false", "reject", "throw"]) {
  test(`plan ${failure} settles safely and clears its deadline`, async () => {
    const f = fixture();
    const entry = f.prepare({
      decoded: Promise.resolve(true),
      prepare() {
        if (failure === "throw") throw new Error("plan failure");
        return failure === "false"
          ? Promise.resolve(false)
          : Promise.reject(new Error("plan failure"));
      },
      deadlineMs: 120,
    });
    await f.flush();
    assert.equal(await entry.promise, false);
    assert.equal(f.pendingTimers(), 0);
  });
}

test("cancelling one intent cannot cancel the shared decoder of a later intent", async () => {
  const f = fixture(),
    decoded = deferred();
  let plans = 0;
  const options = {
    decoded: decoded.promise,
    prepare: () => {
      plans++;
      return Promise.resolve(true);
    },
    deadlineMs: 1800,
  };
  const oldEntry = f.prepare(options),
    latest = f.prepare(options);
  assert.equal(f.pendingTimers(), 2);
  oldEntry.cancel();
  assert.equal(f.pendingTimers(), 1);
  decoded.resolve(true);
  await f.flush();
  assert.equal(await oldEntry.promise, false);
  assert.equal(await latest.promise, true);
  assert.equal(plans, 1);
  assert.equal(f.pendingTimers(), 0);
});

for (const budget of [0, -1, Infinity, NaN]) {
  test(`invalid/exhausted deadline ${String(budget)} never waits or starts a plan`, async () => {
    const f = fixture();
    let plans = 0;
    const entry = f.prepare({
      decoded: Promise.resolve(true),
      prepare: () => {
        plans++;
        return Promise.resolve(true);
      },
      deadlineMs: budget,
    });
    await f.flush();
    assert.equal(await entry.promise, false);
    assert.equal(plans, 0);
    assert.equal(f.pendingTimers(), 0);
  });
}

test("a decoder rejection after immediate cancellation is still observed", async () => {
  const f = fixture(),
    decoded = deferred();
  const entry = f.prepare({
    decoded: decoded.promise,
    prepare: () => Promise.resolve(true),
    deadlineMs: 120,
  });
  entry.cancel();
  decoded.reject(new Error("late shared decoder failure"));
  await f.flush();
  assert.equal(await entry.promise, false);
  assert.equal(f.pendingTimers(), 0);
});
