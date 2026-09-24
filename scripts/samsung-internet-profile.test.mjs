import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEVICE_PROFILE_SCRIPT } from "../src/lib/device-profile-gate.js";
import { MIRAGE_BOOT_GATE_SCRIPT } from "../src/lib/mirage-boot-gate.js";
import {
  isAndroidRenderer,
  isOneUiRenderer,
  prefersIOS18Rendering,
  prefersLightweightRendering,
  prefersNativeScrollProgress,
  samsungInternet,
} from "../src/lib/rendering-profile.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Samsung Internet sends the reduced UA ("Android 10; K") since SI 24.
const si = (major, engine, platform = "Linux; Android 10; K", mobile = " Mobile") =>
  `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/${major}.0 Chrome/${engine}.0.0.0${mobile} Safari/537.36`;
const SI28 = si(28, 130);
const SI29 = si(29, 136);
const SI30 = si(30, 143);
// Desktop-site mode, DeX and tablets.
const SI_DESKTOP = si(28, 130, "X11; Linux x86_64", "");
const SI_WINDOWS = si(28, 130, "Windows NT 10.0; Win64; x64", "");
const LINUX_CHROME =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
const WEBVIEW =
  "Mozilla/5.0 (Linux; Android 14; SM-A536B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36";
// A Galaxy model token without Samsung Internet: Chrome with a full UA.
const CHROME_GALAXY_FULL_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE = (version) =>
  `Mozilla/5.0 (iPhone; CPU iPhone OS ${version}_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version}.0 Mobile/15E148 Safari/604.1`;
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

test("Samsung Internet is read from its own token, with the engine it ships", () => {
  assert.deepEqual(samsungInternet({ userAgent: SI28, maxTouchPoints: 5 }), {
    major: 28,
    engine: 130,
    windows: false,
    desktopMode: false,
  });
  assert.equal(samsungInternet({ userAgent: SI29 })?.engine, 136);
  assert.equal(samsungInternet({ userAgent: SI30 })?.engine, 143);
  assert.equal(samsungInternet({ userAgent: SI_DESKTOP, maxTouchPoints: 10 })?.desktopMode, true);
  assert.equal(samsungInternet({ userAgent: SI_DESKTOP, maxTouchPoints: 0 })?.desktopMode, false);
  assert.equal(samsungInternet({ userAgent: SI_WINDOWS })?.windows, true);
  for (const userAgent of [CHROME_ANDROID, WEBVIEW, CHROME_GALAXY_FULL_UA, LINUX_CHROME, IPHONE(26)])
    assert.equal(samsungInternet({ userAgent }), null, userAgent);
});

test("the UA table: Android renderer and One UI", () => {
  const table = [
    // [name, device, android, oneUi]
    ["SI 28 phone", { userAgent: SI28, maxTouchPoints: 5 }, true, true],
    ["SI 29 phone", { userAgent: SI29, maxTouchPoints: 5 }, true, true],
    ["SI 30 phone", { userAgent: SI30, maxTouchPoints: 5 }, true, true],
    ["SI desktop-site mode, DeX, tablet (touch)", { userAgent: SI_DESKTOP, maxTouchPoints: 10 }, true, true],
    ["SI on X11 without touch", { userAgent: SI_DESKTOP, maxTouchPoints: 0 }, false, true],
    ["desktop Linux Chrome", { userAgent: LINUX_CHROME, maxTouchPoints: 0 }, false, false],
    ["touch-screen Linux Chrome", { userAgent: LINUX_CHROME, maxTouchPoints: 10 }, false, false],
    ["Samsung Internet for Windows", { userAgent: SI_WINDOWS, maxTouchPoints: 10 }, false, false],
    ["Chrome Android", { userAgent: CHROME_ANDROID, maxTouchPoints: 5 }, true, false],
    ["Android WebView", { userAgent: WEBVIEW, maxTouchPoints: 5 }, true, false],
    // The retired SM- pattern: a model token alone is not Samsung Internet.
    ["Chrome with a Galaxy model token", { userAgent: CHROME_GALAXY_FULL_UA, maxTouchPoints: 5 }, true, false],
    ["iPhone", { userAgent: IPHONE(26), maxTouchPoints: 5 }, false, false],
  ];
  for (const [name, device, android, oneUi] of table) {
    assert.equal(isAndroidRenderer(device), android, `${name}: android`);
    assert.equal(isOneUiRenderer(device), oneUi, `${name}: One UI`);
  }
  // Desktop-site mode gets the Android weak-hardware rule too.
  assert.equal(
    prefersLightweightRendering({ userAgent: SI_DESKTOP, maxTouchPoints: 10, hardwareConcurrency: 4 }),
    true,
  );
  assert.equal(
    prefersLightweightRendering({ userAgent: SI_DESKTOP, maxTouchPoints: 0, hardwareConcurrency: 4 }),
    false,
  );
});

test("native progress: Android renderers and iOS 27, with timelines and motion allowed", () => {
  const on = { scrollTimeline: true, viewTimeline: true, reducedMotion: false };
  const device = { userAgent: SI_DESKTOP, maxTouchPoints: 10, hardwareConcurrency: 8 };
  assert.equal(prefersNativeScrollProgress(device, on), true);
  assert.equal(prefersNativeScrollProgress(device, { ...on, reducedMotion: true }), false);
  assert.equal(prefersNativeScrollProgress(device, { ...on, scrollTimeline: false }), false);
  assert.equal(prefersNativeScrollProgress({ userAgent: IPHONE(27), maxTouchPoints: 5 }, on), true);
  assert.equal(
    prefersNativeScrollProgress({ userAgent: IPHONE(27), maxTouchPoints: 5 }, { ...on, viewTimeline: false }),
    false,
  );
  // iOS 26 and desktop keep the script path (verify-android-progress pins iOS 26).
  assert.equal(prefersNativeScrollProgress({ userAgent: IPHONE(26), maxTouchPoints: 5 }, on), false);
  assert.equal(prefersNativeScrollProgress({ userAgent: MAC, hardwareConcurrency: 8 }, on), false);
});

const runScript = (script, device, { supports = true, views = true, reduced = false, storage = {}, hash = "" } = {}) => {
  const attributes = new Map();
  const documentStub = {
    documentElement: {
      setAttribute: (key, value) => attributes.set(key, value),
      getAttribute: (key) => attributes.get(key) ?? null,
    },
  };
  const windowStub = {
    CSS: {
      supports: (property, value) =>
        property === "animation-timeline"
          ? value === "scroll(root block)"
            ? supports
            : views
          : property === "animation-range"
            ? views
            : false,
    },
    matchMedia: (query) => ({ matches: reduced && query === "(prefers-reduced-motion: reduce)" }),
    sessionStorage: { getItem: (key) => storage[key] ?? null },
    location: { hash },
  };
  new Function("document", "navigator", "window", script)(documentStub, device, windowStub);
  return attributes;
};

const DEVICES = [
  { userAgent: SI28, maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 8 },
  { userAgent: SI29, maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 8 },
  { userAgent: SI30, maxTouchPoints: 5, hardwareConcurrency: 8, deviceMemory: 8 },
  { userAgent: SI30, maxTouchPoints: 5, hardwareConcurrency: 4, deviceMemory: 4 },
  { userAgent: SI_DESKTOP, maxTouchPoints: 10, hardwareConcurrency: 8 },
  { userAgent: SI_DESKTOP, maxTouchPoints: 10, hardwareConcurrency: 4 },
  { userAgent: SI_DESKTOP, maxTouchPoints: 0, hardwareConcurrency: 4 },
  { userAgent: SI_WINDOWS, maxTouchPoints: 0, hardwareConcurrency: 8 },
  { userAgent: LINUX_CHROME, maxTouchPoints: 10, hardwareConcurrency: 4 },
  { userAgent: CHROME_ANDROID, maxTouchPoints: 5, hardwareConcurrency: 8 },
  { userAgent: CHROME_ANDROID, maxTouchPoints: 5, deviceMemory: 2 },
  { userAgent: WEBVIEW, maxTouchPoints: 5, hardwareConcurrency: 8 },
  { userAgent: CHROME_GALAXY_FULL_UA, maxTouchPoints: 5, hardwareConcurrency: 8 },
  { userAgent: IPHONE(18), maxTouchPoints: 5 },
  { userAgent: IPHONE(26), maxTouchPoints: 5 },
  { userAgent: IPHONE(27), maxTouchPoints: 5 },
  { userAgent: IPHONE(27), maxTouchPoints: 5, connection: { saveData: true } },
  { userAgent: MAC, maxTouchPoints: 0, hardwareConcurrency: 10 },
  { userAgent: MAC, maxTouchPoints: 5 },
  { userAgent: MAC, hardwareConcurrency: 8, connection: { effectiveType: "2g" } },
];

test("the pre-paint device profile matches its rendering-profile twins", () => {
  for (const device of DEVICES) {
    for (const env of [
      { supports: true, views: true, reduced: false },
      { supports: true, views: true, reduced: true },
      { supports: false, views: false, reduced: false },
      { supports: true, views: false, reduced: false },
    ]) {
      const attributes = runScript(DEVICE_PROFILE_SCRIPT, device, env);
      const label = `${device.userAgent} ${JSON.stringify({ ...device, userAgent: undefined, ...env })}`;
      assert.equal(attributes.get("data-android-renderer") === "true", isAndroidRenderer(device), label);
      assert.equal(attributes.get("data-one-ui-renderer") === "true", isOneUiRenderer(device), label);
      assert.equal(attributes.get("data-ios18-renderer") === "true", prefersIOS18Rendering(device), label);
      assert.equal(
        attributes.get("data-world-effects") === "economy",
        prefersLightweightRendering(device),
        label,
      );
      assert.equal(
        attributes.get("data-native-scroll-progress") === "true",
        prefersNativeScrollProgress(device, {
          scrollTimeline: env.supports,
          viewTimeline: env.views,
          reducedMotion: env.reduced,
        }),
        label,
      );
      for (const key of attributes.keys()) assert.match(key, /^data-/);
    }
  }
});

test("the /world boot gate shares the device rules and enters world mode before paint", () => {
  for (const device of DEVICES) {
    const attributes = runScript(MIRAGE_BOOT_GATE_SCRIPT, device);
    assert.equal(attributes.has("data-mirage-quiet"), prefersLightweightRendering(device), device.userAgent);
    assert.equal(attributes.get("data-mode"), "world");
    assert.equal(attributes.get("data-mode-origin"), "prepaint");
  }
});

test("both pre-paint scripts stay ES5 and fail open", () => {
  for (const script of [DEVICE_PROFILE_SCRIPT, MIRAGE_BOOT_GATE_SCRIPT]) {
    assert.doesNotMatch(script, /=>|\?\.|\?\?|\blet\b|\bconst\b|`/);
    assert.match(script, /try \{[\s\S]*\} catch \(error\)/);
    new Function(script);
  }
  // A throwing navigator leaves the document untouched instead of breaking the page.
  const attributes = runScript(DEVICE_PROFILE_SCRIPT, {
    get userAgent() {
      throw new Error("blocked");
    },
  });
  assert.equal(attributes.size, 0);
});

test("the root installs the profile; the World hook no longer writes device attributes", () => {
  const root = read("src/routes/__root.tsx");
  assert.match(root, /import \{ DEVICE_PROFILE_SCRIPT \} from "@\/lib\/device-profile-gate";/);
  assert.match(root, /scripts: \[\{ children: DEVICE_PROFILE_SCRIPT \}\]/);
  const mode = read("src/components/world/use-world-mode.ts");
  assert.doesNotMatch(
    mode,
    /dataset\.(androidRenderer|oneUiRenderer|worldEffects|ios18Renderer)\s*=|delete html\.dataset\.(androidRenderer|oneUiRenderer|worldEffects|ios18Renderer)/,
  );
  assert.doesNotMatch(mode, /SM-\[/);
  // A pre-paint data-mode belongs to /world: leaving the page removes it
  // instead of "restoring" it onto the page being entered.
  assert.match(mode, /const prepaintMode = html\.dataset\.modeOrigin === "prepaint";/);
  assert.match(mode, /const prev = prepaintMode \? undefined : html\.dataset\.mode;/);
  assert.match(mode, /if \(prev\) html\.dataset\.mode = prev;\s*else delete html\.dataset\.mode;/);
  // Native progress is only rewritten when reduced motion changes it.
  assert.match(
    mode,
    /if \(nativeProgress !== \(html\.dataset\.nativeScrollProgress === "true"\)\) \{/,
  );
  // The first scroll and layout read waits for the next frame.
  assert.match(mode, /progressFrame = window\.requestAnimationFrame\(syncPageProgress\);\s*\};/);
});
