// Read-only QA of the actual ten-tap Ciel secret, never a forced renderer mount.
// BASE_URL=... [CIEL_PROFILES=desktop,phone320,tablet1024] [PW_ENGINE=webkit]
// [CIEL_MODES=normal,reduced,no-webgl,economy,forced-colors,blocked-jet,blocked-art,pending-import]
// [CIEL_EXTENDED=1] [CIEL_RELOAD_CYCLES=2] [CIEL_LONG_RETAIN=0] [EXPECTED_RELEASE=<full SHA>]
// node scripts/verify-ciel-inferno.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "playwright";
import sharp from "sharp";

const base = process.env.BASE_URL || "http://127.0.0.1:8198";
const out = process.env.AUDIT_OUT || "output/playwright/ciel-inferno-burned";
const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const selected = (process.env.CIEL_PROFILES || "desktop,phone320,tablet1024").split(",");
const modes = (process.env.CIEL_MODES || "normal").split(",");
const reloadCycles = Number(process.env.CIEL_RELOAD_CYCLES || 2);
assert.ok(Number.isInteger(reloadCycles) && reloadCycles >= 1 && reloadCycles <= 5);
const settingKeys = ["deception-world:zeus-button-enabled", "deception-world:zeus-button-position"];
const savedSettings = ["true", JSON.stringify({ x: 0.82, y: 0.72 })];
const profiles = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false },
  phone320: { viewport: { width: 320, height: 844 }, deviceScaleFactor: 3, hasTouch: true },
  tablet1024: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true },
};
for (const name of selected) assert.ok(profiles[name], `Unknown profile ${name}`);
for (const mode of modes)
  assert.ok(
    [
      "normal",
      "reduced",
      "no-webgl",
      "economy",
      "forced-colors",
      "blocked-jet",
      "blocked-art",
      "pending-import",
    ].includes(mode),
    mode,
  );
await mkdir(out, { recursive: true });
const browser = await engine.launch(engine === chromium ? { channel: "chrome" } : {});
const results = [];

async function installProbe(context, mode) {
  await context.addInitScript((noWebgl) => {
    window.__infernoQA = {
      pending: new Set(),
      frames: 0,
      contexts: [],
      jetDraws: 0,
      jetFrames: [],
      events: [],
      buttonChanges: [],
      documentId: `${Date.now()}-${Math.random()}`,
    };
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click", "blur", "scroll"]) {
      document.addEventListener(
        type,
        (event) => {
          const hit = event.target instanceof Element && event.target.closest("button.ciel-button");
          const button = hit || document.querySelector("button.ciel-button");
          if (!button) return;
          if (type === "blur" && !hit) return;
          const bounds = button.getBoundingClientRect();
          window.__infernoQA.events.push({
            type,
            now: performance.now(),
            insideButton: Boolean(hit),
            targetTag: event.target?.tagName,
            targetClass: event.target?.className,
            pointerType: event.pointerType,
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            buttonRect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
            relocating: button.dataset.relocating,
            scrollY,
            navigating: button.dataset.navigating,
            armed: button.dataset.secretArmed,
            awakening: button.dataset.secretAwakening,
          });
          if (window.__infernoQA.events.length > 160) window.__infernoQA.events.shift();
        },
        true,
      );
    }
    new MutationObserver((records) => {
      for (const mutation of records) {
        if (!mutation.target.matches?.("button.ciel-button")) continue;
        window.__infernoQA.buttonChanges.push({
          now: performance.now(),
          name: mutation.attributeName,
          value: mutation.target.getAttribute(mutation.attributeName),
        });
        if (window.__infernoQA.buttonChanges.length > 100) window.__infernoQA.buttonChanges.shift();
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-navigating", "data-secret-armed", "data-secret-awakening"],
    });
    const originalFrame = requestAnimationFrame.bind(window);
    const originalCancel = cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      const tagged = new Error().stack?.includes("ciel-inferno") || false;
      let id;
      id = originalFrame((time) => {
        window.__infernoQA.pending.delete(id);
        if (tagged) window.__infernoQA.frames++;
        callback(time);
      });
      if (tagged) window.__infernoQA.pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      window.__infernoQA.pending.delete(id);
      return originalCancel(id);
    };
    const originalContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (noWebgl && /^webgl/.test(kind)) return null;
      const result = originalContext.call(this, kind, ...args);
      if (
        this.classList.contains("ciel-inferno-field") ||
        this.classList.contains("ciel-inferno-detail")
      )
        window.__infernoQA.contexts.push({ kind, result: Boolean(result) });
      return result;
    };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (args[0]?.src?.includes("/ciel-inferno-20261019/jet.webp")) {
        window.__infernoQA.jetDraws++;
        const source = `${args[1]},${args[2]}`;
        if (!window.__infernoQA.jetFrames.includes(source))
          window.__infernoQA.jetFrames.push(source);
      }
      return draw.apply(this, args);
    };
  }, mode === "no-webgl");
}

const settled = (page) =>
  page.waitForFunction(
    () =>
      document.documentElement.dataset.worldPageVisible === "true" &&
      !document.documentElement.hasAttribute("data-loading") &&
      !document.documentElement.hasAttribute("data-route-scroll-settling"),
    null,
    { timeout: 60000 },
  );

async function press(page, touch, input = "pointer") {
  const button = page.locator("button.ciel-button");
  if (input === "keyboard") {
    await button.focus();
    await page.keyboard.press("Enter");
    return;
  }
  const box = await button.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, "the actual Ciel button is drawn");
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function burst(page, touch, count = 10, input = "pointer") {
  for (let i = 1; i <= count; i++) {
    await press(page, touch, input);
    if (i < 10)
      assert.equal(
        await page.locator("dialog.ciel-inferno[open]").count(),
        0,
        `tap ${i} cannot open the secret`,
      );
    if (i < count) await page.waitForTimeout(45);
  }
}

async function openEffect(page, touch, input = "pointer") {
  await burst(page, touch, 10, input);
  const dialog = page.locator("dialog.ciel-inferno[open]");
  await dialog.waitFor({ state: "visible", timeout: 12000 });
  await page.waitForFunction(
    () => document.querySelector("dialog.ciel-inferno")?.dataset.ready === "true",
    null,
    { timeout: 10000 },
  );
  return dialog;
}

async function burned(page, dir, label) {
  await page.waitForFunction(
    () => {
      const dialog = document.querySelector("dialog.ciel-inferno");
      return dialog?.dataset.phase === "burned" && dialog.dataset.ready === "true" && dialog.open;
    },
    null,
    { timeout: 15000 },
  );
  await page.waitForTimeout(200);
  const state = await page.evaluate(
    (keys) => ({
      pending: window.__infernoQA.pending.size,
      frames: window.__infernoQA.frames,
      draws: window.__infernoQA.jetDraws,
      documentId: window.__infernoQA.documentId,
      open: document.querySelector("dialog.ciel-inferno")?.open,
      phase: document.querySelector("dialog.ciel-inferno")?.dataset.phase,
      renderer: document.querySelector("dialog.ciel-inferno")?.dataset.renderer,
      canvasCount: document.querySelectorAll(".ciel-inferno canvas").length,
      controls: [...document.querySelectorAll(".ciel-inferno button, button.ciel-button")].filter(
        (element) =>
          element.getClientRects().length && getComputedStyle(element).visibility !== "hidden",
      ).length,
      scrollY,
      settings: keys.map((key) => localStorage.getItem(key)),
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
    }),
    settingKeys,
  );
  assert.equal(state.canvasCount, 0, "burned removes both GPU and detail canvases");
  assert.equal(state.renderer, "stopped", "burned no longer owns an active graphics backend");
  assert.equal(state.controls, 0, "burned has no visible return, close or navigation controls");
  assert.equal(state.pending, 0, "burned leaves no inferno requestAnimationFrame work");
  assert.deepEqual(state.settings, savedSettings, "burning never overwrites personal settings");
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(() => window.__infernoQA.frames),
    state.frames,
    "burned renderer cannot keep painting",
  );
  assert.equal(await page.evaluate(() => window.__infernoQA.jetDraws), state.draws);
  const capture = await page.screenshot({ path: join(dir, `${label}.png`), scale: "css" });
  const stats = await sharp(capture).removeAlpha().stats();
  assert.ok(
    stats.channels.slice(0, 3).every((channel) => channel.max <= 1),
    "the entire viewport is pure black",
  );
  assert.equal(stats.isOpaque, true, "the black surface is opaque, not transparent PNG pixels");
  state.blackPixelMax = Math.max(...stats.channels.slice(0, 3).map((channel) => channel.max));
  assert.ok(state.documentWidth <= state.viewportWidth, "no horizontal overflow behind the blank");
  return state;
}

const probeState = (page) =>
  page.evaluate(() => ({
    pending: window.__infernoQA.pending.size,
    frames: window.__infernoQA.frames,
    contexts: window.__infernoQA.contexts,
    events: window.__infernoQA.events,
    buttonChanges: window.__infernoQA.buttonChanges,
  }));

async function restored(page, requests, previousId) {
  await settled(page);
  await page.locator("main").first().waitFor({ state: "visible" });
  await page.locator("button.ciel-button").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const image = document.querySelector("button.ciel-button .is-default");
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  assert.equal(
    await page.locator("dialog.ciel-inferno").count(),
    0,
    "reload starts an unburned document",
  );
  assert.equal(requests.length, 0, "reload does not eagerly request the secret's code or artwork");
  const state = await page.evaluate(
    (keys) => ({
      documentId: window.__infernoQA.documentId,
      settings: keys.map((key) => localStorage.getItem(key)),
      navigationType: performance.getEntriesByType("navigation")[0]?.type,
    }),
    settingKeys,
  );
  assert.deepEqual(
    state.settings,
    savedSettings,
    "reload preserves the user's saved button preferences",
  );
  if (previousId) {
    assert.notEqual(state.documentId, previousId, "only a real reload makes a new document");
    assert.equal(state.navigationType, "reload");
  }
  return state;
}

async function retainBurned(page, touch, dir, initial) {
  const results = [];
  await page.keyboard.press("Escape");
  results.push({ kind: "escape", state: await burned(page, dir, "retained-escape") });
  const size = page.viewportSize();
  if (touch) await page.touchscreen.tap(size.width / 2, size.height / 2);
  else await page.mouse.click(size.width / 2, size.height / 2);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.mouse.wheel(0, 600);
  results.push({ kind: "tap-key-scroll", state: await burned(page, dir, "retained-input") });
  await page.evaluate(() => document.querySelector("dialog.ciel-inferno").close());
  results.push({
    kind: "external-dialog-close",
    state: await burned(page, dir, "retained-external-close"),
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  results.push({
    kind: "synthetic-hidden-pageshow",
    state: await burned(page, dir, "retained-resume"),
  });
  await page.evaluate(() => {
    location.hash = "ciel-burned-retention";
  });
  await page.waitForURL("**#ciel-burned-retention");
  results.push({ kind: "hashchange", state: await burned(page, dir, "retained-hash") });
  await page.goBack({ waitUntil: "domcontentloaded" });
  results.push({
    kind: "real-history-back",
    url: page.url(),
    state: await burned(page, dir, "retained-back"),
  });
  await page.goBack({ waitUntil: "domcontentloaded" });
  assert.equal(
    new URL(page.url()).pathname,
    "/library",
    "real Back changes routes but cannot reveal the site",
  );
  results.push({
    kind: "real-route-back",
    url: page.url(),
    state: await burned(page, dir, "retained-route-back"),
  });
  for (const result of results)
    assert.equal(
      result.state.documentId,
      initial.documentId,
      `${result.kind} cannot recreate the document to escape the burn`,
    );
  return results;
}

try {
  for (const name of selected) {
    for (const mode of modes) {
      const calm = ["reduced", "economy", "forced-colors"].includes(mode);
      const dir = join(out, `${engine.name()}-${name}-${mode}`);
      await mkdir(dir, { recursive: true });
      const context = await browser.newContext({
        ...profiles[name],
        storageState: {
          cookies: [],
          origins: [
            {
              origin: new URL(base).origin,
              localStorage: settingKeys.map((name, index) => ({
                name,
                value: savedSettings[index],
              })),
            },
          ],
        },
        ...(mode === "reduced" ? { reducedMotion: "reduce" } : {}),
        ...(mode === "forced-colors" ? { forcedColors: "active" } : {}),
      });
      await installProbe(context, mode);
      const heldImports = [];
      if (mode === "blocked-jet")
        await context.route("**/ciel-inferno-20261019/jet.webp", (route) => route.abort());
      if (mode === "blocked-art")
        await context.route(/\/ciel-inferno-20261019\/ciel-(?:720|1080)\.webp$/, (route) =>
          route.abort(),
        );
      if (mode === "pending-import")
        await context.route(/\/assets\/ciel-inferno-[^/]+\.js(?:\?|$)/, (route) => {
          heldImports.push(route);
        });
      const page = await context.newPage();
      const errors = [],
        requests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (/ciel-inferno/.test(request.url())) requests.push(request.url());
      });
      const record = { engine: engine.name(), profile: name, mode, flows: [] };
      try {
        await page.goto(`${base}/library?kind=person`, { waitUntil: "networkidle" });
        await settled(page);
        if (process.env.EXPECTED_RELEASE) {
          const release = await page.evaluate(async () => {
            const response = await fetch("/release-identity.json", { cache: "no-store" });
            return { status: response.status, identity: await response.json() };
          });
          assert.equal(
            release.status,
            200,
            "the canonical site exposes its actual release identity",
          );
          assert.equal(release.identity.sha, process.env.EXPECTED_RELEASE);
          record.releaseSha = release.identity.sha;
        }
        if (mode === "economy")
          await page.evaluate(() => {
            document.documentElement.dataset.worldEffects = "economy";
          });
        await page.locator("button.ciel-button").waitFor({ state: "visible" });
        await page.waitForTimeout(800);
        const initialSettings = await page.evaluate(() =>
          ["deception-world:zeus-button-enabled", "deception-world:zeus-button-position"].map(
            (key) => localStorage.getItem(key),
          ),
        );
        assert.deepEqual(initialSettings, savedSettings);
        assert.equal(
          requests.length,
          0,
          "an ordinary page load does not import the secret renderer or artwork",
        );
        await press(page, profiles[name].hasTouch);
        await press(page, profiles[name].hasTouch);
        assert.equal(
          requests.length,
          0,
          "first and second taps keep the heavy secret code and images unloaded",
        );
        assert.equal(await page.locator("dialog.ciel-inferno").count(), 0);
        // A pause must discard those two ordinary taps before the deliberate burst.
        await page.waitForTimeout(650);
        record.beforeBurst = await page.locator("button.ciel-button").evaluate((button) => ({
          now: performance.now(),
          navigating: button.dataset.navigating,
          armed: button.dataset.secretArmed,
        }));
        if (mode === "pending-import") {
          const awake = page.locator('button.ciel-button[data-secret-awakening="true"]');
          await burst(page, profiles[name].hasTouch);
          await awake.waitFor({ state: "attached" });
          assert.equal(
            await page.locator("dialog.ciel-inferno").count(),
            0,
            "a stalled lazy module cannot mount a phantom overlay",
          );
          await press(page, profiles[name].hasTouch);
          await awake.waitFor({ state: "detached" });
          record.flows.push({ kind: "pending-import-extra-tap-cancel" });
          await page.waitForTimeout(650);
          await burst(page, profiles[name].hasTouch);
          await awake.waitFor({ state: "attached" });
          await page.locator("button.ciel-button").focus();
          await page.keyboard.press("Escape");
          await awake.waitFor({ state: "detached" });
          record.flows.push({ kind: "pending-import-escape-cancel" });
          await page.waitForTimeout(650);
          await burst(page, profiles[name].hasTouch);
          await awake.waitFor({ state: "attached" });
          const started = Date.now();
          await awake.waitFor({ state: "detached", timeout: 14000 });
          const elapsedMs = Date.now() - started;
          assert.ok(
            elapsedMs >= 11000 && elapsedMs < 14000,
            "pending import is bounded by the provider's twelve-second release",
          );
          assert.equal(await page.locator("dialog.ciel-inferno").count(), 0);
          record.flows.push({ kind: "pending-import-twelve-second-cap", elapsedMs });
          record.requests = requests;
          record.errors = errors;
          record.probe = await probeState(page);
          assert.deepEqual(errors, []);
          results.push(record);
          console.log(
            `PASS ${engine.name()} ${name}/${mode}: tap/Escape cancellation and twelve-second cap`,
          );
          continue;
        }
        for (let cycle = 1; cycle <= reloadCycles; cycle++) {
          const cycleDir = join(dir, `cycle-${cycle}`);
          await mkdir(cycleDir, { recursive: true });
          if (cycle > 1) {
            if (mode === "economy")
              await page.evaluate(() => {
                document.documentElement.dataset.worldEffects = "economy";
              });
            await press(page, profiles[name].hasTouch);
            await press(page, profiles[name].hasTouch);
            assert.equal(
              requests.length,
              0,
              "ordinary taps after reload also keep secret resources unloaded",
            );
            await page.waitForTimeout(650);
          }
          const input = cycle % 2 ? "pointer" : "keyboard";
          const began = Date.now();
          const dialog = await openEffect(page, profiles[name].hasTouch, input);
          const active = await dialog.evaluate((node) => ({
            renderer: node.dataset.renderer,
            calm: node.dataset.calm,
            phase: node.dataset.phase,
            ready: node.dataset.ready,
            open: node.open,
            modal: node.matches(":modal"),
            scrollY,
            visibleControls: [
              ...node.querySelectorAll(
                'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
              ),
            ].filter(
              (element) =>
                element.getClientRects().length &&
                getComputedStyle(element).display !== "none" &&
                getComputedStyle(element).visibility !== "hidden",
            ).length,
          }));
          assert.equal(active.open, true);
          assert.equal(active.modal, true, "the native modal blocks accidental taps into the page");
          assert.equal(
            active.visibleControls,
            0,
            "the live effect exposes no stop or close controls",
          );
          assert.ok(["webgl2", "webgl", "2d", "calm"].includes(active.renderer));
          if (mode === "no-webgl") assert.equal(active.renderer, "2d");
          if (calm) assert.equal(active.calm, "true");
          await page.waitForFunction(
            () => {
              const image = document.querySelector(".ciel-inferno-dragon img");
              return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
            },
            null,
            { timeout: 10000 },
          );
          const artwork = await page.locator(".ciel-inferno-dragon img").evaluate((image) => ({
            currentSrc: image.currentSrc,
            width: image.naturalWidth,
            fallback: image.dataset.fallback,
            srcset: image.getAttribute("srcset"),
          }));
          assert.match(artwork.currentSrc, /\/ciel-inferno-20261019\/ciel-(?:216|720|1080)\.webp$/);
          if (mode === "blocked-art") {
            assert.equal(
              artwork.fallback,
              "true",
              "a failed large illustration uses its safe fallback",
            );
            assert.match(artwork.currentSrc, /\/ciel-216\.webp$/);
            assert.equal(
              artwork.srcset,
              null,
              "failed responsive candidates cannot cause an error loop",
            );
            // A responsive element's naturalWidth may remain density-corrected
            // (e.g. 207 CSS pixels). Decode the source without srcset to verify
            // its true 216 by 216 intrinsic pixels instead of conflating units.
            artwork.intrinsic = await page.evaluate(async (url) => {
              const source = new Image();
              source.src = url;
              await source.decode();
              return { width: source.naturalWidth, height: source.naturalHeight };
            }, artwork.currentSrc);
            assert.deepEqual(artwork.intrinsic, { width: 216, height: 216 });
          }
          record.artwork = artwork;
          await page.screenshot({ path: join(cycleDir, "awaken.png"), scale: "css" });
          if (!calm) {
            await page.waitForTimeout(1500);
            await page.screenshot({ path: join(cycleDir, "jet.png"), scale: "css" });
            await page.waitForFunction(
              () => document.querySelector("dialog.ciel-inferno")?.dataset.phase === "engulf",
              null,
              { timeout: 6000 },
            );
            await page.screenshot({ path: join(cycleDir, "engulf.png"), scale: "css" });
            await page.waitForFunction(
              () =>
                [...(document.querySelector(".ciel-inferno-dragon")?.getAnimations() || [])].some(
                  (animation) =>
                    animation.animationName === "ci-dragon-cooldown" &&
                    Number(animation.currentTime) >= 4250,
                ),
              null,
              { timeout: 6000 },
            );
            await page.screenshot({ path: join(cycleDir, "engulf-mid.png"), scale: "css" });
            await page.waitForFunction(
              () =>
                [...(document.querySelector(".ciel-inferno-dragon")?.getAnimations() || [])].some(
                  (animation) =>
                    animation.animationName === "ci-dragon-cooldown" &&
                    Number(animation.currentTime) >= 5250,
                ),
              null,
              { timeout: 6000 },
            );
            await page.screenshot({ path: join(cycleDir, "coal.png"), scale: "css" });
            await page.waitForFunction(
              () => document.querySelector("dialog.ciel-inferno")?.dataset.phase === "ash",
              null,
              { timeout: 6000 },
            );
            await page.screenshot({ path: join(cycleDir, "ash.png"), scale: "css" });
            // Ash starts before the supplied art has fully faded. Verify the
            // genuinely spent surface as well, without seeking its real clock.
            await page.waitForFunction(
              () =>
                [...(document.querySelector(".ciel-inferno-dragon")?.getAnimations() || [])].some(
                  (animation) =>
                    animation.animationName === "ci-dragon-cooldown" &&
                    Number(animation.currentTime) >= 6600,
                ),
              null,
              { timeout: 4000 },
            );
            await page.screenshot({ path: join(cycleDir, "coal-final.png"), scale: "css" });
            const spent = await page
              .locator(".ciel-inferno-dragon")
              .evaluate((dragon) => Number(getComputedStyle(dragon).opacity));
            assert.ok(spent <= 0.03, "the final ash surface no longer retains the dragon overlay");
            const rendering = await dialog.evaluate((node) => ({
              jet: node.dataset.jet,
              draws: window.__infernoQA.jetDraws,
              frames: window.__infernoQA.jetFrames.length,
            }));
            if (mode === "blocked-jet") {
              assert.equal(rendering.jet, "fallback");
              assert.equal(rendering.draws, 0);
            } else {
              assert.equal(
                rendering.jet,
                "ready",
                "the live effect decodes its real Blender pressure-jet sheet",
              );
              assert.ok(
                rendering.draws > 0 && rendering.frames > 8,
                "the sheet actually animates in the real canvas",
              );
            }
            record.rendering = rendering;
          }
          const terminal = await burned(page, cycleDir, "burned");
          const flow = {
            kind: `${input}-burned-until-reload`,
            cycle,
            active,
            terminal,
            elapsedMs: Date.now() - began,
          };
          if (cycle === 1) {
            flow.retained = await retainBurned(page, profiles[name].hasTouch, cycleDir, terminal);
            if (mode === "normal" && name === "desktop" && process.env.CIEL_LONG_RETAIN !== "0") {
              await page.waitForTimeout(14000);
              flow.afterFourteenSeconds = await burned(page, cycleDir, "retained-fourteen-seconds");
            }
          }
          if (calm) {
            assert.equal(
              requests.some((url) => /\/jet\.webp/.test(url)),
              false,
              "calm modes do not download or decode the pressure jet",
            );
            assert.equal(
              await page.evaluate(() =>
                window.__infernoQA.contexts.some(
                  (entry) => /^webgl/.test(entry.kind) && entry.result,
                ),
              ),
              false,
              "calm modes allocate no WebGL context",
            );
          }
          flow.requests = [...requests];
          flow.probe = await probeState(page);
          requests.length = 0;
          await page.reload({ waitUntil: "networkidle" });
          flow.restoredByReload = await restored(page, requests, terminal.documentId);
          await page.screenshot({ path: join(cycleDir, "restored-by-reload.png"), scale: "css" });
          record.flows.push(flow);
        }
        if (mode === "normal" && name === "desktop" && process.env.CIEL_EXTENDED === "1") {
          for (const fault of [
            "escape",
            "external-close",
            "hidden",
            "context-lost",
            "route-back",
          ]) {
            requests.length = 0;
            await page.goto(`${base}/library?kind=person`, { waitUntil: "networkidle" });
            await restored(page, requests);
            const dialog = await openEffect(page, profiles[name].hasTouch);
            if (fault === "escape") await page.keyboard.press("Escape");
            if (fault === "external-close") await dialog.evaluate((node) => node.close());
            if (fault === "hidden") {
              await page.evaluate(() => {
                Object.defineProperty(document, "hidden", { configurable: true, value: true });
                document.dispatchEvent(new Event("visibilitychange"));
                delete document.hidden;
                document.dispatchEvent(new Event("visibilitychange"));
              });
            }
            if (fault === "context-lost") {
              const kind = await dialog.getAttribute("data-renderer");
              if (kind === "webgl2" || kind === "webgl") {
                const lost = await page.evaluate((contextKind) => {
                  const canvas = document.querySelector("canvas.ciel-inferno-field");
                  const extension = canvas
                    .getContext(contextKind)
                    ?.getExtension("WEBGL_lose_context");
                  extension?.loseContext();
                  return Boolean(extension);
                }, kind);
                assert.equal(lost, true, "the failure uses a real WebGL context loss");
              } else await page.keyboard.press("Escape");
            }
            if (fault === "route-back") await page.goBack({ waitUntil: "domcontentloaded" });
            const terminal = await burned(page, dir, `fault-${fault}-burned`);
            const flow = {
              kind: `live-${fault}-commits-burned`,
              terminal,
              probe: await probeState(page),
            };
            requests.length = 0;
            await page.reload({ waitUntil: "networkidle" });
            flow.restoredByReload = await restored(page, requests, terminal.documentId);
            record.flows.push(flow);
          }
        }
        assert.deepEqual(errors, [], "no browser JavaScript errors in the real secret journey");
        record.requests = requests;
        record.errors = errors;
        record.probe = await probeState(page);
        results.push(record);
        console.log(
          `PASS ${engine.name()} ${name}/${mode}: ${reloadCycles} reload-only burned cycles, real input and stopped GPU`,
        );
      } catch (error) {
        record.failure = { message: error.message, stack: error.stack };
        record.requests = requests;
        record.errors = errors;
        record.failureState = await page
          .evaluate(() => ({
            url: location.href,
            focus: document.activeElement?.outerHTML?.slice(0, 1200),
            button: document.querySelector("button.ciel-button")?.outerHTML?.slice(0, 2400),
            dialogs: [...document.querySelectorAll("dialog.ciel-inferno")].map((dialog) => ({
              html: dialog.outerHTML.slice(0, 2000),
              style: {
                display: getComputedStyle(dialog).display,
                visibility: getComputedStyle(dialog).visibility,
                opacity: getComputedStyle(dialog).opacity,
              },
            })),
            probe: {
              pending: window.__infernoQA.pending.size,
              frames: window.__infernoQA.frames,
              contexts: window.__infernoQA.contexts,
              events: window.__infernoQA.events,
              buttonChanges: window.__infernoQA.buttonChanges,
            },
          }))
          .catch(() => null);
        await page.screenshot({ path: join(dir, "failure.png"), scale: "css" }).catch(() => {});
        throw error;
      } finally {
        for (const route of heldImports) await route.abort().catch(() => {});
        await writeFile(join(dir, "result.json"), JSON.stringify(record, null, 2) + "\n");
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(join(out, "report.json"), JSON.stringify({ base, results }, null, 2) + "\n");
}
