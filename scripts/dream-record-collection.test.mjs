import assert from "node:assert/strict";
import test from "node:test";
import {
  DREAM_RECORD_COLLECTION_KEY,
  createDreamRecordCollection,
  dreamRecordCollectionFocus,
  validateDreamRecordCollection,
  watchDreamRecordCollection,
} from "../src/lib/dream-record-collection.js";

test("collections discard stale, duplicated, nonnumeric and unsupported entries", () => {
  const known = [1, 2, 49];
  assert.deepEqual(
    validateDreamRecordCollection({ version: 1, ids: [49, 1, 49, "2", 3, null] }, known),
    [49, 1],
  );
  for (const value of [null, [], { version: 2, ids: [1] }, { version: 1, ids: {} }]) {
    assert.deepEqual(validateDreamRecordCollection(value, known), []);
  }
});

test("multiple saves and removals survive a fresh visit without storing source text", () => {
  const values = new Map();
  const environment = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  const collection = createDreamRecordCollection([1, 2, 3], environment);
  assert.deepEqual(collection.setSaved(2, true), { ids: [2], available: true });
  assert.deepEqual(collection.setSaved(1, true).ids, [2, 1]);
  assert.deepEqual(createDreamRecordCollection([1, 2, 3], environment).snapshot().ids, [2, 1]);
  assert.deepEqual(collection.setSaved(2, false).ids, [1]);
  assert.deepEqual(collection.setSaved(999, true).ids, [1]);
  assert.deepEqual(JSON.parse(values.get(DREAM_RECORD_COLLECTION_KEY)), { version: 1, ids: [1] });
  const snapshot = collection.snapshot();
  snapshot.ids.push(3);
  assert.deepEqual(collection.snapshot().ids, [1]);
});

test("corrupted storage recovers on the next deliberate save", () => {
  let value = "{broken";
  const collection = createDreamRecordCollection([1], {
    localStorage: {
      getItem: () => value,
      setItem: (_key, next) => {
        value = next;
      },
    },
  });
  assert.deepEqual(collection.snapshot(), { ids: [], available: true });
  assert.deepEqual(collection.setSaved(1, true), { ids: [1], available: true });
  assert.deepEqual(JSON.parse(value), { version: 1, ids: [1] });
});

test("denied storage access, reads and writes retain a temporary usable collection", () => {
  const denied = {
    get localStorage() {
      throw new Error("denied");
    },
  };
  const readDenied = {
    localStorage: {
      getItem() {
        throw new Error("denied");
      },
      setItem() {},
    },
  };
  const writeDenied = {
    localStorage: {
      getItem: () => null,
      setItem() {
        throw new Error("quota");
      },
    },
  };
  for (const environment of [denied, readDenied, writeDenied, {}]) {
    const collection = createDreamRecordCollection([1, 2], environment);
    assert.deepEqual(collection.setSaved(1, true), { ids: [1], available: false });
    assert.deepEqual(collection.setSaved(2, true), { ids: [1, 2], available: false });
    assert.deepEqual(collection.setSaved(1, false), { ids: [2], available: false });
  }
});

test("stale tabs preserve other saves and apply the visible add/remove intent idempotently", () => {
  let stored = null;
  const environment = {
    localStorage: {
      getItem: () => stored,
      setItem: (_key, next) => {
        stored = next;
      },
    },
  };
  const first = createDreamRecordCollection([1, 2, 3], environment);
  const second = createDreamRecordCollection([1, 2, 3], environment);
  first.setSaved(1, true);
  assert.deepEqual(second.setSaved(2, true).ids, [1, 2]);
  assert.deepEqual(first.setSaved(2, true).ids, [1, 2], "stale add must not become removal");
  second.setSaved(1, false);
  assert.deepEqual(first.setSaved(1, false).ids, [2], "stale remove must not become add");
  assert.deepEqual(JSON.parse(stored), { version: 1, ids: [2] });
});

test("cross-tab saves and clear sync once without writes; unrelated events and cleanup do nothing", () => {
  let stored = null;
  let reads = 0;
  let writes = 0;
  const environment = new EventTarget();
  environment.localStorage = {
    getItem: () => {
      reads += 1;
      return stored;
    },
    setItem: (_key, next) => {
      writes += 1;
      stored = next;
    },
  };
  const collection = createDreamRecordCollection([1, 2], environment);
  const seen = [];
  const stop = watchDreamRecordCollection(collection, (next) => seen.push(next), environment);
  const dispatch = (key) => environment.dispatchEvent(Object.assign(new Event("storage"), { key }));
  stored = JSON.stringify({ version: 1, ids: [2] });
  const before = reads;
  dispatch("unrelated");
  assert.equal(reads, before);
  dispatch(DREAM_RECORD_COLLECTION_KEY);
  dispatch(DREAM_RECORD_COLLECTION_KEY);
  assert.deepEqual(seen, [{ ids: [2], available: true }]);
  assert.equal(writes, 0);
  collection.setSaved(1, true);
  stored = null;
  dispatch(null);
  assert.deepEqual(seen.at(-1), { ids: [], available: true });
  stop();
  const finalReads = reads;
  stored = JSON.stringify({ version: 1, ids: [1] });
  dispatch(DREAM_RECORD_COLLECTION_KEY);
  assert.equal(reads, finalReads);
  assert.equal(seen.length, 2);
});

test("a later read denial retains the latest in-memory ids while applying an explicit save", () => {
  let denied = false;
  const collection = createDreamRecordCollection([1, 2], {
    localStorage: {
      getItem() {
        if (denied) throw new Error("denied");
        return JSON.stringify({ version: 1, ids: [1] });
      },
      setItem() {
        assert.fail("no writes after denied reads");
      },
    },
  });
  denied = true;
  assert.deepEqual(collection.setSaved(2, true), { ids: [1, 2], available: false });
  assert.deepEqual(collection.refresh(), { ids: [1, 2], available: false });
});

test("removing a focused saved card prefers its next neighbor, previous, then collection control", () => {
  assert.equal(dreamRecordCollectionFocus([2, 4, 6], 4), 6);
  assert.equal(dreamRecordCollectionFocus([2, 4, 6], 6), 4);
  assert.equal(dreamRecordCollectionFocus([2], 2), null);
  assert.equal(dreamRecordCollectionFocus([], 2), null);
});
