// Read-only QA of the actual ten-tap Ciel secret, never a forced renderer mount.
// BASE_URL=... [CIEL_PROFILES=desktop,phone320,tablet1024] [PW_ENGINE=webkit]
// [CIEL_MODES=normal,reduced,no-webgl,economy,forced-colors,blocked-jet,blocked-art,pending-import]
// [CIEL_EXTENDED=0] [CIEL_AUTO_CYCLES=3] [EXPECTED_RELEASE=<full SHA>]
// node scripts/verify-ciel-inferno.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8198";
const out = process.env.AUDIT_OUT || "output/playwright/ciel-inferno";
const engine = process.env.PW_ENGINE === "webkit" ? webkit : chromium;
const selected = (process.env.CIEL_PROFILES || "desktop,phone320,tablet1024").split(",");
const modes = (process.env.CIEL_MODES || "normal").split(",");
const autoCycles = Number(process.env.CIEL_AUTO_CYCLES || 1);
assert.ok(Number.isInteger(autoCycles) && autoCycles >= 1 && autoCycles <= 5);
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

async function press(page, touch) {
  const button = page.locator("button.ciel-button");
  const box = await button.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, "the actual Ciel button is drawn");
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function burst(page, touch, count = 10) {
  for (let i = 1; i <= count; i++) {
    await press(page, touch);
    if (i < 10)
      assert.equal(
        await page.locator("dialog.ciel-inferno[open]").count(),
        0,
        `tap ${i} cannot open the secret`,
      );
    if (i < count) await page.waitForTimeout(45);
  }
}

async function openEffect(page, touch) {
  await burst(page, touch);
  const dialog = page.locator("dialog.ciel-inferno[open]");
  await dialog.waitFor({ state: "visible", timeout: 12000 });
  await page.waitForFunction(
    () => document.querySelector("dialog.ciel-inferno")?.dataset.ready === "true",
    null,
    { timeout: 10000 },
  );
  return dialog;
}

async function closed(page) {
  await page.locator("dialog.ciel-inferno").waitFor({ state: "detached", timeout: 15000 });
  await page.waitForTimeout(350);
  const state = await page.evaluate(() => ({
    pending: window.__infernoQA.pending.size,
    frames: window.__infernoQA.frames,
    focus: document.activeElement?.classList.contains("ciel-button"),
    activeElement: {
      tag: document.activeElement?.tagName,
      className: document.activeElement?.className,
      id: document.activeElement?.id,
    },
    scrollY,
    settings: ["deception-world:zeus-button-enabled", "deception-world:zeus-button-position"].map(
      (key) => localStorage.getItem(key),
    ),
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
  }));
  assert.equal(state.pending, 0, "closed effect leaves no inferno requestAnimationFrame work");
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => window.__infernoQA.frames),
    state.frames,
    "closed renderer cannot keep painting",
  );
  assert.ok(state.documentWidth <= state.viewportWidth, "no horizontal overflow after cleanup");
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

try {
  for (const name of selected) {
    for (const mode of modes) {
      const calm = ["reduced", "economy", "forced-colors"].includes(mode);
      const dir = join(out, `${engine.name()}-${name}-${mode}`);
      await mkdir(dir, { recursive: true });
      const context = await browser.newContext({
        ...profiles[name],
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
        await page.goto(`${base}/world#top`, { waitUntil: "networkidle" });
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
        const dialog = await openEffect(page, profiles[name].hasTouch);
        const active = await dialog.evaluate((node) => ({
          renderer: node.dataset.renderer,
          calm: node.dataset.calm,
          phase: node.dataset.phase,
          ready: node.dataset.ready,
          open: node.open,
          modal: node.matches(":modal"),
          scrollY,
        }));
        assert.equal(active.open, true);
        assert.equal(active.modal, true, "the native modal blocks accidental taps into the page");
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
        await page.screenshot({ path: join(dir, "awaken.png"), scale: "css" });
        if (!calm) {
          await page.waitForTimeout(1500);
          await page.screenshot({ path: join(dir, "jet.png"), scale: "css" });
          await page.waitForFunction(
            () => document.querySelector("dialog.ciel-inferno")?.dataset.phase === "engulf",
            null,
            { timeout: 6000 },
          );
          await page.screenshot({ path: join(dir, "engulf.png"), scale: "css" });
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
          await page.screenshot({ path: join(dir, "coal.png"), scale: "css" });
          await page.waitForFunction(
            () => document.querySelector("dialog.ciel-inferno")?.dataset.phase === "ash",
            null,
            { timeout: 6000 },
          );
          await page.screenshot({ path: join(dir, "ash.png"), scale: "css" });
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
          await page.screenshot({ path: join(dir, "coal-final.png"), scale: "css" });
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
        await page.keyboard.press("Escape");
        const afterEscape = await closed(page);
        record.flows.push({ kind: "pointer-ten", active, after: afterEscape });
        assert.deepEqual(
          afterEscape.settings,
          initialSettings,
          "secret does not rewrite the user's button preferences",
        );
        assert.ok(
          Math.abs(afterEscape.scrollY - active.scrollY) <= 2,
          "closing restores the underlying scroll position",
        );
        assert.equal(afterEscape.focus, true, "closing restores keyboard focus to Ciel");

        // A second invocation comes from actual keyboard activation. It must
        // not rely on a synthetic renderer event or a private mount hook.
        for (let i = 0; i < 10; i++) {
          await page.locator("button.ciel-button").focus();
          await page.keyboard.press("Enter");
          if (i < 9) assert.equal(await page.locator("dialog.ciel-inferno[open]").count(), 0);
          await page.waitForTimeout(45);
        }
        await page.locator("dialog.ciel-inferno[open]").waitFor({ state: "visible" });
        await page.getByRole("button", { name: "演出を終了", exact: true }).click();
        const afterKeyboard = await closed(page);
        assert.equal(
          afterKeyboard.focus,
          true,
          "the close control returns focus to the live Ciel button",
        );
        record.flows.push({ kind: "keyboard-ten-close", after: afterKeyboard });

        // Auto-finish and a live graphics-failure path are exercised once per
        // mode/profile without advancing or replacing the renderer's clock.
        for (let cycle = 1; cycle <= autoCycles; cycle++) {
          await openEffect(page, profiles[name].hasTouch);
          const autoStarted = Date.now();
          await page
            .locator("dialog.ciel-inferno")
            .waitFor({ state: "detached", timeout: calm ? 5000 : 13000 });
          const autoElapsedMs = Date.now() - autoStarted;
          const afterAuto = await closed(page);
          assert.equal(
            afterAuto.focus,
            true,
            `automatic completion ${cycle} returns focus to the live Ciel button`,
          );
          assert.deepEqual(
            afterAuto.settings,
            initialSettings,
            `automatic completion ${cycle} preserves preferences`,
          );
          assert.ok(
            Math.abs(afterAuto.scrollY - active.scrollY) <= 2,
            `automatic completion ${cycle} preserves the underlying scroll position`,
          );
          record.flows.push({
            kind: "auto",
            cycle,
            elapsedMs: autoElapsedMs,
            after: afterAuto,
          });
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
        if (mode === "normal" && name === "desktop" && process.env.CIEL_EXTENDED !== "0") {
          await openEffect(page, profiles[name].hasTouch);
          await page.evaluate(() => {
            Object.defineProperty(document, "hidden", { configurable: true, value: true });
            document.dispatchEvent(new Event("visibilitychange"));
          });
          record.flows.push({ kind: "synthetic-hidden-cancel", after: await closed(page) });
          await page.evaluate(() => {
            delete document.hidden;
            document.dispatchEvent(new Event("visibilitychange"));
          });
          await openEffect(page, profiles[name].hasTouch);
          const renderer = await page.locator("dialog.ciel-inferno").getAttribute("data-renderer");
          if (renderer === "webgl2" || renderer === "webgl") {
            const lost = await page.evaluate((kind) => {
              const canvas = document.querySelector("canvas.ciel-inferno-field");
              const gl = canvas.getContext(kind);
              const extension = gl?.getExtension("WEBGL_lose_context");
              if (!extension) return false;
              extension.loseContext();
              return true;
            }, renderer);
            assert.equal(lost, true, "a real WebGL context-loss path is available");
            record.flows.push({ kind: "webgl-context-lost", after: await closed(page) });
          } else {
            await page.keyboard.press("Escape");
            record.flows.push({
              kind: "context-loss-not-applicable",
              renderer,
              after: await closed(page),
            });
          }
          await page.goto(`${base}/library?kind=person`, { waitUntil: "networkidle" });
          await settled(page);
          await openEffect(page, profiles[name].hasTouch);
          await page.goBack({ waitUntil: "domcontentloaded" });
          await settled(page);
          assert.equal(
            new URL(page.url()).pathname,
            "/library",
            "real browser Back owns its destination",
          );
          record.flows.push({
            kind: "real-history-route-cancel",
            url: page.url(),
            after: await closed(page),
          });
        }
        assert.deepEqual(errors, [], "no browser JavaScript errors in the real secret journey");
        record.requests = requests;
        record.errors = errors;
        record.probe = await probeState(page);
        results.push(record);
        console.log(
          `PASS ${engine.name()} ${name}/${mode}: true pointer 9/10, keyboard, close, automatic cleanup`,
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
