import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/components/zeus-button.tsx", import.meta.url), "utf8");
const styles = readFileSync(
  new URL("../src/styles-route-transitions.css", import.meta.url),
  "utf8",
);
const returnImage = statSync(new URL("../public/zeus-button-return.jpeg", import.meta.url));

test("perceptible Zeus navigation owns its state above the re-portalled button", () => {
  assert.match(source, /export function ZeusButtonProvider[\s\S]*?const navigatingRef = useRef/);
  assert.match(source, /const RETURN_DIVE_THRESHOLD_MS = 96/);
  assert.match(source, /window\.setTimeout\([\s\S]*?RETURN_DIVE_THRESHOLD_MS/);
  assert.match(source, /setReturnImage\(true\);[\s\S]*?setReturnDiveVisible\(true\)/);
  assert.match(
    source,
    /createPortal\(<ZeusReturnDive arriving=\{returnDiveArriving\} \/>, document\.body\)/,
  );
  assert.match(source, /setReturnImage\(false\);[\s\S]*?setReturnDiveArriving\(true\)/);
  assert.match(source, /removeAttribute\("data-zeus-return-loading"\)/);
});

test("the Zeus button preloads and crossfades to the supplied return character", () => {
  assert.match(source, /data-return-loading=\{String\(returnImage\)\}/);
  assert.match(source, /src="\/zeus-button-return\.jpeg"/);
  assert.match(source, /loading="eager"/);
  assert.match(styles, /\.zeus-button\[data-return-loading="true"\]/);
  assert.match(styles, /\.zeus-button-image\.is-returning/);
  assert.ok(returnImage.size > 100_000, "the character asset should retain useful detail");
  assert.ok(returnImage.size < 500_000, "the preloaded character asset should stay lightweight");
});

test("slow return uses an adaptive emerald and platinum dive", () => {
  assert.match(source, /<DiveVelocityCanvas active arriving=\{arriving\} \/>/);
  assert.match(styles, /\.zeus-return-dive \{[\s\S]*?--zeus-emerald: #32e6ba/);
  assert.match(styles, /--zeus-platinum: #edf6f4/);
  assert.match(styles, /\.zeus-return-dive\.is-arriving/);
  assert.match(styles, /@media \(max-width: 760px\), \(any-pointer: coarse\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
