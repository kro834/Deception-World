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
