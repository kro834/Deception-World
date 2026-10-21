import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { VARG_FACTS, VARG_SECTIONS } from "../src/components/world/varg-data.ts";
import { DANTE_FACTS, DANTE_FORMS, DANTE_SECTIONS, UNMANAGED_NAV } from "../src/components/world/dante-data.ts";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("second Dog is merged with Dante without replacing the host or rider records", () => {
  assert.equal(UNMANAGED_NAV[0].name, "ダンテ／ヴァルグ");
  assert.equal(VARG_FACTS.find((x) => x.dt === "宿主").dd, "ダンテ");
  assert.equal(VARG_FACTS.find((x) => x.dt === "個体識別").dd, "第二の犬");
  assert.equal(VARG_FACTS.find((x) => x.dt === "性別").dd, "不詳");
  assert.equal(DANTE_FACTS.find((x) => x.dt === "性別").dd, "男性");
  assert.equal(DANTE_FORMS.length, 2);
  assert.equal(DANTE_SECTIONS.length, 17);
  assert.equal(new Set(DANTE_SECTIONS.map((x) => x.no)).size, 17);
  assert.deepEqual(DANTE_SECTIONS.slice(3), VARG_SECTIONS);
});

test("Varg preserves all eight abilities, limitations and final combat account", () => {
  assert.deepEqual(VARG_SECTIONS.filter((s) => s.kicker.startsWith("固有能力")).map((s) => s.title),
    ["原圧", "界外実体", "重勢", "不退", "深紅冠", "重相復元", "存在捕食", "認知追跡"]);
  const body = VARG_SECTIONS.flatMap((x) => x.body).join("\n");
  for (const text of ["ヒトになりたかったのか、そうか、そうかそれは良かったな", "あらゆる防御や回避を自動的に無効化するわけではない", "支持能力が低下する可能性は残されている", "過去の状態へ時間を巻き戻すものではなく", "戦況によっては集団全体を制圧できる"])
    assert.ok(body.includes(text), text);
});

test("Dogs category has a second individual link without relabeling related people as Dogs", () => {
  const home = read("src/components/world/world-home.tsx");
  assert.match(home, /<b>犬<\/b>/);
  assert.doesNotMatch(home, /<b>その他<\/b>/);
  assert.match(home, /SECOND DOG \/ 02/);
  assert.match(home, /hash="character-section-04"/);
  assert.match(home, /aria-label="関連人物"/);
  const page = read("src/components/world/dante-page.tsx");
  assert.match(page, /aria-label="宿主・ダンテの人物録"/);
  assert.match(page, /aria-label="ヴァルグの人物録"/);
  assert.equal(page.match(/returnHash="manager-archive-other"/g).length, 2);
  for (const path of ["src/components/search/search-data.ts", "src/lib/library-data.ts", "src/components/world/world-chrome.tsx", "src/routes/characters/dante.tsx"])
    assert.ok(read(path).includes("ダンテ／ヴァルグ"), path);
});
