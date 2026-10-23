import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { VARG_FACTS, VARG_SECTIONS } from "../src/components/world/varg-data.ts";
import {
  DANTE_FACTS,
  DANTE_FORMS,
  DANTE_SECTIONS,
  UNMANAGED_NAV,
} from "../src/components/world/dante-data.ts";
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
  assert.deepEqual(
    VARG_SECTIONS.filter((s) => s.kicker.startsWith("固有能力")).map((s) => s.title),
    ["原圧", "界外実体", "重勢", "不退", "深紅冠", "重相復元", "存在捕食", "認知追跡"],
  );
  const body = VARG_SECTIONS.flatMap((x) => x.body).join("\n");
  for (const text of [
    "ヒトになりたかったのか、そうか、そうかそれは良かったな",
    "あらゆる防御や回避を自動的に無効化するわけではない",
    "支持能力が低下する可能性は残されている",
    "過去の状態へ時間を巻き戻すものではなく",
    "戦況によっては集団全体を制圧できる",
  ])
    assert.ok(body.includes(text), text);
});

test("Dogs category has a second individual link without relabeling related people as Dogs", () => {
  const home = read("src/components/world/world-home.tsx");
  assert.match(home, /<b>犬<\/b>/);
  assert.match(home, /<b>その他<\/b>/);
  // Owner (2026-10-23): 不要なセカンダリラベルを削除（レイアウトで説明） — the tab reads 犬 alone
  // (no DOGS / 04 code), the card no SECOND DOG / 02.
  assert.match(home, /id="manager-tab-3"[\s\S]*?<b>犬<\/b>/);
  assert.doesNotMatch(home, /DOGS \/ 04/);
  assert.match(home, /locationHash !== "manager-archive-dogs"[\s\S]*?setManagerTab\(3\)/);
  assert.doesNotMatch(home, /SECOND DOG \/ 02/);
  assert.match(home, /hash="character-section-04"/);
  assert.match(home, /aria-label="関連人物"/);
  const page = read("src/components/world/dante-page.tsx");
  assert.match(page, /aria-label="宿主・ダンテの人物録"/);
  assert.match(page, /aria-label="ヴァルグの人物録"/);
  assert.equal(page.match(/returnHash="manager-archive-dogs"/g).length, 2);
  for (const path of [
    "src/components/search/search-data.ts",
    "src/lib/library-data.ts",
    "src/components/world/world-chrome.tsx",
    "src/routes/characters/dante.tsx",
  ])
    assert.ok(read(path).includes("ダンテ／ヴァルグ"), path);
});

test("supplied Varg artwork is distinct from the host, responsive and not cropped", () => {
  for (const suffix of ["-360", "-720", "", "-original"]) {
    const bytes = readFileSync(
      new URL(`../public/character-varg-20261021${suffix}.webp`, import.meta.url),
    );
    assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
    if (suffix !== "-original") assert.ok(bytes.length < 400_000);
  }
  const home = read("src/components/world/world-home.tsx");
  const page = read("src/components/world/dante-page.tsx");
  assert.match(home, /alt="第二の犬・ヴァルグの本来形態"/);
  assert.match(home, /src="\/character-dante-thumb.webp"/);
  assert.match(page, /src="\/character-dante.webp"/);
  assert.match(
    page,
    /character-varg-20261021-360.webp 360w, \/character-varg-20261021-720.webp 720w, \/character-varg-20261021.webp 1088w/,
  );
  assert.match(page, /href="\/character-varg-20261021-original.webp"/);
  assert.match(
    read("src/styles-dante.css"),
    /\.varg-portrait img[\s\S]*?height: auto;\s*object-fit: contain;/,
  );
});
