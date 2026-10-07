import assert from "node:assert/strict";
import test from "node:test";
import { galleryImagePresentation } from "../src/components/gallery/gallery-image-state.ts";

test("standard image stays visible through high-quality failure and retry", () => {
  const failed = galleryImagePresentation("error", "ready", true);
  assert.deepEqual(failed, {
    showingMedium: true,
    waitingForMedium: false,
    imageUnavailable: false,
    busy: false,
    canZoom: false,
  });
  const retrying = galleryImagePresentation("loading", "ready", true);
  assert.equal(retrying.showingMedium, true);
  assert.equal(retrying.busy, false);
  assert.equal(retrying.canZoom, false);
  const restored = galleryImagePresentation("ready", "ready", true);
  assert.equal(restored.showingMedium, false);
  assert.equal(restored.canZoom, true);
});

test("standard image must load successfully before serving as a fallback", () => {
  const waiting = galleryImagePresentation("error", "loading", true);
  assert.equal(waiting.imageUnavailable, false);
  assert.equal(waiting.busy, true);
  assert.equal(waiting.showingMedium, false);
  const failed = galleryImagePresentation("error", "error", true);
  assert.equal(failed.imageUnavailable, true);
  assert.equal(failed.busy, false);
});

test("identical standard and full URLs cannot provide a fallback", () => {
  const sameUrl = galleryImagePresentation("error", "ready", false);
  assert.equal(sameUrl.showingMedium, false);
  assert.equal(sameUrl.imageUnavailable, true);
  assert.equal(sameUrl.canZoom, false);
});
