import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import {
  DANTE_FACTS,
  DANTE_FORMS,
  DANTE_QUOTES,
  DANTE_SECTIONS,
} from "../src/components/world/dante-data.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Dante preserves unknown facts, affiliation, quotes, and two distinct mode catalogs", () => {
  assert.equal(DANTE_FACTS.find((f) => f.dt === "年齢").dd, "不明");
  assert.equal(DANTE_FACTS.find((f) => f.dt === "所属").dd, "なし");
  assert.equal(DANTE_QUOTES.length, 4);
  assert.match(DANTE_SECTIONS[0].body.join(""), /スカーズ』No.1/);
  assert.deepEqual(
    DANTE_FORMS.map((f) => f.stats.map((s) => s.dd)),
    [
      ["214.8cm", "98.8kg", "198.8t", "288.8t", "688.8m", "0.008秒／100m"],
      ["218.8cm", "128.8kg", "288.8t", "388.8t", "388.8m", "0.016秒／100m"],
    ],
  );
  assert.deepEqual(
    DANTE_FORMS.map((f) => f.calls),
    [
      ["POLARIS！", "DESIRE：ONE！", "FIX THE AXIS！", "DOMINATE！"],
      ["ENIGMA！", "DESIRE：MANY！", "NO ANSWER！", "DOMINATE！"],
    ],
  );
  assert.ok(DANTE_FORMS.every((f) => f.finishers.length === 2));
  assert.ok(DANTE_FORMS.every((f) => f.nameParts.join("") === f.name));
  assert.match(
    read("src/components/world/manager-stub.tsx"),
    /const formName = rider.nameParts[\s\S]*?: rider.name;/,
  );
  assert.equal(DANTE_FORMS[1].arsenal[0].name, "リドルエッジ");
});

test("Dante assets are local lightweight WebP images and route is reachable from the archive", () => {
  for (const asset of [
    "/character-dante.webp",
    "/character-dante-thumb.webp",
    ...DANTE_FORMS.map((f) => f.img),
  ]) {
    const file = new URL(`../public${asset}`, import.meta.url);
    assert.equal(readFileSync(file).subarray(8, 12).toString(), "WEBP");
    assert.ok(statSync(file).size < 200_000);
  }
  const home = read("src/components/world/world-home.tsx");
  assert.match(home, /to="\/characters\/dante"/);
  assert.doesNotMatch(home, /dante-denied-dialog|danteOpenTimer/);
  assert.match(home, /locationHash !== "manager-archive-unmanaged"[\s\S]*?setManagerTab\(1\)/);
  assert.match(home, /id="manager-archive-unmanaged"/);
  assert.match(
    read("src/components/world/dante-page.tsx"),
    /returnHash="manager-archive-unmanaged"/,
  );
  assert.match(read("src/routes/characters/dante.tsx"), /createWorldHead/);
});

test("Dante entry glitch never captures input and respects reduced motion", () => {
  const css = read("src/styles-dante.css");
  assert.match(css, /pointer-events: none/);
  assert.match(css, /540ms steps/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none/);
  assert.match(
    read("src/components/world/dante-page.tsx"),
    /className="dante-entry-glitch" aria-hidden="true"/,
  );
});

test("Dante form details wrap on small screens and preserve the full supplied artwork", () => {
  const css = read("src/styles-dante.css");
  assert.match(css, /form-pickup-layout > \*\s*\{\s*min-width: 0/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /form-pickup-layout img\s*\{\s*aspect-ratio: auto/);
  assert.match(css, /form-pickup-layout figcaption[\s\S]*?flex-wrap: wrap/);
});
