import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const control = readFileSync(new URL("../src/components/world/slide-open-control.tsx", import.meta.url), "utf8");
const pickup = readFileSync(new URL("../src/components/world/manager-stub.tsx", import.meta.url), "utf8");

test("slide controls report whether pointer or keyboard opened the destination", () => {
  assert.match(control, /onOpen: \(source: "keyboard" \| "pointer"\) => void/);
  assert.match(control, /onOpen\(source\)/);
});

test("pointer-opened Rider pickups suppress WebKit's restored focus halo", () => {
  assert.match(pickup, /const pointerOpened = useRef\(false\)/);
  assert.match(pickup, /button\.dataset\.keyboardFocus = "false"/);
  assert.match(pickup, /button\.blur\(\)/);
  assert.match(pickup, /window\.requestAnimationFrame\(clearPointerFocus\)/);
  assert.match(pickup, /buttonRef=\{opener\}/);
});
