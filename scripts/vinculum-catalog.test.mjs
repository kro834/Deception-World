import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Owner, 2026-10-23 (supersedes 2026-10-22's ∞Core): ヴィンクルムはこれに統一 —
// 222.2cm（est.） / 68.5kg（est.）, 98.8t（est.） / 198.8t（est.）,
// 5000.0m（est.） / 0.1s（est.）, 10000YOPS／500Core『KHAOS』 +
// 300TOPS／300Core『KOSMOS』『P2』『Paranormal Realizer Pro』『Neural Resonancer Pro』,
// EMP 無制限. The cards keep the archive's own row format.
// Do not apply those values to Rexonance, Realm Legends or Cipher Blacksite.
for (const file of [
  "archives/saga-form-archive-standalone.html",
  "public/saga-form-archive-embedded.html",
]) {
  test(`${file}: all three Vinculum catalog cards carry the owner's unified specs`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const cards = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
      .map(([card]) => card)
      .filter((card) => /id="(?:saga-detail-vinculum|saga-compare-[ab]-saga-detail-vinculum)"/.test(card));
    assert.equal(cards.length, 3);
    for (const card of cards) {
      assert.match(card, />222\.2cm（est.） \/ 68\.5kg（est.）</);
      assert.match(card, />98\.8t（est.） \/ 198\.8t（est.）</);
      assert.match(card, />5000\.0m（est.） \/ 0\.1秒（est.）</);
      assert.match(card, />KHAOS 10,000YOPS \/ 500Core \+ KOSMOS 300TOPS \/ 300Core（P2）</);
      assert.match(card, /Paranormal Realizer Pro／Neural Resonancer Pro/);
      assert.match(card, />EMP<\/span><span class="spec-value">無制限</);
      assert.doesNotMatch(card, /188\.8m|∞Core|98\.8t〜|198\.8t〜|210\.2cm|≥9\.06×|≥9\.89×/);
    }
    // The ratio table reads the (est.) values as figures, not lower bounds.
    assert.match(html, /aria-label="ヴィンクルムサーガ、パンチ、9\.06×"/);
    assert.match(html, /aria-label="ヴィンクルムサーガ、キック、9\.89×"/);
    // Rexonance's main compute keeps its lower bound mark.
    assert.doesNotMatch(html, /50000YOPS/);
  });
}
