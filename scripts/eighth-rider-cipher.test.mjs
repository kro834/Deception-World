import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const home = read("src/components/world/world-home.tsx");
const dossier = read("src/components/world/rider-page.tsx");
const nav = read("src/components/world/dossier-nav.tsx");
const gate = read("src/components/load-gate.tsx");
const worldCss = read("src/styles-world.css");

test("Cipher is the eighth rider everywhere the rider index is exposed", () => {
  assert.match(home, /id: "cipher",\s*no: "08"/);
  assert.match(home, /aria-label="八人のメインライダー"/);
  assert.match(home, /EIGHT RIDERS \/ ONE WORLD/);
  assert.match(nav, /href: "\/riders\/cipher"/);
  assert.match(nav, /kicker: "RIDER 08"/);
  assert.match(dossier, /indexLabel="EIGHT RIDERS"/);
});

test("Lucien and both Cipher forms use the supplied records and assets", () => {
  for (const path of [
    "../public/civilian-cipher.jpeg",
    "../public/rider-cipher.jpeg",
    "../public/rider-cipher-blacksite.jpeg",
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), true, `${path} must exist`);
  }
  assert.match(dossier, /title: "最期の死者"/);
  assert.match(dossier, /name: "サイファー"/);
  assert.match(dossier, /name: "サイファー・ブラックサイト"/);
  assert.match(dossier, /rider\.id === "cipher" \? rider\.forms/);
  assert.match(dossier, /name: "SPOOF"/);
  assert.match(dossier, /name: "DEAD DROP"/);
  assert.match(dossier, /name: "BLACKOUT"/);
  assert.match(dossier, /name: "BURN NOTICE"/);
  assert.match(dossier, /"ON EARTH!\?"/);
  assert.match(dossier, /"FOCUS ON!"/);
  assert.match(dossier, /サイファードライバー × プライムコア/);
  assert.match(dossier, /name: "サイファーエンター"/);
  assert.match(dossier, /name: "サイファーコンカー"/);
});

test("Cipher dossier navigation no longer mounts a route loading cut-in", () => {
  assert.doesNotMatch(gate, /RIDER_CUT_IN_ROUTES/);
  assert.doesNotMatch(gate, /cipher-slash-field/);
  assert.doesNotMatch(worldCss, /styles-world\/22\.css/);
  assert.match(
    gate,
    /if \(!isArchiveTransition && !isZeusTransition\) \{[\s\S]*?await navigate\(\{ to: to as never, hash \}\);[\s\S]*?return;/,
  );
});
