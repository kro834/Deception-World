import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:8082";
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
const results = [];
const soundFile = /\.(?:mp3|wav|ogg|m4a|aac)(?:[?#]|$)/i;
const scenarios = [
  { name: "desktop-replays", viewport: { width: 1440, height: 900 }, replays: 3 },
  { name: "phone-replays", viewport: { width: 390, height: 844 }, replays: 3 },
  { name: "narrow-portrait", viewport: { width: 320, height: 568 }, replays: 3 },
  { name: "short-landscape", viewport: { width: 568, height: 320 }, replays: 3 },
  { name: "early-entry", viewport: { width: 1024, height: 1366 }, replays: 0 },
  {
    name: "reduced-motion",
    viewport: { width: 390, height: 844 },
    replays: 0,
    reducedMotion: "reduce",
  },
];

async function assertOpeningHitTargets(page, skipExpected = false) {
  const hits = await page.evaluate(() => {
    const deck = document.querySelector(".cine-replay-slot");
    const rect = deck.getBoundingClientRect();
    const ownsPoint = (element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit?.closest("button") === element;
    };
    const buttons = [...deck.querySelectorAll("button")].filter((button) => {
      const box = button.getBoundingClientRect();
      return !button.disabled && box.width > 0 && box.height > 0;
    });
    const blank = document.elementFromPoint(rect.left + 4, rect.top + rect.height / 2);
    const skip = document.querySelector(".cine-skip");
    const skipBox = skip.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      phase: document.querySelector(".cine-stage").className,
      deckPointerEvents: getComputedStyle(deck).pointerEvents,
      blankHitsDeck: blank?.closest(".cine-replay-slot") === deck,
      buttons: buttons.map((button) => {
        const box = button.getBoundingClientRect();
        return {
          label: button.textContent.trim(),
          ownsPoint: ownsPoint(button),
          width: box.width,
          height: box.height,
          overlapsSkip:
            !skip.disabled &&
            box.left < skipBox.right &&
            box.right > skipBox.left &&
            box.top < skipBox.bottom &&
            box.bottom > skipBox.top,
        };
      }),
      skipOwnsPoint: !skip.disabled && ownsPoint(skip),
      skipSize: { width: skipBox.width, height: skipBox.height },
    };
  });
  assert.equal(hits.deckPointerEvents, "none");
  assert.equal(
    hits.blankHitsDeck,
    false,
    "the full-width deck's blank space must not intercept SKIP",
  );
  assert.ok(hits.buttons.length > 0, "early ENTER remains an available pointer target");
  assert.ok(
    hits.buttons.every((button) => button.ownsPoint && button.width >= 44 && button.height >= 44),
    JSON.stringify(hits),
  );
  if (skipExpected) {
    assert.equal(hits.skipOwnsPoint, true, JSON.stringify(hits));
    assert.ok(hits.skipSize.width >= 44 && hits.skipSize.height >= 44, JSON.stringify(hits));
    assert.ok(
      hits.buttons.every((button) => !button.overlapsSkip),
      JSON.stringify(hits),
    );
  }
  return hits;
}

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: scenario.viewport,
      reducedMotion: scenario.reducedMotion || "no-preference",
    });
    const page = await context.newPage();
    const errors = [];
    const requests = [];
    const responses = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (soundFile.test(request.url())) requests.push(request.url());
    });
    page.on("response", (response) => {
      if (/^audio\//i.test(response.headers()["content-type"] || ""))
        responses.push(response.url());
    });
    await page.addInitScript(() => {
      window.__soundAttempts = [];
      window.__visualMedia = [];
      const forbidden = (name) =>
        function removedSound() {
          window.__soundAttempts.push(name);
          throw new Error(`unexpected removed sound API: ${name}`);
        };
      for (const name of ["AudioContext", "webkitAudioContext", "OfflineAudioContext", "Audio"]) {
        Object.defineProperty(window, name, { configurable: true, value: forbidden(name) });
      }
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        window.__visualMedia.push({ element: this.tagName, muted: this.muted });
        if (this.tagName === "AUDIO" || !this.muted) {
          window.__soundAttempts.push(`unmuted media: ${this.tagName}`);
          return Promise.reject(new Error("unexpected unmuted media"));
        }
        return Reflect.apply(play, this, args);
      };
    });
    await page.goto(new URL("/", base).href);
    await page.locator(".cine-stage").waitFor();
    await assertOpeningHitTargets(page);
    assert.equal(await page.locator(".cine-always, audio, [aria-keyshortcuts='M']").count(), 0);
    assert.equal(await page.getByRole("button", { name: /音声を(?:オン|オフ)|SOUND/i }).count(), 0);
    await page.keyboard.press("m");
    if (scenario.replays > 0) {
      await page.locator(".cine-stage.is-playing").waitFor();
      for (let run = 0; run < scenario.replays; run++) {
        if (run > 0) {
          // Keep the existing 600 ms anti-double-tap guard; it is not an audio gate.
          await page.waitForTimeout(650);
          await page.getByRole("button", { name: "もう一度" }).click();
          await page.locator(".cine-stage.is-playing").waitFor();
        }
        await page.mouse.click(12, scenario.viewport.height / 2);
        await page.keyboard.press("m");
        const playingHits = await assertOpeningHitTargets(page, true);
        if (run === 0) {
          // Include a full visual sequence, not just an immediate SKIP.
          await page.locator(".cine-stage.is-complete").waitFor({ timeout: 15_000 });
        } else if (run === 1) {
          await page.getByRole("button", { name: "オープニングをスキップ" }).click();
        } else {
          await page.keyboard.press("s");
        }
        await page.locator(".cine-stage.is-complete").waitFor();
        const completeHits = await assertOpeningHitTargets(page);
        const attempts = await page.evaluate(() => window.__soundAttempts);
        assert.deepEqual(attempts, []);
        assert.deepEqual(requests, []);
        assert.deepEqual(responses, []);
        assert.deepEqual(errors, []);
        results.push({
          scenario: scenario.name,
          run,
          playingHits,
          completeHits,
          soundAttempts: attempts.length,
          pass: true,
        });
      }
    }
    if (scenario.reducedMotion === "reduce") {
      await page.locator(".cine-stage.is-complete").waitFor();
      assert.equal(await page.getByRole("button", { name: "もう一度" }).isVisible(), false);
    }
    await page.locator(".cine-btn-primary").click();
    await page.waitForURL((url) => url.pathname === "/world", { timeout: 30_000 });
    await page.waitForTimeout(400);
    const evidence = await page.evaluate(() => ({
      soundAttempts: window.__soundAttempts,
      visualMedia: window.__visualMedia,
      audioElements: document.querySelectorAll("audio").length,
    }));
    assert.deepEqual(evidence.soundAttempts, []);
    assert.equal(evidence.audioElements, 0);
    assert.ok(evidence.visualMedia.every((media) => media.element === "VIDEO" && media.muted));
    assert.deepEqual(requests, []);
    assert.deepEqual(responses, []);
    assert.deepEqual(errors, []);
    results.push({
      scenario: scenario.name,
      phase: "world",
      ...evidence,
      soundRequests: requests.length,
      pass: true,
    });
    await context.close();
  }
  console.log(JSON.stringify({ results }, null, 2));
} finally {
  await browser.close();
}
