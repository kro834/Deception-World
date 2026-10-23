// Owner rule: 「YOPSはエクスプリームは「〜」はつかず、レクソナンスとメタ・ウニタス、
// イリュージョンクルム、ファーフロムにのみつきます。」
// The main-compute YOPS carries 「〜」 only for レクソナンス (50000〜YOPS),
// メタ・ウニタス, イリュージョンクルム and ファーフロム (60000〜YOPS). Extreme
// (20000YOPS), Vinculum (10000YOPS) and every other form carry none. The Far From
// Ultra HUD prints "60000+ YOPS" (its font lacks 〜; 「+」 is the lower-bound mark).
// メタ・ウニタス / イリュージョンクルム have no spec data in the repo yet; when
// they gain one, add its figure to WITH_WAVE.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|js|mjs|html)$/.test(name)) out.push(path);
  }
  return out;
}

const files = [
  ...walk(join(root, "src")),
  ...readdirSync(join(root, "public"))
    .filter((n) => /\.(js|html)$/.test(n))
    .map((n) => join(root, "public", n)),
  ...readdirSync(join(root, "archives"))
    .filter((n) => n.endsWith(".html"))
    .map((n) => join(root, "archives", n)),
];

// "50,000〜YOPS", "60000〜 YOPS", "60000+ YOPS", "20,000YOPS", "50,000YOPS〜"
const VALUE = /(\d[\d,]*)\s?([〜~]|\+)?\s?YOPS(〜)?/g;

const found = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(VALUE)) {
    found.push({
      file: relative(root, file),
      value: Number(m[1].replace(/,/g, "")),
      before: m[2] ?? "",
      after: m[3] ?? "",
      raw: m[0],
    });
  }
}

const WITH_WAVE = new Set([50000, 60000]); // レクソナンス, ファーフロム
const WITHOUT_WAVE = new Set([10000, 20000]); // ヴィンクルム, エクスプリーム

test("the scan sees the known YOPS values", () => {
  assert.ok(found.length >= 20, `found ${found.length}`);
  for (const value of [10000, 20000, 50000, 60000]) {
    assert.ok(
      found.some((f) => f.value === value),
      `${value}YOPS appears`,
    );
  }
});

test("レクソナンス 50000 and ファーフロム 60000 carry 〜 before YOPS", () => {
  for (const f of found.filter((x) => WITH_WAVE.has(x.value))) {
    assert.equal(f.after, "", `${f.file}: 〜 after YOPS in ${f.raw}`);
    // The Far From Ultra HUD font lacks 〜, so it keeps 「+」 as the lower-bound mark.
    const hud = f.file.endsWith("far-from-ultra-art.ts") && f.before === "+";
    assert.ok(f.before === "〜" || hud, `${f.file}: ${f.raw} lacks 〜`);
  }
});

test("エクスプリーム 20000 and ヴィンクルム 10000 never carry 〜", () => {
  for (const f of found.filter((x) => WITHOUT_WAVE.has(x.value))) {
    assert.equal(f.before + f.after, "", `${f.file}: ${f.raw} must not carry 〜`);
  }
});

test("no other YOPS figure carries 〜 (only the four lower-bound forms do)", () => {
  for (const f of found.filter((x) => !WITH_WAVE.has(x.value))) {
    assert.ok(f.before !== "〜" && f.before !== "~" && f.after === "", `${f.file}: ${f.raw}`);
  }
});

test("known locations are pinned", () => {
  const read = (p) => readFileSync(join(root, p), "utf8");
  const official = read("src/components/far-from-saga/far-from-p16-official-text.ts");
  assert.match(official, /エクスプリーム\\t20,000YOPS\\t/);
  assert.match(official, /レクソナンス\\t50,000〜YOPS\\t/);
  assert.match(official, /ファーフロム\\t60,000〜YOPS\\t/);
  const report = read("src/components/far-from-saga/far-from-report-text.ts");
  assert.match(report, /10000YOPS\n20000YOPS\n50000〜YOPS\n60000〜YOPS/);
  const finalStage = read("src/components/final-stage/final-stage-data.ts");
  assert.match(finalStage, /60000〜YOPS／∞Core『KHAOS DeuX』/);
  assert.match(finalStage, /20000YOPS\/200Core/);
  assert.match(read("src/components/extreme-saga/extreme-saga.tsx"), /20,000YOPS \/ ∞Core/);
  assert.match(read("src/lib/far-from-ultra-art.ts"), /"60000\+ YOPS"/);
});
