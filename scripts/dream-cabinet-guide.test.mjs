import assert from "node:assert/strict";
import test from "node:test";
import {
  describeDreamCabinetChapter,
  readDreamCabinetBookmark,
  watchDreamCabinetBookmark,
} from "../src/lib/dream-cabinet-guide.js";
import { DREAM_READER_STORAGE_KEY } from "../src/lib/dream-reader-state.js";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";

function fixture() {
  let value = null;
  let reads = 0;
  const observers = [];
  const environment = new EventTarget();
  environment.document = new EventTarget();
  environment.document.hidden = false;
  environment.localStorage = {
    getItem(key) {
      assert.equal(key, DREAM_READER_STORAGE_KEY);
      reads += 1;
      return value;
    },
    setItem() {
      assert.fail("the cabinet must never write a bookmark");
    },
    removeItem() {
      assert.fail("the cabinet must never clear a bookmark");
    },
  };
  environment.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }
    observe(root) {
      this.root = root;
    }
    disconnect() {
      this.disconnected = true;
    }
  };
  return {
    environment,
    observers,
    root: new EventTarget(),
    get reads() {
      return reads;
    },
    setRaw(raw) {
      value = raw;
    },
    bookmark(caseNo, paragraph) {
      value = JSON.stringify({
        version: 1,
        size: "large",
        spacing: "comfortable",
        bookmark: { caseNo, paragraph },
      });
    },
    dispatch(type, properties = {}) {
      environment.dispatchEvent(Object.assign(new Event(type), properties));
    },
  };
}

test("chapter guides describe all canonical chapters without altering the source", () => {
  const before = JSON.stringify([DREAM_CASES, DREAM_CHRONICLE]);
  let totalEvents = 0;
  for (const chapter of DREAM_CASES) {
    const guide = describeDreamCabinetChapter(chapter, DREAM_CHRONICLE);
    assert.equal(guide.paragraphs, chapter.paragraphs.length);
    assert.equal(guide.characters, Array.from(chapter.paragraphs.join("")).length);
    assert.equal(guide.events, DREAM_CHRONICLE.filter((event) => event.case === chapter.no).length);
    totalEvents += guide.events;
  }
  assert.equal(totalEvents, DREAM_CHRONICLE.length);
  assert.equal(JSON.stringify([DREAM_CASES, DREAM_CHRONICLE]), before);
  assert.equal(describeDreamCabinetChapter({ no: "0", paragraphs: ["𠮷と月"] }, []).characters, 3);
});

test("resume accepts valid first/last paragraphs and rejects invalid or obsolete bookmarks", () => {
  const f = fixture();
  for (const chapter of DREAM_CASES) {
    for (const paragraph of [1, chapter.paragraphs.length]) {
      f.bookmark(chapter.no, paragraph);
      assert.deepEqual(readDreamCabinetBookmark(DREAM_CASES, f.environment), {
        bookmark: { caseNo: chapter.no, paragraph },
        available: true,
      });
    }
  }
  for (const raw of [
    null,
    "broken json",
    "{}",
    "null",
    "[]",
    JSON.stringify({ version: 2, bookmark: { caseNo: "0", paragraph: 1 } }),
    JSON.stringify({ version: 1, bookmark: { caseNo: "9", paragraph: 1 } }),
    JSON.stringify({ version: 1, bookmark: { caseNo: "0", paragraph: 0 } }),
    JSON.stringify({ version: 1, bookmark: { caseNo: "0", paragraph: 1000 } }),
    JSON.stringify({ version: 1, bookmark: { caseNo: "0", paragraph: "1" } }),
  ]) {
    f.setRaw(raw);
    assert.deepEqual(readDreamCabinetBookmark(DREAM_CASES, f.environment), {
      bookmark: null,
      available: true,
    });
  }
});

test("denied storage leaves an ordinary chapter entrance and can recover later", () => {
  const f = fixture();
  const original = f.environment.localStorage;
  Object.defineProperty(f.environment, "localStorage", {
    configurable: true,
    get() {
      throw new Error("denied");
    },
  });
  const seen = [];
  const stop = watchDreamCabinetBookmark(
    f.root,
    DREAM_CASES,
    (state) => seen.push(state),
    f.environment,
  );
  assert.deepEqual(seen, [{ bookmark: null, available: false }]);
  Object.defineProperty(f.environment, "localStorage", { configurable: true, value: original });
  f.bookmark("2", 1);
  f.dispatch("focus");
  assert.deepEqual(seen.at(-1), { bookmark: { caseNo: "2", paragraph: 1 }, available: true });
  stop();
});

test("same-tab return, room saves, and cross-tab storage refresh without writes or polling", () => {
  const f = fixture();
  const seen = [];
  const stop = watchDreamCabinetBookmark(
    f.root,
    DREAM_CASES,
    (state) => seen.push(state),
    f.environment,
  );
  assert.equal(seen.length, 1);
  assert.equal(f.observers[0].root, f.root);
  f.bookmark("3", 2);
  f.observers[0].callback([{ isIntersecting: false }]);
  assert.equal(seen.length, 1);
  f.observers[0].callback([{ isIntersecting: true }]);
  assert.deepEqual(seen.at(-1).bookmark, { caseNo: "3", paragraph: 2 });
  f.root.dispatchEvent(new Event("focusin"));
  assert.equal(seen.length, 2, "an unchanged bookmark does not rerender the cabinet");
  f.bookmark("4", 1);
  f.dispatch("dream-reader-state-change");
  assert.equal(seen.at(-1).bookmark.caseNo, "4");
  const readsBeforeUnrelatedStorage = f.reads;
  f.dispatch("storage", { key: "unrelated" });
  assert.equal(f.reads, readsBeforeUnrelatedStorage);
  f.bookmark("5", 1);
  f.dispatch("storage", { key: DREAM_READER_STORAGE_KEY });
  assert.equal(seen.at(-1).bookmark.caseNo, "5");
  f.setRaw(null);
  f.dispatch("storage", { key: null });
  assert.equal(seen.at(-1).bookmark, null);
  stop();
  const count = seen.length;
  f.bookmark("1", 1);
  f.dispatch("focus");
  f.dispatch("pageshow");
  f.dispatch("dream-reader-state-change");
  f.root.dispatchEvent(new Event("focusin"));
  f.observers[0].callback([{ isIntersecting: true }]);
  assert.equal(seen.length, count);
  assert.equal(f.observers[0].disconnected, true);
});

test("hidden documents wait until visible and pageshow recovers a restored visit", () => {
  const f = fixture();
  const seen = [];
  f.environment.document.hidden = true;
  const stop = watchDreamCabinetBookmark(
    null,
    DREAM_CASES,
    (state) => seen.push(state),
    f.environment,
  );
  assert.equal(seen.length, 0);
  f.bookmark("0", 2);
  f.environment.document.hidden = false;
  f.environment.document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(seen.at(-1).bookmark.paragraph, 2);
  f.bookmark("1", 1);
  f.dispatch("pageshow");
  assert.equal(seen.at(-1).bookmark.caseNo, "1");
  stop();
});
