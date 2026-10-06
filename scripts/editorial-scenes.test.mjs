import assert from "node:assert/strict";
import test from "node:test";
import { WORLD_EPISODE_NOTES } from "../src/components/world/world-annex-data.ts";
import {
  DREAM_CASE_NOTES,
  DREAM_CAST_ROSTER,
  DREAM_CASES,
} from "../src/components/dream-chapter/dream-chapter-data.ts";

// Selected against the owner's 2026-10-06 story attachments. Keep exact
// dialogue and attribution separate from the site's rewritten summaries.
// Only the selected lines are retained here, not the private LINE exports.
test("World episode lines follow reunion, intervention and resistance in source order", () => {
  assert.deepEqual(
    WORLD_EPISODE_NOTES.map(({ lines }) => lines),
    [
      [
        { text: "世界を変える", by: "月城悠真" },
        { text: "掴め、悠真", by: "ベル・アレイン" },
        { text: "我々『六詠』が介入し、秩序を保ちます", by: "レックス・ロワ" },
      ],
      [
        { text: "お帰りなさい、ベル", by: "ルナ・アレイン" },
        { text: "貴方達、運命を捻じ曲げる気ですか", by: "リームー" },
        { text: "這ってでも取れ！", by: "テラ・アレイン" },
      ],
      [
        { text: "レックスはんには悪いけど、あの子らはうちが貰うわ", by: "シュザ" },
        { text: "ならば、次は俺が相手をする", by: "月城悠真" },
        {
          text: "───もっとも、あんたらは私を愛し.......何を“好き”やと思うかさえも、うちが決めさせてもらうけど",
          by: "シュザ",
        },
        { text: "頼む。お前の力が必要なんだ", by: "月城悠真" },
        { text: "生きていて良かった", by: "月城悠真" },
      ],
    ],
  );
});

test("World records expand the three supplied episodes without inventing a resolved ending", () => {
  for (const episode of WORLD_EPISODE_NOTES) {
    assert.equal(episode.synopsis.length, 3, episode.no);
    assert.ok(
      episode.synopsis.every((text) => text.length >= 80),
      episode.no,
    );
  }
  const legends = WORLD_EPISODE_NOTES[1].synopsis.join("");
  assert.match(legends, /テラ.*命を落とす/);
  assert.match(legends, /不適正.*変身不可/);
  const latest = WORLD_EPISODE_NOTES[2].synopsis.join("");
  for (const fact of ["4.2秒", "マキャベルゴアナイトメア", "フェイブル", "シュザがまだ"]) {
    assert.ok(latest.includes(fact), fact);
  }
  assert.doesNotMatch(latest, /シュザを倒した|シュザを討ち取|すべての戦いが終わ/);
});

test("Dream's closing scene quotes Ciel preparing to bring Kaisaku home, not a completed rescue", () => {
  const finalNote = DREAM_CASE_NOTES.find(({ no }) => no === "5");
  assert.equal(finalNote.line, "ああ、怪作を迎えに行こう、準備は出来ている");
  assert.equal(finalNote.by, "シエル");
  const bell = DREAM_CAST_ROSTER.find(({ id }) => id === "bell");
  assert.match(bell.profile.join(""), /幻/);
  assert.doesNotMatch(bell.profile.join(""), /本人が復活|本人の復活/);
  const dawn = DREAM_CASES.find(({ no }) => no === "3").paragraphs.join("");
  assert.match(dawn, /味方まで巻き込み/);
  assert.match(dawn, /自分が壊した境内と仲間の身体を修復/);
  assert.match(dawn, /失われた命を引き戻す/);
  assert.match(dawn, /反動/);
});
