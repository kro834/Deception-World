import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import {
  DOG_ISAKU_COLUMN,
  WORLD_MYSTERY_QUOTES,
} from "../src/components/world/world-mystery-data.ts";
import { WORLD_QUOTES } from "../src/components/world/world-annex-data.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const home = read("src/components/world/world-home.tsx");
const annex = read("src/components/world/world-annex.tsx");
const css = read("src/styles-world-transcript.css");
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("Column 05 is appended to both existing controls; the first four documents are unchanged", () => {
  const file = ts.createSourceFile(
    "world-home.tsx",
    home,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const printer = ts.createPrinter({ removeComments: true });
  let elements;
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(file) === "COLUMNS") elements = declaration.initializer.elements;
    }
  }
  assert.equal(elements.length, 5);
  assert.equal(elements[4].getText(file), "DOG_ISAKU_COLUMN");
  assert.equal(
    hash(
      elements
        .slice(0, 4)
        .map((element) => printer.printNode(ts.EmitHint.Unspecified, element, file)),
    ),
    "dda77887a3b45555f6dd2ba00b4f12179aabeb68bf304cd747ec77bc6a4a9d1f",
  );
  assert.equal((home.match(/c\.no === "05"/g) ?? []).length, 2);
  assert.match(home, /aria-labelledby=\{`column-dialog-tab-\$\{index\}`\}/);
});

test("the mystery distinguishes recorded facts, inference and the unresolved ending", () => {
  assert.equal(DOG_ISAKU_COLUMN.no, "05");
  assert.equal(DOG_ISAKU_COLUMN.title, "“犬”と“イサク”の謎");
  assert.equal(DOG_ISAKU_COLUMN.pickup.length, 7);
  const copy = DOG_ISAKU_COLUMN.pickup.join("\n");
  for (const distinction of [
    "動物としての犬を指す名ではない",
    "名付けたのはレックス自身",
    "独立した生命として生きている",
    "同じ結末が保証される訳ではない",
    "“犬”の斥候",
    "その喪失の経緯や、“犬”との関係の全貌",
    "観測主体が“犬”であると確定した訳ではない",
    "根拠不足としてその仮説を棄却",
    "その結末は、いずれの記録にも示されていない",
  ])
    assert.ok(copy.includes(distinction), distinction);
  assert.ok(DOG_ISAKU_COLUMN.pickup.every((paragraph) => paragraph.length >= 100));
  assert.doesNotMatch(copy, /@|file:\/\/|\/Users\/|\u3000/);
});

test("both mystery names use the owner's emphasis in the title, synopsis, prose and two tabs", () => {
  const copy = [DOG_ISAKU_COLUMN.title, DOG_ISAKU_COLUMN.body, ...DOG_ISAKU_COLUMN.pickup].join("\n");
  const withoutNames = copy.replaceAll("“犬”", "").replaceAll("“イサク”", "");
  assert.doesNotMatch(withoutNames.replace("動物としての犬", ""), /犬|イサク/);
  assert.equal((home.match(/“犬”と/g) ?? []).length, 2);
  assert.equal((home.match(/“イサク”の謎/g) ?? []).length, 2);
});

test("the four new quotes are exact excerpts, appended without rewriting the earlier thirteen", () => {
  assert.deepEqual(
    WORLD_MYSTERY_QUOTES.map(({ text, by }) => [text, by]),
    [
      ["君の勝利を、私が喜べるとは限らない", "レックス・ロワ"],
      ["今は余計な仮説を増やすべきではないな。まだ資料が足りん", "フェイブル"],
      ["世界の外側から見られてる、ってことか？", "月城悠真"],
      ["私に、君達を惜しませないでください", "レックス・ロワ"],
    ],
  );
  assert.equal(WORLD_QUOTES.length, 17);
  assert.deepEqual(WORLD_QUOTES.slice(-4), WORLD_MYSTERY_QUOTES);
  assert.equal(
    hash(WORLD_QUOTES.slice(0, 13)),
    "b4f03f96bb43b68458e4ff11dde4e5b74ee4d70c9a53daee6aeb908867af00a1",
  );
});

test(
  "optional owner source confirms both Rex excerpts verbatim",
  { skip: !process.env.WORLD_MYSTERY_REX_SOURCE },
  () => {
    const source = readFileSync(process.env.WORLD_MYSTERY_REX_SOURCE, "utf8");
    for (const quote of WORLD_MYSTERY_QUOTES.filter(({ source }) => source === "rex-record")) {
      assert.ok(source.includes(quote.text), quote.text);
    }
  },
);

test("transcription is optional, scoped only to the voices log and does not replace rail navigation", () => {
  assert.match(annex, /mountQuoteTranscript\(railRef.current, \{ disabled: transcriptStopped \}\)/);
  assert.match(annex, /aria-pressed=\{transcriptStopped\}/);
  assert.match(annex, /aria-controls="world-quotes-rail"/);
  assert.match(annex, /全文を表示/);
  assert.match(annex, /演出を再生/);
  assert.match(annex, /WORLD_QUOTES\.map\([\s\S]*?<AnnexQuote[^>]*transcribed/);
  assert.match(annex, /aria-label="次の名台詞へ"/);
  assert.match(annex, /event\.key === "End"/);
  const route = read("src/routes/world.tsx");
  assert.match(route, /styles-world-transcript\.css\?url/);
  assert.ok(
    route.lastIndexOf("href: worldTranscriptCssUrl") < route.lastIndexOf("href: worldMirageCssUrl"),
  );
});

test("five tabs reflow without undersized labels; the facsimile has no endless or full-screen glitch", () => {
  assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /display: grid !important;/);
  assert.match(css, /grid-auto-rows: minmax\(90px, auto\)/);
  assert.match(css, /--liquid-shell-radius: 36px !important;/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /data-world-effects="economy"/);
  assert.match(
    css,
    /\.wa-transcript-visual \{[\s\S]*?pointer-events: none;[\s\S]*?user-select: none;/,
  );
  assert.doesNotMatch(css, /\binfinite\b|position: fixed|mix-blend-mode|backdrop-filter/);
  assert.doesNotMatch(
    read("src/lib/quote-transcript.js"),
    /setInterval|setTimeout|innerHTML|localStorage|fetch\(/,
  );
});
