import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const worldHome = readFileSync(
  new URL("../src/components/world/world-home.tsx", import.meta.url),
  "utf8",
);

test("World home landmark links expose destination names without changing visible labels", () => {
  for (const [hash, label, visibleLabel] of [
    ["story", "STORY：ストーリーへ移動", "STORY"],
    ["riders", "RIDERS：ライダーへ移動", "RIDERS"],
    ["records", "RECORDS：記録へ移動", "RECORDS"],
  ]) {
    assert.match(
      worldHome,
      new RegExp(`href="#${hash}"[\\s\\S]{0,160}aria-label="${label}"[\\s\\S]{0,160}>\\s*${visibleLabel}\\s*</a>`),
    );
  }
});

test("every manager dossier card has a concise source-faithful accessible name", () => {
  const managerLabels = [
    "六詠I ゼウスの個別資料を開く",
    "六詠II レックス・ロワの個別資料を開く",
    "六詠III シュザの個別資料を開く",
    "六詠IV レジャスの個別資料を開く",
    "六詠V オパスの個別資料を開く",
    "六詠VI リームーの個別資料を開く",
  ];

  for (const label of managerLabels) {
    assert.match(worldHome, new RegExp(`aria-label="${label}"`));
  }
});
