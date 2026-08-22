import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../src/routes/form-archive.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const liquidRail = readFileSync(new URL("../src/lib/liquid/boot.js", import.meta.url), "utf8");

test("form archive uses the shared Liquid Glass rail gesture", () => {
  assert.match(route, /import \{ initRail \} from "@\/lib\/liquid\/boot\.js"/);
  assert.match(route, /initRail\(switcher\)/);
  assert.match(route, /addEventListener\("railselect", handleRailSelect\)/);
  assert.match(route, /useWorldMode\(\)/);

  for (const legacyHandler of [
    /onPointerDown=/,
    /onPointerMove=/,
    /onPointerUp=/,
    /onPointerCancel=/,
    /onLostPointerCapture=/,
    /setPointerCapture/,
    /data-drag-target/,
  ]) {
    assert.doesNotMatch(route, legacyHandler);
  }
});

test("Android keeps the archive gesture on the rail and tolerates capture handoff", () => {
  assert.match(
    styles,
    /html\[data-android-renderer\] \.form-archive-switcher\.liquid-swipe-tabs[\s\S]*?touch-action: none;/,
  );
  assert.match(liquidRail, /try \{ root\.setPointerCapture\(gesture\.pointerId\); \} catch/);
  assert.match(liquidRail, /if \(e\.target === root && gesture\) cancel\(\);/);
  assert.match(liquidRail, /window\.addEventListener\('touchmove', blockPageScroll, \{ passive: false, capture: true \}\)/);
});
