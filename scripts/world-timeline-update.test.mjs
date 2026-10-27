import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { WORLD_EPISODE_NOTES } from "../src/components/world/world-annex-data.ts";

// Physical line ranges in the owner's 2026-10-12 LINE export. They identify
// story evidence without placing the private conversation in this repository.
const sourceEvidence = [
  { range: [5072, 5072], excerpt: "𝐸𝑃𝟹「𝙳𝙴𝙲𝙴𝙿𝚃𝙸𝙾𝙽 𝚆𝙾𝚁𝙻𝙳」" },
  { range: [7635, 7665], excerpt: "何故、助けた" },
  { range: [7691, 7727], excerpt: "反管理権限" },
  { range: [7823, 7833], excerpt: "深層心理" },
  { range: [7835, 7855], excerpt: "取り戻したんやろ？ 記憶" },
  { range: [7929, 7953], excerpt: "サーガは無罪" },
  { range: [7983, 8031], excerpt: "ガシャコンエッジを吹き飛ばす" },
  { range: [8032, 8184], excerpt: "観測主体、不明" },
  { range: [8185, 8290], excerpt: "“犬”" },
  { range: [8291, 8447], excerpt: "イサク" },
  { range: [8508, 8562], excerpt: "君には、罪が無いのですよ" },
  { range: [8630, 8722], excerpt: "イサクは、未だ生きていた" },
];

test("episode 03 advances within its recorded chapter and keeps discoveries unresolved", () => {
  assert.deepEqual(
    WORLD_EPISODE_NOTES.map(({ no, title }) => `${no} ${title}`),
    ["01 HIDE-AND-SEEK", "02 LEGENDS", "03 DECEPTION WORLD", "04 癒えぬ傷を負った者共"],
  );
  const episode = WORLD_EPISODE_NOTES[2];
  assert.equal(episode.synopsis.length, 9);
  assert.match(episode.synopsis[2], /フェイブルが現れ、悠真を扉の奥へ連れていく/);
  assert.match(episode.synopsis[3], /改造に着手/);
  assert.match(episode.synopsis[3], /碧栄壊滅の元凶はアザトでありサーガではないと報告/);
  assert.match(episode.synopsis[3], /北米本部はサーガ討伐の方針を維持/);
  assert.match(episode.synopsis[4], /観測の主体も、重複の意味も分からない/);
  assert.match(episode.synopsis[5], /レックスの思索を通じ/);
  assert.match(episode.synopsis[5], /悠真たちはまだ知らない/);
  assert.doesNotMatch(
    episode.synopsis.join(""),
    /EP4|改造を完成|デュアルエクスを完成|犬を倒した|犬に敗れた|イサクが滅びた|イサクを救った/,
  );
});

test("CODE's original order is labeled historical rather than the current accusation", () => {
  const annex = readFileSync(new URL("../src/components/world/world-annex.tsx", import.meta.url), "utf8");
  assert.match(annex, /派遣時の任務<\/span>\s*<span>\{entry\.mission\.text\}/);
});

const sourcePath = process.env.WORLD_TIMELINE_SOURCE;
test("episode 03 evidence matches physical lines in the private export", { skip: !sourcePath }, () => {
  const lines = readFileSync(sourcePath, "utf8").split(/\r?\n/);
  assert.ok(lines.length >= 8722, "the supplied source is shorter than the reviewed export");
  for (const { range: [first, last], excerpt } of sourceEvidence) {
    const passage = lines.slice(first - 1, last).join("\n");
    assert.ok(passage.includes(excerpt), `${first}-${last}: ${excerpt}`);
  }
  // The 2026-10-27 export renames the room to EP4 at line 10486; episode 03
  // ends on the line before it.
  const ep4 = /トークルーム名を「[^\n]*[EeＥ𝑬𝐸𝙴][PpＰ𝑷𝑃𝙿][4４𝟒𝟺]/u;
  const episodeThree = lines.slice(5072, lines.length >= 10486 ? 10485 : undefined).join("\n");
  assert.doesNotMatch(episodeThree, ep4);
  if (lines.length >= 10486) assert.match(lines[10485], ep4);
});
