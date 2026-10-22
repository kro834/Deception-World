import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Owner confirmation, 2026-10-22: Vinculum is 5000.0m (est.) and ∞Core.
// Do not apply those values to Rexonance, Realm Legends or Cipher Blacksite.
for (const file of [
  "archives/saga-form-archive-standalone.html",
  "public/saga-form-archive-embedded.html",
]) {
  test(`${file}: all three Vinculum catalog cards retain the confirmed specs`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const cards = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
      .map(([card]) => card)
      .filter((card) => /id="(?:saga-detail-vinculum|saga-compare-[ab]-saga-detail-vinculum)"/.test(card));
    assert.equal(cards.length, 3);
    for (const card of cards) {
      assert.match(card, /5000\.0m（est.） \/ 0\.1秒/);
      assert.match(card, /KHAOS 10,000YOPS \/ ∞Core/);
      assert.doesNotMatch(card, /188\.8m|500Core/);
    }
  });
}
