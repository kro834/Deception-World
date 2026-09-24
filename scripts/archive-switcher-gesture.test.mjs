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

test("archive rails capture contact and release through the shared viewport owner", () => {
  assert.match(
    styles,
    /html\[data-android-renderer\] \.form-archive-switcher\.liquid-swipe-tabs[^}]*touch-action: pan-y pinch-zoom;/,
  );
  assert.doesNotMatch(
    styles,
    /html\[data-android-renderer\] \.form-archive-switcher\.liquid-swipe-tabs[^}]*touch-action: none;/,
  );
  assert.match(liquidRail, /try \{ root\.setPointerCapture\(gesture\.pointerId\); \} catch/);
  assert.match(liquidRail, /if \(e\.target === root && gesture\) cancel\(\);/);
  assert.match(liquidRail, /acquireViewportScrollLock\(\{ rail: true \}\)/);
  assert.match(liquidRail, /releasePageLock\?\.\(\)/);
  const frosted = readFileSync(new URL("../src/styles-frosted-controls.css", import.meta.url), "utf8");
  // Every rail except the rider grid owns the touch from contact. The rider
  // grid is long-press-to-select: its vertical swipes pan the page.
  assert.match(
    frosted,
    /\.liquid-swipe-tabs:not\(\.rider-tabs\) \*\s*\{[^}]*touch-action:\s*none\s*!important/,
  );
  assert.match(
    frosted,
    /\.rider-tabs\.liquid-swipe-tabs \*\s*\{[^}]*touch-action:\s*pan-y pinch-zoom\s*!important/,
  );
  assert.doesNotMatch(frosted, /\.liquid-swipe-tabs \*\s*\{[^}]*touch-action:\s*none/);
});
