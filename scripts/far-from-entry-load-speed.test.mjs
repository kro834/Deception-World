// FAR FROM SAGA's route transition: loading speed and stability (owner,
// 2026-10-24: 「遷移アニメーションの読み込みを高速化したりして安定化して」).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const warmup = read("src/lib/far-from-entry-warmup.ts");
const gateModule = read("src/lib/far-from-entry-gate.ts");
const gate = read("src/components/load-gate.tsx");
const finalStage = read("src/components/final-stage/final-stage.tsx");

test("every image try is bounded and retried, so a stalled file never holds the warm-up or a later entry", () => {
  assert.match(warmup, /export const FAR_FROM_ENTRY_FETCH_TIMEOUT_MS = 6000;/);
  assert.match(warmup, /export const FAR_FROM_ENTRY_FETCH_RETRIES: readonly number\[\] = \[300, 1200\];/);
  assert.match(warmup, /const timer = setTimeout\(abort, FAR_FROM_ENTRY_FETCH_TIMEOUT_MS\);/);
  assert.match(warmup, /signal: attempt\.signal/);
  // The <img> fallback is bounded by the same deadline.
  assert.match(warmup, /await Promise\.race\(\[\s*image\.decode\(\),/);
  // Decoded off the main thread, once per file.
  assert.match(warmup, /createImageBitmap\(blob\)/);
  assert.match(warmup, /if \(sources\.has\(source\)\) return true;/);
});

test("the decoded images stay for the session except on a low-memory device", () => {
  assert.match(warmup, /typeof memory === "number" && memory <= 2/);
  assert.match(warmup, /if \(!force && keepsFarFromEntry\(\)\) return;/);
  // The undersuit's fire field is not rebuilt for a kept source.
  assert.match(warmup, /if \(ok && !had && source === REXONANCE_SUIT_UNDERSUIT/);
});

test("the call's chunk and the warm-up's chunk retry under a fresh URL (chunk-retry)", () => {
  assert.match(gateModule, /import \{ importWithRetry \} from "\.\/chunk-retry\.js";/);
  assert.match(
    gateModule,
    /createFarFromTransitionLoader\(\(\) =>\s*importWithRetry\(loadSequence, \{ attempts: 3, delays: \[250, 900\], timeoutMs: 8000 \}\),/,
  );
  assert.match(gateModule, /importWithRetry\(\(\) => import\("\.\/far-from-entry-warmup\.ts"\)/);
});

test("prefetch: intent first for the call's own files, then idle, in-view, side-menu and /final-stage warm-ups at low priority", () => {
  assert.match(gateModule, /export function prefetchFarFromEntry\(priority: Priority = "high"\)/);
  assert.match(gateModule, /if \(isFarFromEntryStill\(\)\) return Promise\.resolve\(false\);/);
  assert.match(gateModule, /export function prefetchFarFromEntryWhenIdle\(delayMs = 0, priority: Priority = "low"\)/);
  // The chunk at once (a slow connection is where a cold chunk misses).
  assert.match(gateModule, /isFarFromEntryStill\(\)\) return \(\) => \{\};\s*void prepareFarFromTransition\.prefetch\(\);/);
  assert.match(gate, /prefetchFarFromEntryWhenIdle\(0, "high"\)/);
  assert.match(gateModule, /export function afterFarFromEntry\(capMs = 1500\)/);
  // The page's route and art wait for the call's files on intent.
  assert.match(gate, /const later = to === "\/far-from-saga" \? afterFarFromEntry\(\) : null;/);
  // In view (a closed side menu waits for data-open).
  assert.match(gate, /new IntersectionObserver\(/);
  assert.match(gate, /panelWatch\.observe\(panel, \{ attributes: true, attributeFilter: \["data-open"\] \}\);/);
  assert.match(finalStage, /useEffect\(\(\) => prefetchFarFromEntryWhenIdle\(2500\), \[\]\);/);
});
