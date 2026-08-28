import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = read("src/components/rexonance-saga/rexonance-saga.tsx");
const route = read("src/routes/rexonance-saga.tsx");
const menu = read("src/components/world/world-chrome.tsx");
const styles = read("src/styles-rexonance-saga.css");
const liquidStyles = read("src/styles-world/12.css");
const transitions = read("src/styles-route-transitions.css");
const loadGate = read("src/components/load-gate.tsx");
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
  for (const stage of ["レクソナンス", "マックス", "ウルトラ", "単一実在収束", "60秒間"]) {
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
  assert.match(styles, /translate: 50% calc\(18px \+ var\(--rxs-hero-progress\) \* 5%\)/);
  assert.match(styles, /bottom: -18%/);
});

test("Rexonance performance comparison uses a native iOS selector for three prior forms", () => {
  assert.match(component, /type PerformanceBaseline = "vertex" \| "vinculum" \| "extreme"/);
  assert.match(component, /aria-label="レクソナンスの比較対象"/);
  assert.match(component, /<option value="vertex">ヴァーテックスサーガ<\/option>/);
  assert.match(component, /<option value="vinculum">ヴィンクルムサーガ<\/option>/);
  assert.match(component, /<option value="extreme">エクスプリームサーガ<\/option>/);
  assert.match(component, /activePerformanceBaseline\.metrics\.map/);
  assert.match(component, /aria-live="polite"/);
  for (const value of [
    "68.0t",
    "172.4t",
    "100.0m",
    "0.6秒",
    "98.8t（est.）",
    "198.8t（est.）",
    "5000.0m（est.）",
    "0.1秒（est.）",
    "205.6t〜",
    "308.9t〜",
    "1033.5m",
    "0.002秒",
  ]) {
    assert.match(component, new RegExp(value.replace(".", "\\.")));
  }
  assert.match(styles, /\.rxs-comparison-selector select/);
  assert.match(styles, /-webkit-appearance: auto/);
  assert.match(styles, /appearance: auto/);
  assert.match(styles, /color-scheme: dark/);
  assert.match(styles, /min-height: 56px/);
});

test("Vertex and Vinculum comparisons keep supplied processors and compare only like units", () => {
  for (const value of [
    "50,000〜TOPS / 200Core",
    "URANUS X",
    "TAMAYURA X（アクセラレータ）",
    "P1",
    "10,000YOPS / 500Core · KHAOS",
    "300TOPS / 300Core · KOSMOS",
    "P2",
    "Paranormal Realizer Pro",
    "Neural Resonancer Pro",
    "50,000YOPS / ∞Core · KHAOS DeuX",
    "9,000TOPS / 300Core · KOSMOS DeuX",
    "P14",
  ]) {
    assert.match(component, new RegExp(value.replaceAll(".", "\\.")));
  }
  assert.match(component, /KHAOS系YOPSが5\.0倍、KOSMOS系TOPSが30\.0倍/);
  assert.match(component, /単純換算は行わず/);
  assert.match(component, /activePerformanceBaseline\.processing\.baseline\.map/);
  assert.match(component, /activePerformanceBaseline\.processing\.rexonance\.map/);
  assert.match(styles, /\.rxs-processing-comparison/);
});

test("catalog comparison separates baseline ratio, multiplier, and increase", () => {
  for (const value of [
    "488.5%",
    "4.89倍",
    "+388.5%",
    "278.7%",
    "2.79倍",
    "6000%",
    "60.0倍",
    "285,714.3%",
    "約2857.14倍",
    "336.2%",
    "3.36倍",
    "120.0%",
    "1.20倍",
    "47,619.0%",
    "約476.19倍",
    "161.6%",
    "580.6%",
    "952.4%",
    "9.52倍",
  ]) {
    assert.ok(component.includes(value), `${value} should be shown`);
  }
  assert.match(component, /比較基準：/);
  assert.match(component, /activePerformanceBaseline\.label}＝100%/);
  assert.match(component, /metric\.relative/);
  assert.match(component, /metric\.multiplier/);
  assert.match(component, /metric\.delta/);
  assert.match(component, /100m所要時間の逆数から速度性能を換算/);
  assert.match(component, /所要時間 約99\.97%短縮/);
  assert.match(component, /所要時間 99\.79%短縮/);
});

test("P14 comparison preserves every value and uses native iOS selection with a range fallback", () => {
  for (const value of [
    "100%",
    "180%",
    "900%",
    "10%",
    "18%",
    "90%",
    "35%",
    "25%",
    "3%",
    "2%",
    "20%",
    "14%",
    "約35%",
    "約18%",
    "約4%",
    "約1.0ms",
    "約0.45ms",
    "約0.06ms",
    "62%",
    "81%",
    "99.4%",
    "58%",
    "79%",
    "96%",
  ]) {
    assert.match(component, new RegExp(value.replace(".", "\\.")));
  }
  assert.match(component, /type="range"/);
  assert.match(component, /aria-valuetext=/);
  assert.match(component, /onInput=/);
  assert.match(component, /valueAsNumber/);
  assert.match(component, /onPointerUp=/);
  assert.match(component, /rxs-p14-ios-slider/);
  assert.match(component, /iPad\|iPhone\|iPod/);
  assert.match(component, /navigator\.maxTouchPoints > 1/);
  assert.match(component, /<select/);
  assert.match(component, /<option value="p1">P1比（P1＝100%）<\/option>/);
  assert.match(component, /<option value="p2">P2比（P2＝100%）<\/option>/);
  assert.match(component, /currentTarget\.value as P14Baseline/);
  assert.match(component, /iOS標準選択/);
  assert.match(component, /aria-pressed=/);
  assert.match(component, /setP14Baseline/);
  assert.match(component, /<b>100%<\/b>/);
  assert.match(component, /metric\.relative\[p14Baseline\]/);
  assert.match(component, /6\.5倍 \/ \+550%/);
  for (const normalizedP2Value of [
    "650%",
    "12.0%",
    "11.1%",
    "14.3%",
    "約22.2%",
    "約13.3%",
    "122.7%",
    "121.5%",
  ]) {
    assert.match(component, new RegExp(normalizedP2Value.replace(".", "\\.")));
  }
  assert.match(styles, /\.rxs-p14-ios-track/);
  assert.match(styles, /\.rxs-p14-ios-thumb/);
  assert.match(styles, /data-value="p2"/);
  assert.match(styles, /\.rxs-p14-native-select select/);
  assert.match(styles, /-webkit-appearance: auto/);
  assert.match(styles, /appearance: auto/);
  assert.match(styles, /color-scheme: dark/);
  assert.match(styles, /min-height: 70px/);
  assert.match(styles, /width: 46px/);
  assert.match(styles, /height: 46px/);
  assert.match(styles, /background: #0a84ff/);
  const p14Asset = new URL("../public/rexonance-p14-core.jpg", import.meta.url);
  assert.equal(existsSync(p14Asset), true);
  assert.ok(statSync(p14Asset).size < 700_000, "P14 artwork should stay below 700 KB");
});

test("Rexonance navigation uses its dedicated cyan-pink route dive", () => {
  assert.match(loadGate, /"\/rexonance-saga": "rexonance"/);
  assert.match(loadGate, /rexonance:\s*\{ cover: 560, reveal: 520 \}/);
  assert.match(loadGate, /REXONANCE \/\/ PERFORMANCE SITE/);
  assert.match(loadGate, /P14共鳴位相へダイブ中/);
  assert.match(transitions, /\.load-gate\.rider-route-dive\.is-rexonance-dive/);
  assert.match(transitions, /--rider-dive-primary: 88 230 255/);
  assert.match(transitions, /--rider-dive-secondary: 255 105 220/);
});

test("Rexonance stage switching uses one animated Liquid Glass selector", () => {
  assert.match(component, /label: "レクソナンス"/);
  assert.match(component, /import \{ LiquidLens \}/);
  assert.match(component, /import \{ initRail \}/);
  assert.match(component, /data-liquid-glass="true"/);
  assert.match(component, /data-stage=\{stage\}/);
  assert.match(component, /className="rxs-stage-tabs liquid-swipe-tabs"/);
  assert.match(component, /<LiquidLens \/>/);
  assert.match(component, /rail\.addEventListener\("railselect", onSelect\)/);
  assert.match(component, /const dispose = initRail\(rail\)/);
  assert.match(component, /--liquid-accent/);
  assert.doesNotMatch(component, /rxs-stage-liquid-indicator/);
  assert.match(styles, /-webkit-backdrop-filter: blur\(26px\) saturate\(165%\)/);
  assert.match(styles, /backdrop-filter: blur\(30px\) saturate\(185%\)/);
  assert.match(styles, /data-liquid-held="true"/);
  assert.match(styles, /data-liquid-dragging="true"/);
  assert.match(component, /タップ、長押し、または左右へのスライドで切り替え/);
  assert.match(liquidStyles, /-webkit-touch-callout: none/);
  assert.match(liquidStyles, /touch-action: pan-y/);
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
