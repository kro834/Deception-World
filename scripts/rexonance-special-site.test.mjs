import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = read("src/components/rexonance-saga/rexonance-saga.tsx");
const route = read("src/routes/rexonance-saga.tsx");
const menu = read("src/components/world/world-chrome.tsx");
const styles = read("src/styles-rexonance-saga.css");
const loader = read("src/lib/asset-loader.ts");

test("Rexonance special site is reachable from every shared side menu", () => {
  assert.match(route, /createFileRoute\("\/rexonance-saga"\)/);
  assert.match(menu, /<span>レクソナンスサーガ<\/span>/);
  assert.match(menu, /REXONANCE_SAGA_ENTER_ASSETS/);
  assert.match(menu, /context\?: "world" \| "archive" \| "movie" \| "rexonance"/);
  assert.match(component, /<SideMenuLayer context="rexonance"/);
  assert.match(loader, /export const REXONANCE_SAGA_ENTER_ASSETS/);
});

test("Rexonance special site preserves published performance and stage definitions", () => {
  for (const value of ["332.2t", "480.5t", "6000m", "0.00021秒", "650", "900"]) {
    assert.match(component, new RegExp(value.replace(".", "\\.")));
  }
  for (const stage of ["スタンダード", "マックス", "ウルトラ", "単一実在収束", "60秒間"]) {
    assert.match(component, new RegExp(stage));
  }
  assert.match(component, /標準運用値/);
  assert.match(component, /最大出力ではなく/);
});

test("Rexonance hero keeps the requested catchphrase and readable contrast treatment", () => {
  assert.match(component, /限りなく、/);
  assert.match(component, /限りない/);
  assert.match(component, /史上最強のサーガ/);
  assert.doesNotMatch(component, /無限の攻撃へ。/);
  assert.match(styles, /\.rxs-hero-copy::before/);
  assert.match(styles, /text-shadow:\s*0 3px 22px #000/);
});

test("Rexonance page ships local optimized artwork and responsive motion fallbacks", () => {
  for (const asset of [
    "public/rider-rexonance-saga-pickup.jpeg",
    "public/rider-rexonance-max.webp",
    "public/rider-rexonance-ultra.webp",
  ]) {
    const url = new URL(`../${asset}`, import.meta.url);
    assert.equal(existsSync(url), true, `${asset} should exist`);
    assert.ok(statSync(url).size < 1_200_000, `${asset} should stay below 1.2 MB`);
  }
  assert.match(component, /fetchPriority="high"/);
  assert.match(component, /loading=\{stage === "standard" \? "eager" : "lazy"\}/);
  assert.match(styles, /@media \(max-width: 680px\)/);
  assert.match(styles, /@media \(min-width: 681px\) and \(max-width: 1024px\)/);
  assert.match(styles, /@media \(max-width: 360px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /env\(safe-area-inset-top/);
  assert.match(styles, /env\(safe-area-inset-bottom/);
  assert.match(styles, /-apple-system, BlinkMacSystemFont/);
  assert.match(styles, /"Hiragino Sans"/);
  assert.match(styles, /font-feature-settings: "palt" 1/);
  assert.match(styles, /text-wrap: balance/);
});
