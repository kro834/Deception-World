import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { dossierImageSources, dossierImage } from "../src/lib/dossier-images.ts";

test("dossier and episode delivery assets retain originals and reduce transfer size", () => {
  for (const source of dossierImageSources) {
    const original = new URL(`../public${source}`, import.meta.url);
    const output = new URL(`../public${dossierImage(source).srcSet}`, import.meta.url);
    assert.equal(readFileSync(output).subarray(8, 12).toString(), "WEBP");
    assert.ok(statSync(output).size < statSync(original).size * 0.8, source);
  }
});

test("manager navigation warmup selects the same WebP as the detail page", () => {
  // Since the delivery-verify pass the hero offers a 720 px candidate beside
  // its WebP; the warm-up asks with the hero's own srcset and sizes
  // (manager-stub.tsx spreads dossierImage(profile.image)), so both pick the
  // same file on every device.
  assert.deepEqual(
    dossierImage("/manager-zeus-detail.jpeg?v=20260823-2"),
    dossierImage("/manager-zeus-detail.jpeg"),
  );
  assert.equal(
    dossierImage("/manager-zeus-detail.jpeg?v=20260823-2").srcSet,
    "/manager-zeus-detail-720.webp 720w, /manager-zeus-detail.webp 1080w",
  );
  assert.equal(
    dossierImage("/manager-reemu.jpeg").srcSet,
    "/manager-reemu-720.webp 720w, /manager-reemu.webp 941w",
  );
  assert.ok(dossierImage("/manager-reemu.jpeg").sizes);
  assert.deepEqual(dossierImage("/unknown.jpeg"), {});
});
