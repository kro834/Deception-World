import assert from "node:assert/strict";
import test from "node:test";
import { parseDogArchiveSearch, DOG_ARCHIVE_ENTRIES } from "../src/lib/dogs-archive/entries.ts";
import { guardDogsArchiveNavigation } from "../src/lib/dogs-archive/touch-guard.ts";

class Surface extends EventTarget {
  registrations = [];
  innerWidth = 390;
  addEventListener(type, fn, options) {
    this.registrations.push({ type, fn, options });
    super.addEventListener(type, fn, typeof options === "boolean" ? { capture: options } : options);
  }
  removeEventListener(type, fn, options) {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    this.registrations = this.registrations.filter(
      (entry) =>
        entry.type !== type ||
        entry.fn !== fn ||
        (typeof entry.options === "boolean" ? entry.options : Boolean(entry.options?.capture)) !==
          capture,
    );
    super.removeEventListener(type, fn, { capture });
  }
}
function fixture(width = 390) {
  const doc = new Surface();
  doc.defaultView = new Surface();
  doc.defaultView.innerWidth = width;
  doc.documentElement = { clientWidth: width };
  return { doc, release: guardDogsArchiveNavigation(doc) };
}
const touch = (identifier, clientX) => ({ identifier, clientX });
function send(target, type, values = {}, cancelable = true) {
  const event = new Event(type, { cancelable });
  for (const [key, value] of Object.entries(values)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}
const stroke = (doc, type, touches, cancelable) => send(doc, type, { touches }, cancelable);

test("all five individuals have stable deep links; absent or malformed searches open the fifth", () => {
  assert.deepEqual(
    DOG_ARCHIVE_ENTRIES.map(({ id }) => id),
    [1, 2, 3, 4, 5],
  );
  for (let dog = 1; dog <= 5; dog++) {
    assert.deepEqual(parseDogArchiveSearch({ dog }), { dog });
    assert.deepEqual(parseDogArchiveSearch({ dog: String(dog) }), { dog });
  }
  for (const dog of [
    undefined,
    null,
    0,
    6,
    -1,
    1.5,
    Infinity,
    NaN,
    "",
    "05",
    "1.5",
    "1x",
    [2],
    {},
    true,
  ]) {
    assert.deepEqual(parseDogArchiveSearch({ dog, unrelated: 1 }), { dog: 5 });
  }
  assert.deepEqual(parseDogArchiveSearch({}), { dog: 5 });
});

test("edge cancellation is installed before input with non-passive capture listeners", () => {
  const { doc, release } = fixture();
  for (const type of ["touchstart", "touchmove", "wheel"]) {
    assert.deepEqual(doc.registrations.find((entry) => entry.type === type).options, {
      passive: false,
      capture: true,
    });
  }
  assert.equal(
    doc.registrations.some(({ type }) => type === "popstate"),
    false,
  );
  assert.equal(
    doc.defaultView.registrations.some(({ type }) => type === "popstate"),
    false,
  );
  release();
  release();
  assert.equal(doc.registrations.length, 0);
  assert.equal(doc.defaultView.registrations.length, 0);
});

test("both edge starts cancel on the first sample; centre touches and pinch remain available", () => {
  for (const width of [320, 390, 834, 1194]) {
    const { doc, release } = fixture(width);
    for (const x of [0, 32, width - 32, width - 1]) {
      assert.equal(stroke(doc, "touchstart", [touch(7, x)]), true, `${width}:${x}`);
      assert.equal(stroke(doc, "touchmove", [touch(7, width / 2)]), true);
    }
    for (const x of [33, width / 2, width - 33]) {
      assert.equal(stroke(doc, "touchstart", [touch(7, x)]), false);
      assert.equal(stroke(doc, "touchmove", [touch(7, 1)]), false);
    }
    assert.equal(stroke(doc, "touchstart", [touch(1, 1), touch(2, 80)]), false);
    assert.equal(stroke(doc, "touchmove", [touch(1, 1)]), false);
    release();
  }
});

test("foreign identifiers, interruption and pagehide release the original gesture", () => {
  const { doc, release } = fixture();
  for (const type of ["touchend", "touchcancel"]) {
    stroke(doc, "touchstart", [touch(1, 2)]);
    stroke(doc, type, []);
    assert.equal(stroke(doc, "touchmove", [touch(1, 2)]), false);
  }
  for (const touches of [[touch(2, 2)], [touch(1, 2), touch(2, 90)]]) {
    stroke(doc, "touchstart", [touch(1, 2)]);
    assert.equal(stroke(doc, "touchmove", touches), false);
    assert.equal(stroke(doc, "touchmove", [touch(1, 2)]), false);
  }
  stroke(doc, "touchstart", [touch(1, 2)]);
  send(doc.defaultView, "pagehide");
  assert.equal(stroke(doc, "touchmove", [touch(1, 2)]), false);
  assert.equal(stroke(doc, "touchstart", [touch(1, NaN)]), false);
  release();
  assert.equal(stroke(doc, "touchstart", [touch(1, 2)]), false);
});

test("horizontal trackpad gestures are guarded without taking vertical scroll or control-pinch", () => {
  const { doc, release } = fixture();
  assert.equal(send(doc, "wheel", { deltaX: 20, deltaY: 1, ctrlKey: false }), true);
  assert.equal(send(doc, "wheel", { deltaX: -20, deltaY: 0, ctrlKey: false }), true);
  assert.equal(send(doc, "wheel", { deltaX: 2, deltaY: 20, ctrlKey: false }), false);
  assert.equal(send(doc, "wheel", { deltaX: 20, deltaY: 0, ctrlKey: true }), false);
  assert.equal(send(doc, "wheel", { deltaX: 20, deltaY: 0, ctrlKey: false }, false), false);
  release();
  assert.equal(send(doc, "wheel", { deltaX: 20, deltaY: 0, ctrlKey: false }), false);
});

test("cancelling touch defaults preserves pointer input, propagation and non-cancelable events", () => {
  const { doc, release } = fixture();
  let pointer = 0,
    observed = 0;
  doc.addEventListener("pointermove", () => pointer++);
  doc.addEventListener("touchstart", () => observed++);
  assert.equal(stroke(doc, "touchstart", [touch(1, 2)], false), false);
  assert.equal(stroke(doc, "touchmove", [touch(1, 2)], false), false);
  doc.dispatchEvent(new Event("pointermove"));
  assert.deepEqual([pointer, observed], [1, 1]);
  release();
});
