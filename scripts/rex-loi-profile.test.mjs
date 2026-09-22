import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const manager = readSource("../src/components/world/manager-stub.tsx");
const riders = readSource("../src/components/world/rider-page.tsx");

test("Rex Loi profile keeps the requested identity, authority, and core facts", () => {
  const profile = manager.slice(
    manager.indexOf("export const REX_LOI"),
    manager.indexOf("export const SHUZA"),
  );
  assert.match(profile, /id: "rex-loi"/);
  assert.match(profile, /name: "レックス・ロワ"/);
  assert.match(profile, /title: "秩序の大口と裁定者の仮面"/);
  assert.match(profile, /numeral: "II"/);
  assert.match(profile, /RANK", dd: "六詠・第二位"/);
  assert.match(profile, /DIVINITY", dd: "秩序の神"/);
  assert.match(profile, /AUTHORITY", dd: "秩序／破壊・固定管轄なし"/);
  assert.match(profile, /RIDER", dd: "仮面ライダーヴァンダール"/);
  assert.match(profile, /STATUS", dd: "ACCESS GRANTED"/);
  for (const value of [
    "185.0cm",
    "80.1kg",
    "両性具有（性自認は女性。本人に強い自覚はない）",
    "六詠唯一の完全なる良心",
    "自分を裁定する上位者を持たない",
    "光にも裁定が、闇にも庇護が存在する",
  ])
    assert.ok(profile.includes(value), value);
});

test("Rex Loi Vandal transformation preserves calls, numerical specs, and abilities", () => {
  const profile = manager.slice(
    manager.indexOf("export const REX_LOI"),
    manager.indexOf("export const SHUZA"),
  );
  assert.match(profile, /system: "ヴァンダールドライバー × スペシャルコア"/);
  assert.match(
    profile,
    /calls: \["RIDE IN!", "SPECIAL!", "ROLLOUT!", "NONE SHALL TRANSCEND IT!", "VANDAL!"\]/,
  );
  for (const value of ["203.6cm", "113.2kg", "262.9t", "372.2t", "5000m", "0.01sec"]) {
    assert.ok(profile.includes(`dd: "${value}"`), value);
  }
  assert.match(profile, /name: "SCANNING"/);
  assert.match(profile, /name: "SPECIAL"/);
  assert.match(profile, /name: "サーパスアタノール"/);
  assert.match(profile, /name: "デアグローブ"/);
  assert.match(profile, /name: "デアブーツ"/);
  assert.match(profile, /name: "デッドエンド"/);
  assert.match(profile, /『DEAD END！』/);
});

test("Vandal reuses REX_LOI data and the requested CV records remain intact", () => {
  const vandal = riders.slice(riders.indexOf('id: "vandal"'), riders.indexOf('id: "leddic"'));
  assert.match(riders, /import \{ FormPickup, REX_LOI \} from "\.\/manager-stub"/);
  for (const field of ["quotes", "facts", "sections"])
    assert.match(vandal, new RegExp(`${field}: REX_LOI\\.${field}`));
  assert.match(vandal, /forms: REX_LOI\.rider \? \[REX_LOI\.rider\] : \[\]/);
  const lore = riders.slice(riders.indexOf('id: "lore"'), riders.indexOf('id: "vandal"'));
  assert.match(lore, /CV", dd: "小林千晃"/);
  assert.match(lore, /cv: "小林千晃"/);
  const cipher = riders.slice(riders.indexOf('id: "cipher"'));
  assert.match(cipher, /CV", dd: "内山昂輝"/);
  assert.match(cipher, /cv: "内山昂輝"/);
});
