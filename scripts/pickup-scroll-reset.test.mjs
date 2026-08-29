import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const helper = read("../src/components/world/pickup-scroll-reset.ts");
const reconstructedHelper = read("../source-parts/src/components/world/pickup-scroll-reset.ts/01.part");
const forms = read("../src/components/world/manager-stub.tsx");
const riders = read("../src/components/world/rider-page.tsx");
const home = read("../src/components/world/world-home.tsx");

test("pickup scroll reset survives React commit and WebKit dialog focus restoration", () => {
  assert.match(helper, /target\.scrollTop = 0/);
  assert.match(helper, /target\.scrollLeft = 0/);
  assert.match(helper, /target\.style\.scrollBehavior = "auto"/);
  assert.match(helper, /behavior: "auto"/);
  assert.ok((helper.match(/window\.requestAnimationFrame/g) ?? []).length >= 3);
  assert.match(helper, /if \(cancelled \|\| !dialog\.open\) return/);
  assert.match(helper, /\[90, 240, 520, 900\]/);
  assert.match(helper, /new ResizeObserver\(requestLayoutReset\)/);
  assert.match(helper, /dialog\.addEventListener\("load", requestLayoutReset, true\)/);
  assert.match(helper, /dialog\.addEventListener\("touchstart", noteInteraction/);
  assert.match(helper, /userInteracted = true/);
  assert.match(helper, /window\.setTimeout\(stopWatching, 1200\)/);
  assert.match(helper, /window\.cancelAnimationFrame\(firstFrame\)/);
  assert.match(helper, /window\.cancelAnimationFrame\(finalFrame\)/);
  assert.equal(reconstructedHelper, helper);
});

test("every pickup family uses the shared settled reset and clears pending frames", () => {
  assert.match(forms, /settlePickupScroll\(\s*dialog,\s*\["\.form-pickup-panel"\]/);
  assert.match(forms, /onClose=\{resetScroll\}/);
  assert.match(forms, /cancelScrollReset\.current\?\.\(\)/);

  assert.match(riders, /settlePickupScroll\(\s*dlg,\s*\["\.rider-nightmare-dialog-panel"\]/);
  assert.match(riders, /onClose=\{resetNightmareScroll\}/);
  assert.match(riders, /cancelNightmareScrollReset\.current\?\.\(\)/);

  assert.match(home, /settlePickupScroll\(\s*dialog,\s*\["\.episode-pickup-panel"\]/);
  assert.match(home, /settlePickupScroll\(\s*dlg,\s*\["\.world-column-dialog-card"\]/);
  assert.match(home, /cancelEpisodePickupScrollReset\.current\?\.\(\)/);
  assert.match(home, /cancelColumnPickupScrollReset\.current\?\.\(\)/);
});

test("the column pickup suppresses WebKit's transient first-tab focus before settling", () => {
  assert.match(
    home,
    /dlg\.showModal\(\);[\s\S]*?dlg\.focus\(\{ preventScroll: true \}\);[\s\S]*?setPickupOpen\(true\);[\s\S]*?syncRail\(pickupRail\.current, columnTab\)/,
  );
});
