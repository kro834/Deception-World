import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const route = readFileSync(new URL("../src/routes/form-archive.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const liquidRail = readFileSync(new URL("../src/lib/liquid/boot.js", import.meta.url), "utf8");

function settleSwitcherFocus({ loading = false, movedFocus = false, stale = false } = {}) {
  const effect = route.match(
    /useEffect\(\(\) => \{\n {4}if \(!loaded\) return;[\s\S]*?\n {2}\}, \[loaded\]\);/,
  )?.[0];
  assert.ok(effect, "archive readiness must restore the rail's lost focus");
  const body = {};
  const selectedTab = {};
  const menuControl = {};
  const focused = [];
  const pending = { current: { archive: "realm", generation: stale ? 0 : 1 } };
  runInNewContext(effect.replace(".querySelector<HTMLButtonElement>", ".querySelector"), {
    loaded: !loading,
    restoreSwitcherFocusRef: pending,
    activeTransitionRef: { current: { archive: "realm", generation: 1 } },
    document: { body, activeElement: movedFocus ? menuControl : body },
    switcherRef: {
      current: {
        contains: (element) => element === selectedTab,
        querySelector: (selector) => {
          assert.equal(selector, 'button[data-archive="realm"]');
          return { focus: (options) => focused.push(options.preventScroll) };
        },
      },
    },
    useEffect: (callback) => callback(),
  });
  return { pending, focused };
}

test("a loaded archive restores the selected tab after inert drops keyboard focus", () => {
  const settled = settleSwitcherFocus();
  assert.deepEqual(settled.focused, [true]);
  assert.equal(settled.pending.current, null);
});

test("archive focus restoration waits for readiness and never steals another control's focus", () => {
  const loading = settleSwitcherFocus({ loading: true });
  assert.deepEqual(loading.focused, []);
  assert.ok(loading.pending.current, "keep restoration pending until this archive is ready");
  const moved = settleSwitcherFocus({ movedFocus: true });
  assert.deepEqual(moved.focused, []);
  assert.equal(moved.pending.current, null);
  assert.deepEqual(settleSwitcherFocus({ stale: true }).focused, []);
});

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
