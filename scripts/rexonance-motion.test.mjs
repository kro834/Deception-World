import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
const css = read("styles-rexonance-motion.css");
const component = read("components/rexonance-saga/rexonance-saga.tsx");

test("Resonance choreography uses finite motion without blocking input", () => {
  assert.doesNotMatch(css, /\binfinite\b|touch-action:\s*none|backdrop-filter|\bfilter:/);
  assert.match(css, /pointer-events: none/);
  for (const name of ["rxsConvergence", "rxsScanPass", "rxsSignalResolve", "rxsCoreMaterialize"]) {
    assert.ok(css.includes(`@keyframes ${name}`));
  }
});

test("Motion preferences and page visibility have symmetric cleanup", () => {
  for (const verb of ["add", "remove"]) {
    assert.ok(component.includes(`media.${verb}EventListener("change", updateMotion)`));
    assert.ok(
      component.includes(`document.${verb}EventListener("visibilitychange", updateVisibility)`),
    );
  }
  assert.match(css, /animation-play-state: paused !important/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /data-motion-ready="false"/);
});

test("Rexonance motion is only linked from its own route", () => {
  assert.ok(read("routes/rexonance-saga.tsx").includes("styles-rexonance-motion.css?url"));
  assert.ok(!read("routes/extreme-saga.tsx").includes("styles-rexonance-motion.css?url"));
});
