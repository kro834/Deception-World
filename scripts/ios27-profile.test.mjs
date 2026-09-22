import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  supportsIOS27Enhancements,
  prefersLightweightRendering,
} from "../src/lib/rendering-profile.js";
import { rexonanceImage } from "../src/lib/rexonance-images.ts";

test("known iOS27 and desktop iPadOS27 opt in without forcing lightweight rendering", () => {
  for (const device of [
    { userAgent: "iPhone; CPU iPhone OS 27_0 like Mac OS X" },
    { userAgent: "iPad; CPU OS 27_1 like Mac OS X" },
    {
      userAgent: "iPhone; CPU iPhone OS 18_7 like Mac OS X Version/27.0 Mobile/15E148 Safari/604.1",
    },
    {
      userAgent: "Macintosh; Intel Mac OS X 10_15_7 Version/27.0 Safari/605.1.15",
      maxTouchPoints: 5,
    },
  ]) {
    assert.equal(supportsIOS27Enhancements(device), true);
    assert.equal(prefersLightweightRendering(device), false);
    assert.equal(prefersLightweightRendering({ ...device, connection: { saveData: true } }), true);
  }
});
test("older iOS, unknown future versions, macOS and Android retain their rendering path", () => {
  for (const userAgent of [
    "iPhone OS 18_7_7",
    "iPhone OS 26_0",
    "iPhone; CPU iPhone OS 18_6 like Mac OS X Version/26.0 Mobile/15E148 Safari/604.1",
    "iPhone OS 28_0",
    "iPhone",
    "Macintosh Version/27.0 Safari/605.1.15",
    "Android 16 Chrome/140",
  ]) {
    assert.equal(supportsIOS27Enhancements({ userAgent }), false);
  }
});
test("auto sizes is opt-in for lazy layout and never part of hero or stage warmup", () => {
  assert.match(rexonanceImage("/rexonance-p14-core.jpg", true).sizes, /^auto, .*40vw$/);
  assert.doesNotMatch(rexonanceImage("/rider-rexonance-saga-pickup-20260922.webp").sizes, /auto/);
  assert.doesNotMatch(rexonanceImage("/rider-rexonance-max-20260922.webp").sizes, /auto/);
  assert.deepEqual(rexonanceImage("/unknown.jpg", true), {});
});
test("enhancement lifecycle checks capabilities, preferences and restores previous attributes", () => {
  const hook = readFileSync(
    new URL("../src/components/world/use-world-mode.ts", import.meta.url),
    "utf8",
  );
  assert.match(hook, /supportsIOS27Enhancements\(navigator\)\s*&&\s*!economyEffects/);
  assert.match(hook, /"animation-range", "entry 0% entry 100%"/);
  assert.match(hook, /!reducedMotion.matches && !reducedTransparency.matches/);
  assert.match(hook, /reducedTransparency.removeEventListener\("change", syncProgressMode\)/);
  assert.match(hook, /if \(previousIOS27\) html.dataset.ios27Enhanced = previousIOS27/);
});

test("fine-pointer iPad switches parallax drivers with actual capability mode", () => {
  const source = readFileSync(
    new URL("../src/components/rexonance-saga/rexonance-saga.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /if \(document.documentElement.dataset.ios27Enhanced === "true"\)\s*\{\s*detach\(\)/,
  );
  assert.match(source, /page.style.removeProperty\("--rxs-hero-progress"\)/);
  assert.match(source, /new MutationObserver\(syncNativeMotion\)/);
  assert.match(source, /observer\?\.disconnect\(\)/);
});
