import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(new URL("../src/components/load-gate.tsx", import.meta.url), "utf8");
test("Meta Unitas loads its entry after the menu opens or the user chooses its link", () => {
  const menu = readFileSync(new URL("../src/components/world/world-chrome.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(gate, /scheduleMetaUnitasEntryWarmup/);
  assert.match(menu, /if \(isOpen && pathname !== "\/meta-unitas-saga"\) prefetchMetaUnitasEntry/);
});

test("explicit link intent and the actual META UNITAS entry keep their preparation", () => {
  assert.match(gate, /if \(to === "\/meta-unitas-saga"\) prefetchMetaUnitasEntry\?\.\(\);/);
  assert.match(gate, /if \(diveVariant === "meta-unitas" && tier === "full"\) \{[\s\S]*?void warmMetaUnitasEntry\(\);/);
});
