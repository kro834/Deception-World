import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readOptional = (path) => {
  const url = new URL(`../${path}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : null;
};
const publicAsset = (name) => new URL(`../public/${name}`, import.meta.url);

const route = read("src/routes/final-stage.tsx");
const menu = read("src/components/world/world-chrome.tsx");
const transitions = read("src/styles-route-transitions.css");
const loadGate = read("src/components/load-gate.tsx");
const loader = read("src/lib/asset-loader.ts");
const deployment = read("scripts/verify-public-deployment.mjs");
const component = readOptional("src/components/final-stage/final-stage.tsx");
const styles = readOptional("src/styles-final-stage.css");

test("Final Stage special site has a route, menu entry, warmup asset, and dedicated transition", () => {
  assert.match(route, /createFileRoute\("\/final-stage"\)/);
  assert.match(route, /styles-final-stage\.css\?url/);
  assert.match(route, /\{ property: "og:image", content: "\/final-stage-logo\.jpeg" \}/);
  assert.match(menu, /<span>ファイナルステージ<\/span>/);
  assert.match(menu, /FINAL_STAGE_ENTER_ASSETS/);
  assert.match(
    menu,
    /context\?: "world" \| "archive" \| "movie" \| "rexonance" \| "extreme" \| "final-stage";/,
  );
  assert.match(loader, /export const FINAL_STAGE_ENTER_ASSETS/);
  assert.match(loadGate, /"\/final-stage": "final-stage"/);
  assert.match(loadGate, /FINAL STAGE \/\/ STORY SITE/);
  assert.match(loadGate, /最終位相へダイブ中/);
  assert.match(transitions, /\.is-final-stage-dive/);
  assert.match(deployment, /"\/final-stage"/);
});

test("Final Stage is listed under STORIES after Dream Chapter, not under SPECIAL", () => {
  const specialNavigation = menu.slice(
    menu.indexOf("<p>SPECIAL</p>"),
    menu.indexOf("<p>STORIES</p>"),
  );
  assert.equal(specialNavigation.indexOf("<span>ファイナルステージ</span>"), -1);
  const stories = menu.slice(menu.indexOf("<p>STORIES</p>"), menu.indexOf("<p>RIDERS</p>"));
  const dreamPosition = stories.lastIndexOf("<span>映画第一作「ドリームチャプター」</span>");
  const finalStagePosition = stories.indexOf("<span>ファイナルステージ</span>");
  assert.ok(dreamPosition >= 0);
  assert.ok(finalStagePosition > dreamPosition);
  assert.match(stories, /<i>FINAL STAGE<\/i>/);
  assert.match(menu, /\["story", "あらすじ", "STORY"\]/);
  assert.match(menu, /\["characters", "登場人物", "CHARACTERS"\]/);
});

test("Final Stage component wires the shared chrome, section anchors, and hero title", () => {
  assert.ok(component, "src/components/final-stage/final-stage.tsx should exist");
  assert.match(component, /<SideMenuLayer context="final-stage"/);
  assert.match(component, /id="top"/);
  assert.match(component, /className="rxs-page fst-page"/);
  assert.match(component, /aria-labelledby="fst-title"/);
  assert.match(component, /id="story"/);
  assert.match(component, /id="characters"/);
  assert.match(component, /id="far-from-saga"/);
  assert.match(component, /id="realm-royal"/);
  assert.match(component, /fetchPriority="high"/);
  assert.doesNotMatch(component, /import\s+["'][^"']+\.css["']/);
});

test("Final Stage rails support liquid long-press and swipe selection", () => {
  assert.ok(component, "src/components/final-stage/final-stage.tsx should exist");
  assert.match(component, /initRail\(rail\)/);
  assert.match(component, /railselect/);
  assert.match(component, /fst-ffs-stage-tab-/);
  assert.match(component, /fst-rr-form-tab-/);
  assert.match(component, /タップ、長押し、または左右へのスライドで切り替え/);
});

test("Final Stage parallax only updates meaningful visible frames", () => {
  assert.ok(component, "src/components/final-stage/final-stage.tsx should exist");
  assert.match(component, /window\.matchMedia\("\(pointer: coarse\)"\)\.matches/);
  assert.match(component, /window\.visualViewport\?\.height/);
  assert.match(component, /Math\.abs\(progress - lastProgress\) < 0\.002/);
  assert.match(component, /document\.visibilityState === "visible"/);
  assert.match(component, /visibilitychange/);
});

test("Final Stage stylesheet keeps responsive orientation and reduced-motion rules", () => {
  assert.ok(styles, "src/styles-final-stage.css should exist");
  assert.match(styles, /\.fst-page/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /orientation: portrait/);
  assert.match(styles, /orientation: landscape/);
  assert.doesNotMatch(styles, /touch-action:/);
});

test("Final Stage public artwork is present, WebP encoded, and budgeted", () => {
  const artwork = [
    ["rider-far-from-saga-middle.webp", 600_000],
    ["rider-far-from-saga-high.webp", 600_000],
    ["rider-far-from-saga-xhigh.webp", 600_000],
    ["rider-far-from-saga-max.webp", 600_000],
    ["rider-far-from-saga-ultra.webp", 600_000],
    ["rider-realm-royal.webp", 600_000],
    ["rider-realm-royal-02.webp", 600_000],
    ["rider-realm-royal-03.webp", 600_000],
    ["rider-realm-royal-04.webp", 600_000],
    ["final-stage-logo.webp", 400_000],
  ];
  for (const [name, budget] of artwork) {
    const asset = publicAsset(name);
    assert.equal(existsSync(asset), true, `${name} should exist`);
    const header = readFileSync(asset).subarray(0, 12);
    assert.equal(header.toString("latin1", 0, 4), "RIFF", `${name} should be RIFF`);
    assert.equal(header.toString("latin1", 8, 12), "WEBP", `${name} should be WEBP`);
    assert.ok(statSync(asset).size < budget, `${name} should stay below ${budget} bytes`);
  }
  const ogImage = publicAsset("final-stage-logo.jpeg");
  assert.equal(existsSync(ogImage), true, "final-stage-logo.jpeg should exist");
  const jpegHeader = readFileSync(ogImage).subarray(0, 3);
  assert.deepEqual([...jpegHeader], [0xff, 0xd8, 0xff], "final-stage-logo.jpeg should be JPEG");
});
