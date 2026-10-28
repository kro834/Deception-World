import assert from "node:assert/strict";
import test from "node:test";
import { guardCielSequinTouch } from "../src/lib/ciel-sequin-touch-guard.ts";

class Canvas extends EventTarget {
  hidden = false;
  ownerDocument = { defaultView: { innerWidth: 390 } };
  registrations = [];
  addEventListener(type, fn, options) {
    this.registrations.push({ type, fn, options });
    super.addEventListener(type, fn, options);
  }
  removeEventListener(type, fn, options) {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    this.registrations = this.registrations.filter(
      (entry) =>
        entry.type !== type || entry.fn !== fn || Boolean(entry.options?.capture) !== capture,
    );
    super.removeEventListener(type, fn, options);
  }
}
const touch = (identifier, clientX) => ({ identifier, clientX });
function send(canvas, type, touches, { cancelable = true } = {}) {
  const event = new Event(type, { cancelable });
  Object.defineProperty(event, "touches", { value: touches });
  canvas.dispatchEvent(event);
  return event;
}

test("both cancelling listeners exist before the first stroke and are non-passive capture listeners", () => {
  const canvas = new Canvas();
  const dispose = guardCielSequinTouch(canvas);
  for (const type of ["touchstart", "touchmove"]) {
    const listener = canvas.registrations.find((entry) => entry.type === type);
    assert.deepEqual(listener.options, { passive: false, capture: true });
  }
  assert.equal(canvas.registrations.length, 4);
  dispose();
  dispose();
  assert.equal(canvas.registrations.length, 0);
});

test("left and right edge starts cancel immediately, while centre strokes retain their defaults", () => {
  for (const x of [0, 2, 32, 358, 389]) {
    const canvas = new Canvas(),
      dispose = guardCielSequinTouch(canvas);
    assert.equal(send(canvas, "touchstart", [touch(7, x)]).defaultPrevented, true, `edge ${x}`);
    assert.equal(send(canvas, "touchmove", [touch(7, 195)]).defaultPrevented, true);
    dispose();
  }
  for (const x of [33, 195, 357]) {
    const canvas = new Canvas(),
      dispose = guardCielSequinTouch(canvas);
    assert.equal(send(canvas, "touchstart", [touch(7, x)]).defaultPrevented, false, `centre ${x}`);
    assert.equal(
      send(canvas, "touchmove", [touch(7, 2)]).defaultPrevented,
      false,
      "moving into an edge does not adopt a foreign stroke",
    );
    dispose();
  }
});

test("the original stroke remains guarded beyond the canvas and releases on end or cancellation", () => {
  for (const end of ["touchend", "touchcancel"]) {
    const canvas = new Canvas(),
      dispose = guardCielSequinTouch(canvas);
    send(canvas, "touchstart", [touch(9, 2)]);
    assert.equal(send(canvas, "touchmove", [touch(9, 450)]).defaultPrevented, true);
    assert.equal(send(canvas, end, []).defaultPrevented, false);
    assert.equal(send(canvas, "touchmove", [touch(9, 2)]).defaultPrevented, false);
    dispose();
  }
});

test("multi-touch and replacement identifiers stop guarding until a fresh single-finger start", () => {
  for (const replacement of [[touch(1, 2), touch(2, 8)], [touch(2, 2)]]) {
    const canvas = new Canvas(),
      dispose = guardCielSequinTouch(canvas);
    send(canvas, "touchstart", [touch(1, 2)]);
    assert.equal(send(canvas, "touchmove", replacement).defaultPrevented, false);
    assert.equal(send(canvas, "touchmove", [touch(1, 2)]).defaultPrevented, false);
    assert.equal(send(canvas, "touchstart", [touch(3, 2)]).defaultPrevented, true);
    dispose();
  }
  const canvas = new Canvas(),
    dispose = guardCielSequinTouch(canvas);
  assert.equal(send(canvas, "touchstart", [touch(1, 2), touch(2, 8)]).defaultPrevented, false);
  assert.equal(send(canvas, "touchmove", [touch(1, 2)]).defaultPrevented, false);
  dispose();
});

test("hidden canvases, non-cancelable events and unrelated elements retain browser defaults", () => {
  const canvas = new Canvas(),
    control = new Canvas(),
    dispose = guardCielSequinTouch(canvas);
  canvas.hidden = true;
  assert.equal(send(canvas, "touchstart", [touch(1, 2)]).defaultPrevented, false);
  canvas.hidden = false;
  assert.equal(
    send(canvas, "touchstart", [touch(1, 2)], { cancelable: false }).defaultPrevented,
    false,
  );
  assert.equal(
    send(canvas, "touchmove", [touch(1, 2)], { cancelable: false }).defaultPrevented,
    false,
  );
  assert.equal(send(control, "touchstart", [touch(1, 2)]).defaultPrevented, false);
  assert.equal(send(control, "touchmove", [touch(1, 100)]).defaultPrevented, false);
  dispose();
  assert.equal(send(canvas, "touchstart", [touch(1, 2)]).defaultPrevented, false);
  assert.equal(send(canvas, "touchmove", [touch(1, 100)]).defaultPrevented, false);
});

test("guarding touch defaults neither intercepts Pointer Events nor stops their propagation", () => {
  const canvas = new Canvas(),
    dispose = guardCielSequinTouch(canvas);
  let down = 0,
    move = 0,
    observed = 0;
  canvas.addEventListener("pointerdown", () => down++);
  canvas.addEventListener("pointermove", () => move++);
  canvas.addEventListener("touchstart", () => observed++);
  send(canvas, "touchstart", [touch(1, 2)]);
  canvas.dispatchEvent(new Event("pointerdown"));
  send(canvas, "touchmove", [touch(1, 120)]);
  canvas.dispatchEvent(new Event("pointermove"));
  assert.deepEqual([down, move, observed], [1, 1, 1]);
  dispose();
});
