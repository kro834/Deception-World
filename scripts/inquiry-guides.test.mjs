import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getInquiryGuide,
  getInquiryStop,
  INQUIRY_GUIDES,
  inquiryHref,
  validateInquirySearch,
} from "../src/lib/inquiry-guides.ts";

const sources = new Map([
  ["/world", "src/components/world/world-home.tsx"],
  ["/managers/zeus", "src/components/world/manager-stub.tsx"],
  ["/managers/rex-loi", "src/components/world/manager-stub.tsx"],
  ["/riders/saga", "src/components/world/rider-page.tsx"],
  ["/extreme-saga", "src/components/extreme-saga/extreme-saga.tsx"],
  ["/form-archive", "public/saga-form-archive-embedded.html"],
]);

function readSource(relativePath) {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

test("only known scalar guide IDs activate inquiry context", () => {
  for (const id of ["keepers", "forms"]) {
    assert.equal(getInquiryGuide(id)?.id, id);
    assert.deepEqual(validateInquirySearch({ guide: id }), { guide: id });
  }
  for (const value of [undefined, null, "", "unknown", ["keepers"], {}, 1, true, "__proto__"]) {
    assert.equal(getInquiryGuide(value), undefined);
    assert.deepEqual(validateInquirySearch({ guide: value }), {});
  }
});

test("routes identify stops by pathname independent of fragment or query", () => {
  for (const guide of INQUIRY_GUIDES) {
    assert.equal(guide.stops.length, 3);
    assert.equal(new Set(guide.stops.map((stop) => stop.to)).size, guide.stops.length);
    for (const stop of guide.stops) {
      assert.equal(getInquiryStop(guide, stop.to), stop);
      assert.equal(getInquiryStop(guide, `${stop.to}?guide=${guide.id}`), undefined);
      assert.equal(getInquiryStop(guide, `${stop.to}#${stop.hash ?? "other"}`), undefined);
      assert.equal(
        inquiryHref(guide.id, stop),
        `${stop.to}?guide=${guide.id}${stop.hash ? `#${stop.hash}` : ""}`,
      );
    }
    assert.equal(getInquiryStop(guide, "/not-in-guide"), undefined);
  }
  assert.equal(getInquiryStop(undefined, "/world"), undefined);
  assert.equal(getInquiryStop(INQUIRY_GUIDES[0], null), undefined);
  assert.throws(() => inquiryHref("keepers", INQUIRY_GUIDES[1].stops[0]));
});

test("every excerpt is present in its destination source and anchors exist", () => {
  for (const guide of INQUIRY_GUIDES) {
    for (const stop of guide.stops) {
      const file = sources.get(stop.to);
      assert.ok(file, `${stop.to} needs a source mapping`);
      const source = readSource(file);
      assert.ok(
        source.includes(stop.excerpt),
        `${guide.id}/${stop.id}: excerpt differs from ${file}`,
      );
      if (stop.hash) {
        assert.match(source, new RegExp(`id=["']${stop.hash}["']`), `${stop.to}#${stop.hash}`);
      }
      assert.ok(stop.lookFor && stop.sourceLabel);
    }
  }
});
