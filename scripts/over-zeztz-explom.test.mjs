import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { dossierImage } from "../src/lib/dossier-images.ts";

test("Over Zeztz preserves Explom's supplied calls, estimated stats and two finishers", () => {
  const source = readFileSync(new URL("../src/components/world/rider-page.tsx", import.meta.url), "utf8");
  const rider = source.slice(source.indexOf('id: "over-zeztz"'), source.indexOf('id: "cipher"'));
  assert.match(source, /rider\.id === "over-zeztz"\s*\? rider\.forms/);
  for (const value of ["フィジカムインパクト", "エクスプロム", "アメイジング！ ライダー！",
    "ゼッツ！ゼッツ！ゼッツ！オーバー！", "エクスプロム！", "205.9cm（est.）",
    "110.0kg（est.）", "50.5m（ひと跳び est.）", "1.0秒（100m est.）",
    "エクスプロムスマッシュ", "エクスプロムオーバースマッシュ",
    "物理攻撃の負荷を増強した筋繊維に溜め込み、放出する事により高い攻撃力を発揮する。この一連の動作が前提となっているため、防御力が大きく向上し、パフォーマンスも改善されている。"])
    assert.ok(rider.includes(value), value);
  assert.equal(rider.split("77.7〜t（est.）").length - 1, 2);
  const image = "/rider-over-zeztz-explom-20261019-v2.jpeg";
  assert.ok(rider.includes(image));
  assert.ok(existsSync(new URL(`../public${image}`, import.meta.url)));
  assert.ok(existsSync(new URL(`../public${dossierImage(image).srcSet}`, import.meta.url)));
});
