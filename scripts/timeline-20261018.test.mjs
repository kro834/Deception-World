import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DREAM_CASES } from "../src/components/dream-chapter/dream-chapter-data.ts";
import { DREAM_CHRONICLE } from "../src/components/dream-chapter/dream-chapter-extra-data.ts";
import { WORLD_EPISODE_NOTES } from "../src/components/world/world-annex-data.ts";

test("October 18 story distinguishes designs, hypotheses and unfinished battles", () => {
  const world = WORLD_EPISODE_NOTES[2].synopsis.join("");
  assert.match(world, /ドライバーも取り上げられる/);
  assert.match(world, /サーガの世界にCODEは存在しない/);
  assert.match(world, /第十一世代のエクスサーガドライバー/);
  assert.match(world, /開発中の設計/);
  assert.match(world, /ブランチプライム.*可能性が高いと推測/);
  assert.match(world, /なお十七時間/);
  assert.match(world, /扉から戻った悠真/);
  const dream = DREAM_CASES[5].paragraphs.slice(8).join("");
  for (const place of ["永遠亭", "人里", "博麗神社", "魔法の森", "妖怪の山", "紅魔館", "命蓮寺", "太陽の畑"])
    assert.ok(dream.includes(place), place);
  assert.match(dream, /シエル、慶弥、夕夏を伴って/);
  assert.match(dream, /全員の帰還も、まだ描かれていない/);
  assert.doesNotMatch(dream, /奪還に成功|全員が帰還|十二神将を全滅/);
  assert.deepEqual(DREAM_CHRONICLE.slice(49).map(({ no, sourceRevision }) => [no, sourceRevision]),
    [50, 51, 52, 53].map((no) => [no, "2026-10-18"]));
});

test("new archive excerpts match October 18 attachment exactly", { skip: !process.env.DREAM_OCT18_SOURCE }, () => {
  const lines = readFileSync(process.env.DREAM_OCT18_SOURCE, "utf8").split(/\r?\n/);
  for (const event of DREAM_CHRONICLE.slice(49)) {
    const text = event.text ?? event.segments.map(({ text }) => text).join("");
    assert.equal(text, lines[Number(event.lines) - 1].trim(), `event ${event.no}`);
    assert.ok(lines[Number(event.title.lines) - 1].includes(event.title.text));
  }
});

test("off-route preparation retains arrival hero but removes alternate-form downloads", () => {
  const source = readFileSync(new URL("../src/lib/rexonance-suit-warmup.ts", import.meta.url), "utf8");
  const pageWarmup = source.slice(source.indexOf("export function scheduleRexonancePagePreload"));
  assert.match(pageWarmup, /REXONANCE_SITE_ARTWORK.standard/);
  assert.doesNotMatch(pageWarmup, /REXONANCE_SITE_ARTWORK\.(max|ultra)/);
  const page = readFileSync(new URL("../src/components/rexonance-saga/rexonance-saga.tsx", import.meta.url), "utf8");
  assert.match(page, /warmRexonanceStages\(rail, \[STAGES.max.image, STAGES.ultra.image\]\)/);
});
