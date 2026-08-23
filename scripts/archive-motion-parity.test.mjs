import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRealmArchiveMotion } from "./build-realm-archive-motion.mjs";

const sagaArchive = readFileSync(
  new URL("../public/saga-form-archive-standalone.html", import.meta.url),
  "utf8",
);
const realmStandalone = readFileSync(
  new URL("../public/realm-form-archive-standalone.html", import.meta.url),
  "utf8",
);
const realmEmbedded = readFileSync(
  new URL("../public/realm-form-archive-embedded.html", import.meta.url),
  "utf8",
);
const realmMotion = readFileSync(
  new URL("../public/realm-archive-motion.js", import.meta.url),
  "utf8",
);

test("Realm motion controller is regenerated exactly from Saga's current controllers", () => {
  assert.equal(realmMotion, createRealmArchiveMotion(sagaArchive));
});

test("Realm archive loads its normalized motion controller in both deliverables", () => {
  for (const html of [realmStandalone, realmEmbedded]) {
    assert.match(html, /<script src="\/realm-archive-motion\.js\?v=20260823-r41" defer><\/script>/);
  }
});

test("Realm master controller targets IDs that exist in the Realm archive", () => {
  const requiredIds = [
    "realm--saga-forms-performance-v5",
    "realm--form-selector",
    "realm--saga-progression-v5",
    "realm--saga-detail-title-v5",
    "realm--saga-detail-v5",
    "realm--saga-ratio-body-v5",
    "realm--saga-ability-body-v5",
    "realm--saga-form-compare-ios",
  ];
  for (const id of requiredIds) {
    assert.match(realmStandalone, new RegExp(`id="${id}"`));
    assert.match(realmMotion, new RegExp(id));
  }
  assert.match(realmMotion, /const DEFAULT_FORM_ID = 'stella'/);
  assert.match(realmMotion, /09 \/ 09 FORMS/);
  assert.doesNotMatch(realmMotion, /querySelector\('#form-selector'\)/);
  assert.doesNotMatch(realmMotion, /document\.getElementById\('saga-/);
});

test("Realm receives Saga's form-selection and detail-transition effects", () => {
  for (const marker of [
    "function playTransitionFx(direction)",
    "function animateTelemetry(direction)",
    "function transitionArticles(previousIndex, nextIndex, direction, token)",
    "function animateSelectionUi(item, direction, token)",
    "v6s-reveal-capable",
    "is-art-pointer-active",
    "motion-capable",
    "v6s-ready",
    "window.RealmMotionController",
  ]) {
    assert.match(realmMotion, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(realmMotion, /const exitDuration = compactMotion \? 170 : 220/);
  assert.match(realmMotion, /const entryDuration = compactMotion \? 390 : 510/);
  assert.match(realmMotion, /direction \* \(compactMotion \? 20 : 28\)/);
  assert.match(realmMotion, /duration: 340, delay: index \* 18/);
  assert.match(realmMotion, /duration: 620, easing: 'cubic-bezier\(\.16,\.82,\.22,1\)'/);
});

test("both archives derive the current-location marker from final document geometry", () => {
  for (const controller of [sagaArchive, realmMotion]) {
    assert.match(controller, /function updateArchiveLocation\(\)/);
    assert.match(controller, /function resolveArchiveLocationEntry\(/);
    assert.match(controller, /target\.getBoundingClientRect\(\)\.top \+ scrollTop/);
    assert.match(controller, /window\.innerHeight \* 0\.18/);
    assert.match(controller, /Math\.abs\(formEntry\.top - detailEntry\.top\) <= 96/);
    assert.match(controller, /currentIndex === 0 \|\| currentIndex === 1 \? currentIndex : 0/);
    assert.match(controller, /reachedEntries\[reachedEntries\.length - 1\] \|\| formEntry \|\| byDocumentTop\[0\]/);
    assert.match(controller, /locationIntentIndex/);
    assert.match(controller, /scrollend/);
    assert.match(controller, /const atDocumentEnd = maxScroll > 0 && scrollTop >= maxScroll - 2/);
    assert.match(controller, /return byDocumentTop\[byDocumentTop\.length - 1\]/);
    assert.match(controller, /data-current-location/);
    assert.doesNotMatch(controller, /const sectionObserver = new IntersectionObserver/);
  }
});

function extractArchiveLocationResolver(controller) {
  const match = controller.match(/function resolveArchiveLocationEntry\([\s\S]*?\n {2}\}/);
  assert.ok(match, "current-location resolver should be present");
  return Function(`"use strict"; return (${match[0]});`)();
}

test("iPad two-column Form and Detail navigation preserves either explicit selection", () => {
  for (const controller of [sagaArchive, realmMotion]) {
    const resolveLocation = extractArchiveLocationResolver(controller);
    const measured = [
      { index: 0, top: 1080 },
      { index: 1, top: 1069 },
      { index: 4, top: 4124 },
      { index: 2, top: 4422 },
      { index: 3, top: 6008 },
    ];

    assert.equal(resolveLocation(measured, 1309, false, 0).index, 0, "Form must not flip to Detail");
    assert.equal(resolveLocation(measured, 1309, false, 1).index, 1, "Detail must not flip to Form");
    assert.equal(resolveLocation(measured, 1309, false, 2).index, 0, "returning from later content starts at Form");
    assert.equal(resolveLocation(measured, 240, false, -1).index, 0, "initial state starts at Form despite crossed heading coordinates");
    assert.equal(resolveLocation(measured, 5541, true, 2).index, 3, "document end resolves to the final physical section");
  }
});

test("Realm static detail fallback yields to the Saga motion controller", () => {
  assert.match(
    realmStandalone,
    /#realm--saga-forms-performance-v5#realm--saga-forms-performance-v5:not\(\.motion-capable\) \.form-detail/,
  );
  assert.match(
    realmStandalone,
    /#realm--saga-forms-performance-v5#realm--saga-forms-performance-v5:not\(\.motion-capable\) #realm--saga-pick-stella:checked/,
  );
});
