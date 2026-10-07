import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

test("the Royal card switches only the five supplied form portraits", () => {
  const data = readFileSync(new URL("../src/components/final-stage/final-stage-data.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/components/final-stage/final-stage.tsx", import.meta.url), "utf8");
  const royal = data.slice(data.indexOf("export const REALM_ROYAL"));
  assert.doesNotMatch(royal, /ネハン|NEHAN|rider-realm-royal.*webp/);
  for (const form of ["royal", "wrath", "abyss", "birth", "ultra"]) {
    const image = `realm-${form}-selected-20261007.webp`;
    assert.ok(royal.includes(image));
    assert.ok(existsSync(new URL(`../public/${image}`, import.meta.url)));
  }
  assert.match(page, /activeVisual = REALM_ROYAL.visuals\[RR_FORM_ORDER.indexOf\(form\)\]/);
  assert.match(page, /image=\{activeVisual.image\}/);
  assert.doesNotMatch(page, /REALM_ROYAL.visuals.map/);
});
