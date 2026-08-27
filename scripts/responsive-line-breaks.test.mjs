import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("long rider and pickup headings can wrap without affecting compact labels", async () => {
  const [addon, sourcePart, rexonance, mobile] = await Promise.all([
    read("src/styles-world-addon.css"),
    read("source-parts/src/styles-world-addon.css/01.part"),
    read("src/styles-world/rexonance-pickup.css"),
    read("src/styles-world/09.css"),
  ]);

  const headingRule = /\.form-pickup-copy h2,\s*\.rider-detail h3\s*\{[^}]*overflow-wrap:\s*anywhere\s*!important;[^}]*word-break:\s*normal;/s;
  assert.match(addon, headingRule);
  assert.match(sourcePart, headingRule);

  const pickupTitle = /\.is-rexonance-pickup \.form-pickup-copy h2 b\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s;
  const dialogTitle = /\.is-rexonance-dialog \.form-pickup-heading h2 b\s*\{[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;/s;
  assert.match(rexonance, pickupTitle);
  assert.match(rexonance, dialogTitle);

  assert.match(mobile, /\.hero h1 strong\s*\{[^}]*white-space:\s*nowrap;/s);
});

test("pickup headings use semantic lines and iPad-specific typography", async () => {
  const [component, componentSource, addon, addonSource, rexonance] = await Promise.all([
    read("src/components/world/manager-stub.tsx"),
    read("source-parts/src/components/world/manager-stub.tsx/01.part"),
    read("src/styles-world-addon.css"),
    read("source-parts/src/styles-world-addon.css/02.part"),
    read("src/styles-world/rexonance-pickup.css"),
  ]);

  const semanticHeading = /<h2>\s*<span>\{riderPrefix\}<\/span>\s*<b>\{rider\.name\}<\/b>\s*<\/h2>/s;
  assert.match(component, semanticHeading);
  assert.match(componentSource, semanticHeading);

  const headingLines = /\.form-pickup-heading h2 > span,\s*\.form-pickup-heading h2 > b\s*\{[^}]*display:\s*block;[^}]*max-width:\s*100%;/s;
  assert.match(addon, headingLines);
  assert.match(addonSource, headingLines);

  const ipadHeading = /@media \(min-width: 768px\) and \(max-width: 1180px\)[\s\S]*?\.form-pickup-heading h2\s*\{[^}]*font-size:\s*clamp\(34px, 4\.5vw, 50px\);/s;
  assert.match(addon, ipadHeading);
  assert.match(addonSource, ipadHeading);

  const rexonanceTabletHeading = /@media \(min-width: 701px\) and \(max-width: 1180px\)[\s\S]*?\.is-rexonance-dialog \.form-pickup-heading h2\s*\{[^}]*font-size:\s*clamp\(40px, 5\.2vw, 62px\);/s;
  assert.match(rexonance, rexonanceTabletHeading);
});
