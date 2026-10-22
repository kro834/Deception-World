import assert from "node:assert/strict";
import test from "node:test";
import {
  rexonanceReadingAnchor,
  rexonanceReadingOffset,
} from "../src/lib/rexonance-reading-position.ts";

test("orientation restores the suit-up fraction, not portrait pixels", () => {
  const portrait = [
    { id: "assembly", top: 8000, span: 700 },
    { id: "assembly-runway", top: 8700, span: 2200 },
    { id: "stages", top: 11700, span: 2000 },
  ];
  const landscape = [
    { id: "assembly", top: 6000, span: 500 },
    { id: "assembly-runway", top: 6500, span: 1800 },
    { id: "stages", top: 8700, span: 1500 },
  ];
  const anchor = rexonanceReadingAnchor(portrait, 9690);
  assert.deepEqual(anchor, { id: "assembly-runway", fraction: 0.45 });
  assert.equal(rexonanceReadingOffset(landscape, anchor), 7310);
});
test("reading anchors clamp gaps and tolerate a removed chapter", () => {
  const segments = [{ id: "performance", top: 100, span: 200 }];
  assert.equal(rexonanceReadingAnchor(segments, 0), null);
  assert.deepEqual(rexonanceReadingAnchor(segments, 500), { id: "performance", fraction: 1 });
  assert.equal(rexonanceReadingOffset([], { id: "removed", fraction: 0.5 }), null);
});
