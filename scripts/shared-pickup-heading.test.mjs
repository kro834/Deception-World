import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worldPolish = readFileSync(new URL("../src/styles-world/21.css", import.meta.url), "utf8");
const pickupStability = readFileSync(
  new URL("../src/styles-pickup-stability.css", import.meta.url),
  "utf8",
);

test("shared pickup headings use the full line below the fixed close control", () => {
  assert.match(
    pickupStability,
    /\.form-pickup-panel\s*\{[\s\S]*?padding-top:\s*76px/,
    "the scrolling panel reserves a toolbar row before its heading",
  );
  assert.match(
    pickupStability,
    /\.form-pickup-close\s*\{[\s\S]*?top:\s*12px;[\s\S]*?height:\s*48px/,
    "the fixed close control ends before the heading starts",
  );
  assert.match(
    worldPolish,
    /\.form-pickup-heading\s*\{\s*padding-right:\s*0;/,
    "long shared form names retain their full available line width",
  );
  assert.doesNotMatch(worldPolish, /\.form-pickup-heading\s*\{\s*padding-right:\s*64px;/);
});

test("standard pickup labels keep a readable hierarchy without replacing Rexonance art direction", () => {
  assert.match(
    pickupStability,
    /\.form-pickup-dialog:not\(\.is-rexonance-dialog\) \.form-pickup-heading > small\s*\{[^}]*font-size: 12px;/,
  );
  assert.match(pickupStability, /\.form-pickup-heading\s+h2\s+> span\s*\{[^}]*font-size: 0\.6em;/);
  assert.match(pickupStability, /\.form-pickup-layout figcaption\s*\{[^}]*flex-wrap: wrap;/);
  assert.match(
    pickupStability,
    /\.form-pickup-layout figcaption > \*\s*\{[^}]*max-width: 100%;[^}]*overflow-wrap: anywhere;/,
  );
  assert.match(
    pickupStability,
    /\.form-pickup-layout\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/,
  );
});
