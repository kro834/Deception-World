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
    /calls: \["RIDE IN！", "SPECIAL！", "ROLLOUT！", "Astra Barn！", "VANDAL！"\]/,
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
  assert.match(profile, /他の六詠の4人からも最大級の脅威/);
  assert.match(profile, /ヴァンダールドライバーの仮想リベレーターを操作して発動/);
  assert.doesNotMatch(profile, /NONE SHALL TRANSCEND IT|他の五人|右側面を殴り付け/);
});

test("Rex Loi retains all six exact quotes and its original portrait and form images", () => {
  const profile = manager.slice(manager.indexOf("export const REX_LOI"), manager.indexOf("export const SHUZA"));
  const quotes = profile.match(/quotes: \[([\s\S]*?)\]/)[1];
  assert.deepEqual([...quotes.matchAll(/"([^"]+)"/g)].map((match) => match[1]), [
    "世界は、今日も選択を許されて居ます",
    "生者には生を。死者には静寂を",
    "力有る者には責任を",
    "私の力が、私の欲によって振るわれぬ様に",
    "今日も又、道を閉ざす物だけを壊しましょう",
    "我々と皆様の、秩序の為に",
  ]);
  assert.match(profile, /image: "\/manager-rex-loi\.jpeg"/);
  assert.match(profile, /imageWebp: "\/manager-rex-loi\.webp"/);
  assert.match(profile, /img: "\/rider-vandal-20260826\.jpeg"/);
});

test("Distribution is a standalone sixth section with source mechanisms and limits", () => {
  const profile = manager.slice(manager.indexOf("export const REX_LOI"), manager.indexOf("export const SHUZA"));
  const sections = profile.slice(profile.indexOf("sections: ["), profile.indexOf("  rider: {"));
  assert.deepEqual([...sections.matchAll(/no: "(\d+)"/g)].map((match) => match[1]), ["01", "02", "03", "04", "05", "06"]);
  const distribution = sections.slice(sections.indexOf('no: "06"'));
  assert.match(distribution, /kicker: "神性による能力"/);
  assert.match(distribution, /title: "分配"/);
  const paragraphs = [...distribution.matchAll(/^ {8}"([^"]+)",$/gm)].map((match) => match[1]);
  assert.equal(paragraphs.length, 6);
  for (const paragraph of paragraphs) assert.ok(paragraph.length >= 100);
  for (const mechanism of [
    "生身で行使", "管理権限が届く範囲", "追跡", "体内にある空気", "内部を循環する力",
    "複数の対象", "一点へ集中", "後の反撃", "力の総量は増えず", "元の攻撃が持つ力の範囲",
    "防護や神体の性質を無条件に無視できるわけではなく", "突破に足る神性と管理権限",
    "反管理権限", "最高位の管理主権", "優勢である間", "巻き添えを抑える",
    "呼吸を必要としない", "その対象だけを安全に処理できるとは限らない",
    "戦闘能力だけを奪って命を残す", "レックス自身の判断",
  ]) assert.ok(distribution.includes(mechanism), mechanism);
  assert.doesNotMatch(distribution, /無条件に貫通|無限に(?:増幅|蓄積)|必ず(?:突破|分離)|あらゆる防御を無視/);
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
