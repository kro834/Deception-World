import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as extra from "../src/components/dream-chapter/dream-chapter-extra-data.ts";
import * as owner from "../src/components/dream-chapter/dream-chapter-data.ts";

// 2026-10-02 Track D: the Dream Chapter archive data (new information from the owner's story
// source). This pins its shape and its safety rules, not every string: every string is the
// source's own wording, verified outside the repo against the source log (provenance.json +
// check-provenance.mjs in the Track D scratch folder).

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dataSource = read("src/components/dream-chapter/dream-chapter-extra-data.ts");

const LINES = /^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/;
const MAX_LINE = 58013;
const HUD = /^[A-Z0-9][A-Z0-9 ·\-–—:'.&/]*$/;

const isPassage = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof value.lines === "string" &&
  ("text" in value || "segments" in value);

function walk(value, at, visit) {
  visit(value, at);
  if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${at}[${i}]`, visit));
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) walk(item, `${at}.${key}`, visit);
  }
}

const passages = [];
const strings = [];
for (const [name, value] of Object.entries(extra)) {
  walk(value, name, (item, at) => {
    // labels ({ text, lines } under title / label / rider / device) are verbatim phrases, not passages
    if (isPassage(item) && !/\.(?:title|label|rider|device)$/.test(at))
      passages.push({ at, passage: item });
    if (typeof item === "string" && !at.endsWith(".lines")) strings.push({ at, text: item });
  });
}
const passageTexts = (passage) =>
  passage.segments ? passage.segments.map((segment) => segment.text) : [passage.text];

const ownerStrings = [];
for (const value of Object.values(owner)) {
  walk(value, "", (item) => {
    if (typeof item === "string") ownerStrings.push(item);
  });
}

test("archive corners keep their ids, 目次 rows and English HUD kickers", () => {
  const corners = extra.DREAM_ARCHIVE_CORNERS;
  assert.deepEqual(
    corners.map(({ id, act }) => `${id}:${act}`),
    // plan critic 2: 武装 closes 第四幕 so the owner's 附録 row (用語集, 名台詞) stays as it is
    ["chronicle:第四幕", "atlas:第四幕", "relations:第四幕", "arsenal:第四幕"],
  );
  for (const corner of corners) {
    assert.match(corner.kicker, HUD);
    assert.match(corner.unit, HUD);
    assert.ok(corner.title.text.length > 0 && !HUD.test(corner.title.text), corner.id);
  }
  for (const label of Object.values(extra.DREAM_ARCHIVE_LABELS)) assert.match(label, HUD);
});

test("chronicle: forty-four events retain case order and add four pre-rescue scenes", () => {
  const events = extra.DREAM_CHRONICLE;
  assert.deepEqual(
    events.map(({ no }) => no),
    Array.from({ length: 44 }, (_, i) => i + 1),
  );
  const cases = owner.DREAM_CASES.map(({ no }) => no);
  const perCase = cases.map((no) => events.filter((event) => event.case === no).length);
  assert.deepEqual(perCase, [7, 7, 8, 8, 6, 8]);
  for (let i = 1; i < events.length; i += 1) {
    assert.ok(cases.indexOf(events[i].case) >= cases.indexOf(events[i - 1].case), `event ${i + 1}`);
  }
  for (const event of events) {
    assert.ok(event.title.text && event.place && event.cast.length > 0, `event ${event.no}`);
    assert.equal(new Set(event.cast).size, event.cast.length, `event ${event.no} cast repeats`);
  }
});

test("new chronicle passages preserve complete source utterances and physical anchors", () => {
  const [finger, sayo, promise, blanket] = extra.DREAM_CHRONICLE.slice(40);
  assert.equal(finger.lines, "57713");
  assert.equal(finger.text, "拭われて綺麗になった花火屋の指先が、誰の目にも留まらないほど、かすかに、ぴくりと小さく動いた。");
  assert.equal(sayo.lines, "57854,57870,57880");
  assert.deepEqual(sayo.segments, [
    { by: "サヨ", text: "「だから……彼を取り戻すまでは、私は死ぬわけにはいかないのよ」" },
    { by: "橙", text: "「私も、藍様を取り戻したい」" },
    { by: "橙", text: "「その人がどんな人なのか……私にも、ちゃんと見せてよ」" },
  ]);
  assert.equal(promise.lines, "57966,57972");
  assert.deepEqual(promise.segments, [
    { by: "八坂神奈子", text: "「それなら約束だ。全員で必ず生きて帰ろう。……そして、帰ったらまた一杯やるぞ」" },
    { by: "洩矢諏訪子", text: "「神様とのゆびきりげんまん、破ったら許さないからね？」" },
  ]);
  assert.equal(blanket.lines, "58003,58009,58012");
  assert.deepEqual(blanket.segments, [
    { by: "鈴仙・優曇華院・イナバ", text: "「いいえ。永琳様が、風邪を引かないようにって掛けてくれたのよ」" },
    { by: "魂魄妖夢", text: "「そうですか……」" },
    { text: "静かに答えた妖夢は、その優しさにギュッと毛布を握り締めた。" },
  ]);
});

test("atlas, relations, arsenal and voices keep their planned counts", () => {
  const atlas = extra.DREAM_ATLAS;
  assert.equal(atlas.length, 15);
  assert.equal(atlas.flatMap(({ passages: list }) => list).length, 25);
  assert.equal(new Set(atlas.map(({ name }) => name)).size, 15);
  for (const place of atlas) assert.match(place.kicker, /^(?:CASE \d(?:–\d)?|DOLMINENCE)$/);

  assert.deepEqual(extra.DREAM_RELATION_CIRCLES, ["三人", "幻想郷", "ドルミネンス"]);
  const ties = extra.DREAM_RELATIONS;
  assert.equal(ties.length, 28);
  assert.deepEqual(
    extra.DREAM_RELATION_CIRCLES.map(
      (circle) => ties.filter((tie) => tie.circle === circle).length,
    ),
    [8, 16, 4],
  );
  const order = ties.map(({ circle }) => extra.DREAM_RELATION_CIRCLES.indexOf(circle));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
    "ties stay grouped by circle",
  );
  for (const tie of ties) assert.ok(tie.a && tie.b && tie.a !== tie.b && tie.label.text);

  const arsenal = extra.DREAM_ARSENAL;
  assert.deepEqual(
    arsenal.map(({ entries }) => entries.length),
    // ラストマルチ dropped from the first group: the selection cut the
    // source sentence before its 「───全て無意味であった。」 (fidelity review).
    [17, 11, 9, 5, 13, 2, 18],
  );
  for (const group of arsenal) {
    assert.match(group.kicker, HUD);
    assert.equal(new Set(group.entries.map(({ name }) => name)).size, group.entries.length);
  }

  const voices = extra.DREAM_VOICES;
  assert.equal(voices.length, 16);
  // サヨ's 「作を必ず取り戻すわよ」 (a source typo) is not featured (fidelity review).
  assert.equal(voices.flatMap(({ quotes }) => quotes).length, 86);
  assert.equal(new Set(voices.map(({ speaker }) => speaker)).size, 16);
  for (const voice of voices) {
    // サヨ holds four after the typo line was dropped; the others five or six.
    assert.ok(voice.quotes.length >= 4 && voice.quotes.length <= 6, voice.speaker);
    for (const quote of voice.quotes) assert.notEqual(quote.by, voice.speaker);
  }
});

test("supplements attach only to the owner's existing ids, codes, terms and labels", () => {
  assert.deepEqual(
    Object.keys(extra.DREAM_GLOSSARY_SUPPLEMENT),
    owner.DREAM_GLOSSARY.map(({ term }) => term),
  );
  const index = extra.DREAM_GLOSSARY_INDEX;
  assert.equal(index.length, 15);
  const ownerTerms = new Set(owner.DREAM_GLOSSARY.map(({ term }) => term));
  assert.equal(new Set(index.map(({ term }) => term)).size, 15);
  for (const { term } of index) assert.ok(!ownerTerms.has(term), term);

  const rosterIds = new Set(owner.DREAM_CAST_ROSTER.map(({ id }) => id));
  const roster = Object.keys(extra.DREAM_ROSTER_SUPPLEMENT);
  assert.equal(roster.length, 15);
  for (const id of roster) assert.ok(rosterIds.has(id), id);

  const codes = new Set(owner.DREAM_AGENT_ROSTER.map(({ code }) => code));
  const agents = Object.keys(extra.DREAM_AGENT_SUPPLEMENT);
  assert.equal(agents.length, 15);
  for (const code of agents) assert.ok(codes.has(code), code);
  assert.deepEqual(
    extra.DREAM_AGENT_ADDITIONS.map(({ code }) => code),
    ["7", "11", "12", "13", "14", "15", "16", "25", "LEMNON", "UNKNOWN", "FERIER", "WILD"],
  );
  for (const { code } of extra.DREAM_AGENT_ADDITIONS) {
    assert.ok(!codes.has(code), `${code} is already on the owner's roster`);
    assert.match(code, HUD);
  }

  const recordLabels = new Set(owner.DREAM_DOLMINENCE_RECORD.map(({ label }) => label));
  const record = Object.entries(extra.DREAM_RECORD_SUPPLEMENT);
  for (const [label] of record) assert.ok(recordLabels.has(label), label);
  assert.equal(record.flatMap(([, list]) => list).length, 3);

  for (const [id, supplement] of Object.entries(extra.DREAM_FACTION_SUPPLEMENT)) {
    const faction = owner.DREAM_FACTIONS.find((item) => item.id === id);
    assert.ok(faction, id);
    const members = new Set((faction.members ?? []).map(({ name }) => name));
    for (const name of Object.keys(supplement.memberNotes ?? {}))
      assert.ok(members.has(name), name);
    for (const { name } of supplement.members ?? []) assert.ok(!members.has(name), name);
  }

  assert.deepEqual(
    Object.keys(extra.DREAM_DOSSIER_SUPPLEMENT).sort(),
    [
      ...owner.DREAM_CHARACTERS.map(({ id }) => id),
      ...owner.DREAM_DOLMINENCE.map(({ id }) => id),
    ].sort(),
  );
});

test("every passage is one text or speaker segments, with global source line refs", () => {
  assert.ok(passages.length > 300);
  const checkLines = (spec, at) => {
    assert.match(spec, LINES, at);
    let previous = 0;
    for (const part of spec.split(",")) {
      const [a, b = a] = part.split("-").map(Number);
      assert.ok(a > previous && b >= a && b <= MAX_LINE, `${at}: ${spec}`);
      previous = b;
    }
  };
  for (const { at, passage } of passages) {
    checkLines(passage.lines, at);
    assert.notEqual(typeof passage.text === "string", Array.isArray(passage.segments), at);
    if (passage.segments) {
      assert.ok(passage.segments.length > 0, at);
      if (passage.segments.every((segment) => segment.by)) assert.equal(passage.by, undefined, at);
    }
    for (const text of passageTexts(passage)) assert.ok(text.length > 0, at);
  }
  walk(extra, "extra", (item, at) => {
    if (item && typeof item === "object" && !Array.isArray(item) && "lines" in item) {
      checkLines(item.lines, at);
    }
  });
});

test("text carries no chat residue, separators, timestamps or account names", () => {
  for (const { at, text } of strings) {
    assert.ok(text.length > 0, at);
    for (const line of text.split("\n")) {
      assert.ok(line.length > 0, `${at}: empty line`);
      assert.doesNotMatch(line, /^[\s\u3000]|[\s\u3000]$/, `${at}: line padded`);
    }
    assert.doesNotMatch(text, /\t|""|@|\b\d{1,2}:\d{2}\b|保存日時|\[LINE\]/, at);
    assert.doesNotMatch(text, /深い悪夢と英雄達|❝|❞|#＿|が参加しました|送信を取り消しました/, at);
  }
  for (const { at, passage } of passages) {
    for (const text of passageTexts(passage))
      assert.doesNotMatch(text, /／| \/ /, `${at}: separator`);
  }
});

test("kept-out threads, real names and conflicting spellings stay out", () => {
  const banned = [
    "清永組",
    "荘子",
    "狗瓦雷",
    "夜明護命",
    "コードナンバー19",
    "コードナンバー23",
    "イキュス",
    "ソーサラー",
    "妖精の森",
    "日縄一希",
    "芽依",
    "白髪の少女",
    "ケタロス",
    "ヒグレ",
    "シンコウ",
    "悠真",
    "シンヤ",
    "遺品",
    "MALTI",
    "ドレッドドライバー",
    "レプリドラゴナス",
    "（地の文）",
  ];
  for (const { at, text } of strings) {
    for (const word of banned) assert.ok(!text.includes(word), `${at}: ${word}`);
  }
  // ネル's gender is a known source conflict: nothing about ネル may carry a gendered word.
  const nel = [
    extra.DREAM_AGENT_SUPPLEMENT["17"],
    ...extra.DREAM_RELATIONS.filter(({ a, b }) => a === "ネル" || b === "ネル"),
    ...extra.DREAM_ARSENAL.flatMap(({ entries }) => entries).filter(
      ({ owner: who }) => who === "ネル",
    ),
  ];
  walk(nel, "nel", (item, at) => {
    if (typeof item === "string" && !at.endsWith(".lines"))
      assert.doesNotMatch(item, /彼女|彼|女性|男性|少女|少年/, at);
  });
});

test("narration never addresses the visitor as the role-play's 貴方", () => {
  const unquoted = (text) => text.replace(/「[^」]*」/g, "").replace(/『[^』]*』/g, "");
  const speech = (passage, at) => passage.by || /DREAM_VOICES\[\d+\]\.quotes/.test(at);
  for (const { at, passage } of passages) {
    if (speech(passage, at)) continue;
    if (passage.segments) {
      for (const segment of passage.segments) {
        if (!segment.by) assert.doesNotMatch(unquoted(segment.text), /貴方|あなた|貴女|アナタ/, at);
      }
    } else {
      assert.doesNotMatch(unquoted(passage.text), /貴方|あなた|貴女|アナタ/, at);
    }
  }
});

test("the archive repeats neither the owner's text nor itself", () => {
  // Names, rider names, Latin HUD calls (【Rollout！】) and spell-card calls (恋符『…』) recur by
  // nature; every other sentence piece of seven or more characters appears once.
  const isName = (piece) =>
    /^(?:仮面ライダー)?[\u30a0-\u30ffー]+$/.test(piece) ||
    /^[A-Za-z0-9\-:%]+$/.test(piece) ||
    /^[\u4e00-\u9fff]{1,2}符/.test(piece);
  const squash = (text) => text.replace(/[\s\u3000「」『』“”"【】（）()…・、。！？!?―─.]/g, "");
  const pieces = (text) =>
    text
      .split(/\n|(?<=[。！？!?」』】])/)
      .map(squash)
      .filter((piece) => [...piece].length >= 7 && !isName(piece));
  const ownerText = squash(ownerStrings.join("\n"));
  // Tie 25 sets up ネル's 「無理♡」 with テツヤ's line, which the owner's site also quotes.
  const allowedOwnerRepeats = new Set([squash("ネルさんには少しは静かにしてほしいものです……")]);
  const seen = new Map();
  for (const { at, passage } of passages) {
    for (const text of passageTexts(passage)) {
      assert.ok(!ownerStrings.includes(text), `${at}: equals an owner string`);
      for (const piece of pieces(text)) {
        if (!allowedOwnerRepeats.has(piece))
          assert.ok(!ownerText.includes(piece), `${at}: owner text ${piece}`);
        assert.ok(!seen.has(piece), `${at}: repeats ${seen.get(piece)} (${piece})`);
        seen.set(piece, at);
      }
    }
  }
});

test("the data module is plain typed data", () => {
  const imports = [...dataSource.matchAll(/^import .*$/gm)].map(([line]) => line);
  assert.deepEqual(imports, [
    'import type { DreamCharacter, DreamDolminence } from "./dream-chapter-data";',
  ]);
  assert.doesNotMatch(dataSource, /=>|\bfunction\b|<\/|\/>|\bclass\b|\benum\b|\bnamespace\b/);
  assert.doesNotMatch(dataSource, /^ *\/\/.*(?:TODO|FIXME)/m);
});
