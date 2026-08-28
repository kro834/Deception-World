import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = read("src/components/extreme-saga/extreme-saga.tsx");
const route = read("src/routes/extreme-saga.tsx");
const menu = read("src/components/world/world-chrome.tsx");
const styles = read("src/styles-extreme-saga.css");
const transitions = read("src/styles-route-transitions.css");
const loadGate = read("src/components/load-gate.tsx");
const loader = read("src/lib/asset-loader.ts");

test("Extreme special site has a route, menu entry, warmup asset, and dedicated transition", () => {
  assert.match(route, /createFileRoute\("\/extreme-saga"\)/);
  assert.match(menu, /<span>エクスプリームサーガ<\/span>/);
  assert.match(menu, /EXTREME_SAGA_ENTER_ASSETS/);
  assert.match(component, /<SideMenuLayer context="extreme"/);
  assert.match(loader, /export const EXTREME_SAGA_ENTER_ASSETS/);
  assert.match(loadGate, /"\/extreme-saga": "extreme"/);
  assert.match(transitions, /\.is-extreme-dive/);
});

test("Extreme hero preserves the requested catchphrase and responsive visual treatment", () => {
  assert.match(component, /至高、/);
  assert.match(component, /極まれり/);
  assert.match(component, /THE SUPREME ARRIVAL OF SA-GA/);
  assert.match(styles, /\.exs-page \.rxs-hero-visual/);
  assert.match(styles, /orientation: portrait/);
  assert.match(styles, /orientation: landscape/);
  assert.match(styles, /object-position: 50% 0/);
});

test("Extreme comparison keeps supplied Diluculum catalog values", () => {
  for (const value of [
    "120.8t（est.）",
    "178.8t（est.）",
    "50000Kt（est.）",
    "151.0m（est.）",
    "0.4秒（est.）",
    "マッハ88（est.）",
    "3,000TOPS / 200Core · URANUS X",
    "TAMAYURA X（アクセラレータ）",
    "60,000TOPS / 300Core · URANUS Z Extreme",
    "TAMAYURA Z Extreme（アクセラレータ）",
    "Paranormal Realizer",
  ]) {
    assert.ok(component.includes(value), `${value} should be present`);
  }
});

test("Extreme comparison preserves Vinculum values and calculated physical ratios", () => {
  for (const value of [
    "98.8t（est.）",
    "198.8t（est.）",
    "5000.0m（est.）",
    "0.1秒（est.）",
    "10,000YOPS / 500Core · KHAOS",
    "300TOPS / 300Core · KOSMOS",
    "P2",
    "Paranormal Realizer Pro",
    "Neural Resonancer Pro",
    "170.2%",
    "172.8%",
    "684.4%",
    "20,000%",
    "208.1%",
    "155.4%",
    "20.7%",
    "5,000%",
  ]) {
    assert.ok(component.includes(value), `${value} should be present`);
  }
  assert.match(component, /YOPSとTOPS、異なる演算系統/);
  assert.match(component, /公開値不詳の項目は一つの倍率へ合算していません/);
});

test("Extreme P14 is distinct from the later Rexonance tuning without invented rates", () => {
  assert.match(component, /レクソナンス用P14よりややスペックダウン/);
  assert.match(component, /正確な低下率は未公表/);
  assert.match(component, /推測値では補いません/);
  assert.match(component, /20,000YOPS/);
  assert.match(component, /5,000TOPS/);
});

test("Extreme stage rail supports liquid long-press and swipe selection", () => {
  assert.match(component, /className="rxs-stage-tabs liquid-swipe-tabs exs-stage-tabs"/);
  assert.match(component, /initRail\(rail\)/);
  assert.match(component, /railselect/);
  assert.match(component, /タップ、長押し、または左右へのスライドで切り替え/);
  assert.match(styles, /grid-template-columns: repeat\(2, 1fr\)/);
});

test("special-site parallax only updates meaningful visible frames", () => {
  for (const source of [component, read("src/components/rexonance-saga/rexonance-saga.tsx")]) {
    assert.match(source, /window\.visualViewport\?\.height/);
    assert.match(source, /Math\.abs\(progress - lastProgress\) < 0\.002/);
    assert.match(source, /document\.visibilityState === "visible"/);
    assert.match(source, /visibilitychange/);
  }
});
