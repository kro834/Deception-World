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
  assert.equal(
    dossierImage("/manager-zeus-detail.jpeg?v=20260823-2").srcSet,
    "/manager-zeus-detail.webp",
  );
  assert.equal(dossierImage("/manager-reemu.jpeg").srcSet, "/manager-reemu.webp");
  assert.deepEqual(dossierImage("/unknown.jpeg"), {});
});
