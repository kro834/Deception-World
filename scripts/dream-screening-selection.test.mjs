import assert from "node:assert/strict";
import { test } from "node:test";
import { createScreeningSelection } from "../src/components/dream-chapter/dream-screening-selection.js";

test("a later selection wins even when the earlier image decodes last", async () => {
  const pending = new Map();
  const committed = [];
  const statuses = [];
  const selection = createScreeningSelection(
    (index) => new Promise((resolve) => pending.set(index, resolve)),
    (index) => committed.push(index),
    (status, index) => statuses.push([status, index]),
    15,
  );
  const first = selection.select(1);
  const second = selection.select(2);
  pending.get(2)(true);
  await second;
  pending.get(1)(true);
  await first;
  assert.deepEqual(committed, [2]);
  assert.deepEqual(statuses, [
    ["loading", 1],
    ["loading", 2],
    ["ready", 2],
  ]);
});

test("failed images keep the old picture and remain retryable", async () => {
  let ready = false;
  const committed = [];
  const statuses = [];
  const selection = createScreeningSelection(
    async () => ready,
    (index) => committed.push(index),
    (status, index) => statuses.push([status, index]),
    15,
  );
  await selection.select(15);
  assert.deepEqual(committed, []);
  assert.deepEqual(statuses.at(-1), ["error", 0]);
  ready = true;
  await selection.select(15);
  assert.deepEqual(committed, [0]);
  assert.deepEqual(statuses.at(-1), ["ready", 0]);
});

test("unmount invalidates a pending decode", async () => {
  let resolve;
  const committed = [];
  const statuses = [];
  const selection = createScreeningSelection(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
    (index) => committed.push(index),
    (status) => statuses.push(status),
    15,
  );
  const pending = selection.select(-1);
  selection.invalidate();
  resolve(true);
  await pending;
  assert.deepEqual(committed, []);
  assert.deepEqual(statuses, ["loading"]);
});
