import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const riderPage = readFileSync(
  new URL("../src/components/world/rider-page.tsx", import.meta.url),
  "utf8",
);
const pickup = readFileSync(
  new URL("../src/components/world/manager-stub.tsx", import.meta.url),
  "utf8",
);
const worldHome = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(
  new URL("../src/styles-world/rexonance-pickup.css", import.meta.url),
  "utf8",
);
const reconstructedRider = ["01.part", "04.part", "05.part"]
  .map((part) => readFileSync(new URL(`../source-parts/src/components/world/rider-page.tsx/${part}`, import.meta.url), "utf8"))
  .join("\n");
const reconstructedPickup = readFileSync(
  new URL("../source-parts/src/components/world/manager-stub.tsx/01.part", import.meta.url),
  "utf8",
);
const reconstructedHome = readFileSync(
  new URL("../source-parts/src/components/world/world-home.tsx/01.part", import.meta.url),
  "utf8",
);

const assets = [
  "rider-rexonance-saga-pickup.jpeg",
  "weapon-realm-slayer-mark-vi.jpeg",
  "weapon-realm-slayer-mark-xiv.jpeg",
  "weapon-axis-raker-mark-vii-arcs.jpeg",
  "weapon-axis-raker-mark-vii-launcher.jpeg",
  "weapon-unite-edge-lancer.jpeg",
];

test("Saga keeps Extreme and Rexonance as two dedicated pickup records", () => {
  assert.match(riderPage, /name: "エクスプリームサーガ"[\s\S]*?featuredPickup: true/);
  assert.match(riderPage, /name: "レクソナンスサーガ"[\s\S]*?featuredPickup: true,[\s\S]*?theme: "rexonance"/);
  assert.match(riderPage, /rider\.id === "saga"[\s\S]*?rider\.forms\.filter\(\(form\) => form\.featuredPickup\)/);
  assert.match(riderPage, /332\.2t/);
  assert.match(riderPage, /480\.5t/);
  assert.match(riderPage, /50000YOPS／∞Core/);
  assert.match(riderPage, /SA-GA OS 5\.5/);
  assert.match(riderPage, /REXONANCE NANO ARMOR/);
  assert.match(riderPage, /デウスシフト・レクソナンスパーク/);
});

test("all supplied Rexonance and linked-armament assets are present and mapped", () => {
  for (const asset of assets) {
    assert.ok(statSync(new URL(`../public/${asset}`, import.meta.url)).size > 50_000, asset);
    assert.match(riderPage, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const label of [
    "レルムスレイヤー・マークⅥ",
    "レルムスレイヤー・マークXIV",
    "アクシスレイカー・マークⅦ　アークスモード",
    "アクシスレイカー・マークⅦ　ランチャーモード",
    "ユナイトエッジ　ランサーモード",
  ]) {
    assert.ok(riderPage.includes(label), label);
  }
});

test("Eight Riders uses the supplied Rexonance portrait for Saga", () => {
  for (const source of [worldHome, reconstructedHome]) {
    assert.match(
      source,
      /id: "saga"[\s\S]*?img: "\/rider-saga-rexonance-thumbnail-20260827\.jpeg"/,
    );
  }
  const asset = new URL("../public/rider-saga-rexonance-thumbnail-20260827.jpeg", import.meta.url);
  const bytes = readFileSync(asset);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.ok(statSync(asset).size < 200_000, "Saga thumbnail should remain below 200 KB");
});

test("Rexonance opens through an isolated cyan-pink spiral gate", () => {
  assert.match(pickup, /const isRexonance = rider\.theme === "rexonance"/);
  assert.match(pickup, /setGateActive\(true\)/);
  assert.match(pickup, /gatePending\.current = true/);
  assert.match(pickup, /new window\.Image\(\)/);
  assert.match(pickup, /preload\.decode\?\.\(\)/);
  assert.match(pickup, /window\.setTimeout\(finishGate, reducedMotion \? 180 : 1400\)/);
  assert.match(pickup, /event\.animationName !== "rexonanceGateLife"/);
  assert.match(pickup, /createPortal\(/);
  assert.match(pickup, /if \(gatePending\.current\) return/);
  assert.match(pickup, /aria-busy=\{gateActive\}/);
  assert.match(pickup, /fetchPriority=\{isRexonance \? "high" : "auto"\}/);
  assert.match(pickup, /loading=\{isRexonance \? "eager" : "lazy"\}/);
  assert.match(pickup, /rexonance-gate-spiral is-cyan/);
  assert.match(pickup, /rexonance-gate-spiral is-pink/);
  assert.match(pickup, /rexonance-gate-stars/);
  assert.match(pickup, /rexonance-gate-prism/);
  assert.match(pickup, /rexonance-gate-horizon/);
  assert.match(pickup, /className="rexonance-weapon-gallery"/);
  assert.match(styles, /\.is-rexonance-pickup/);
  assert.match(styles, /\.is-rexonance-dialog/);
  assert.match(styles, /\.rexonance-weapon-grid/);
  assert.match(styles, /@keyframes rexonanceStarConverge/);
  assert.match(styles, /@keyframes rexonancePrismConverge/);
  assert.match(styles, /@keyframes rexonanceHorizonCyan/);
  assert.match(styles, /@keyframes rexonancePortraitFloat/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Rexonance pickup title keeps the requested two-line Japanese break and remains responsive", () => {
  for (const source of [pickup, reconstructedPickup]) {
    assert.match(
      source,
      /isRexonance \? \([\s\S]*?<span>\{riderPrefix\}<\/span>[\s\S]*?<b>\{rider\.name\}<\/b>/,
    );
  }
  assert.match(styles, /\.is-rexonance-dialog \.form-pickup-heading h2 span,[\s\S]*?display: block/);
  assert.match(styles, /\.is-rexonance-dialog \.form-pickup-heading h2 b \{[\s\S]*?white-space: normal[\s\S]*?overflow-wrap: anywhere/);
  assert.match(styles, /\.is-rexonance-pickup \.form-pickup-copy h2 b \{[\s\S]*?white-space: normal[\s\S]*?overflow-wrap: anywhere/);
});

test("generated and reconstructable source retain the Rexonance feature markers", () => {
  for (const source of [reconstructedRider, reconstructedPickup]) {
    assert.match(source, /rexonance/i);
  }
  assert.match(reconstructedRider, /rider-rexonance-saga-pickup\.jpeg/);
  assert.match(reconstructedPickup, /rexonance-gate-spiral is-cyan/);
});
