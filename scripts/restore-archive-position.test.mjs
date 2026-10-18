import assert from "node:assert/strict";
import test from "node:test";
import { restoreArchivePosition } from "../src/lib/restore-archive-position.ts";

function fixture({ top = 21483, inset = 76, shift = 0, clamp = Infinity } = {}) {
  const calls = [];
  const environment = {
    scrollY: 21302,
    scrollX: 4,
    scrollTo(options) {
      calls.push(options);
      this.scrollY = Math.min(clamp, options.top);
      if (calls.length === 1) top += shift;
    },
  };
  const section = {
    ownerDocument: { querySelector: () => ({ getBoundingClientRect: () => ({ bottom: inset }) }) },
    getBoundingClientRect: () => ({ top: top - environment.scrollY }),
  };
  return { environment, section, calls };
}

test("rotation return measures released layout and aligns with the actual header", () => {
  const f = fixture();
  restoreArchivePosition(f.section, f.environment);
  assert.deepEqual(f.calls, [{ top: 21407, left: 4, behavior: "instant" }]);
  assert.equal(f.section.getBoundingClientRect().top, 76);
});

test("one synchronous correction handles layout settling without deferred callbacks", () => {
  const f = fixture({ shift: 105 });
  restoreArchivePosition(f.section, f.environment);
  assert.equal(f.calls.length, 2);
  assert.equal(f.section.getBoundingClientRect().top, 76);
});

test("aligned archive does not scroll and a clamped document cannot loop", () => {
  const aligned = fixture({ top: 21378 });
  restoreArchivePosition(aligned.section, aligned.environment);
  assert.equal(aligned.calls.length, 0);
  const clamped = fixture({ clamp: 21302 });
  restoreArchivePosition(clamped.section, clamped.environment);
  assert.equal(clamped.calls.length, 2);
});

test("absent or offscreen headers do not create negative insets", () => {
  for (const missing of [false, true]) {
    const f = fixture({ inset: -40 });
    if (missing) f.section.ownerDocument.querySelector = () => null;
    restoreArchivePosition(f.section, f.environment);
    assert.equal(f.section.getBoundingClientRect().top, 0);
  }
});
