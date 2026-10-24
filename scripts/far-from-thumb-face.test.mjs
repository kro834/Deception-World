import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Owner (2026-10-24): 「スマホ画面でファーフロムのサムネイルの位置を調整し、顔が9割映る
// ようにして。」 The helmet is the top ~22% of the art (x 44-66%). The phone's
// SPECIAL tile spans both menu columns (wide and short), so its plate must sit at
// the top; at the old 22% the head was ~42% visible.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const shell = read("src/styles-stage-shell.css");

test("phone menu tile keeps Far From's head in frame (object-position y = 0%)", () => {
  const phone = shell.match(/@media \(max-width: 760px\) \{[^@]*?a\[href\^="\/far-from-saga"\] \{[^}]*\}/s);
  assert.ok(phone, "the phone Far From tile rule exists");
  assert.match(phone[0], /--sh-art-pos: 50% 0%;/);
  // Visible head fraction for the measured phone tiles (400x549 plate, cover).
  const HEAD = { y0: 0.005, y1: 0.225 };
  for (const [w, h] of [[326, 194], [356, 194], [394, 194]]) {
    const rh = (w * 549) / 400;
    const off = (rh - h) * 0;
    const top = Math.max(0, HEAD.y0 * rh - off);
    const bottom = Math.min(h, HEAD.y1 * rh - off);
    assert.ok((bottom - top) / ((HEAD.y1 - HEAD.y0) * rh) >= 0.9, `${w}x${h}`);
  }
});

test("other phone Far From thumbnails stay top-anchored (head near the top of the art)", () => {
  const ffs = read("src/styles-far-from-saga.css");
  assert.match(ffs, /ffs-page \.rxs-hero-visual img \{[^}]*object-position: 50% 0;/s);
  assert.match(ffs, /ffs-comparison-card img \{[^}]*object-position: 50% 0;/s);
  const art = read("src/lib/record-art.ts");
  assert.match(art, /middle-640\.webp",\s*pos: "50% 14%"/);
});
