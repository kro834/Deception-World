import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const edition = read("src/styles-dossier-edition.css");
const sovereign = read("src/styles-sovereign-file.css");
const pickup = read("src/styles-pickup-cinema.css");
const archive = read("src/styles-form-archive.css");
const lejas = read("src/components/world/lejas-page.tsx");
const nav = read("src/components/world/dossier-nav.tsx");

test("Lejas's close-up cut lands on a decoded layer, never on the empty plate", () => {
  assert.match(lejas, /const CUT_DECODE_LIMIT_MS = 200;/);
  assert.match(lejas, /onClick=\{cut\}/);
  assert.match(lejas, /ref=\{wideRef\}\s+className="lejas-wide"/);
  assert.match(lejas, /ref=\{faceRef\}\s+className="lejas-face"/);
  // Decode first, commit on resolve or on the fallback, once per run.
  assert.match(lejas, /layer\.decode\(\)\.then\(commit, commit\);/);
  assert.match(lejas, /window\.setTimeout\(commit, CUT_DECODE_LIMIT_MS\)/);
  assert.match(lejas, /if \(committed \|\| cutRun\.current !== run\) return;/);
  // The pressed state and both labels are unchanged.
  assert.match(lejas, /aria-pressed=\{closeUp\}/);
  assert.match(lejas, /aria-label=\{closeUp \? "全身ショットに戻す" : "顔アップを表示"\}/);
});

test("the Form Archive's cover is in on a switch's first frame and only the reveal fades", () => {
  assert.match(
    archive,
    /\.form-archive-page > \.form-archive-frame-status:not\(\.is-loaded\) \{\s*transition: none;\s*\}/,
  );
});

test("the romanised name keeps the 12px floor from the desktop step up", () => {
  assert.match(
    edition,
    /@media \(min-width: 1100px\) \{\s*main\.manager-page:not\(\.is-sovereign\) \.manager-introduction \.dossier-identity h1 small \{\s*font-size: clamp\(12px, 1vw, 13px\);/,
  );
});

test("the file's end plates keep their whole focus ring (main clips sideways only)", () => {
  assert.match(edition, /main\.manager-page:not\(\.is-sovereign\) \{\s*overflow-y: visible;\s*\}/);
  assert.match(sovereign, /main\.manager-page\.is-sovereign \{\s*overflow-y: visible;\s*\}/);
  // Sideways the World base clip still holds: the two rules open y only.
  for (const block of [
    edition.match(/main\.manager-page:not\(\.is-sovereign\) \{\s*overflow-y: visible;\s*\}/)[0],
    sovereign.match(/main\.manager-page\.is-sovereign \{\s*overflow-y: visible;\s*\}/)[0],
  ])
    assert.doesNotMatch(block, /overflow(-x)?:/);
});

test("spec-sheet values break at name seams and keep their closing bracket", () => {
  assert.match(nav, /export function NameText\(\{ value, seams = false \}/);
  assert.match(nav, /<DisplayName value=\{chunk\} \/>/);
  assert.match(read("src/components/name-text.tsx"), /\{index > 0 \? <wbr \/> : null\}/);
  // The default path renders exactly as before.
  assert.match(nav, /: chunk\}/);
  for (const [file, value] of [
    ["src/components/world/rider-page.tsx", "f.dd"],
    ["src/components/world/manager-stub.tsx", "f.dd"],
    ["src/components/world/ciel-page.tsx", "fact.dd"],
    ["src/components/world/related-page.tsx", "f.dd"],
  ]) {
    assert.match(read(file), new RegExp(`<dd>\\s*<NameText value=\\{${value.replace(".", "\\.")}\\} seams />`), file);
  }
  assert.match(
    edition,
    /@media \(min-width: 375px\) and \(max-width: 389px\) \{\s*main\.manager-page:not\(\.is-sovereign\) \.manager-hero \.manager-facts > div > dt \{\s*letter-spacing: 0\.06em;\s*\}\s*main\.manager-page:not\(\.is-sovereign\) \.manager-hero \.manager-facts > div > dd \{\s*padding-right: 0;/,
  );
});

test("record viewers break names at their seams and prose under the strict kinsoku", () => {
  // The system line holds each name whole and breaks at its seams.
  assert.match(
    pickup,
    /\.form-pickup-heading\s*> small \{[^}]*word-break: keep-all;\s*overflow-wrap: anywhere;\s*text-wrap-style: balance;/,
  );
  // The gallery label balances character breaks (no lone フォー／ム).
  assert.match(pickup, /figcaption\s*> span \{[^}]*word-break: normal;/);
  // Record prose is flush, as the dossier's chapters.
  assert.match(
    pickup,
    /:is\(\.form-pickup-overview, \.form-pickup-sections\),\s*\.rider-nightmare-dialog \.rider-nightmare-dialog-sections\s*\)\s*p \{\s*word-break: normal;/,
  );
});

test("the new hover states answer fine pointers only, in colour only", () => {
  const blocks = [
    sovereign.match(/main\.manager-page\.is-sovereign > \.manager-pagination \.dossier-index-return:hover \{[^}]*\}/)?.[0],
    edition.match(/button\.manager-portrait-frame:hover \.lejas-tap-hint \{[^}]*\}/)?.[0],
  ];
  for (const block of blocks) {
    assert.ok(block, "hover rule present");
    assert.doesNotMatch(block, /transform|translate|scale|width|height|padding|margin/);
  }
  for (const [sheet, needle] of [
    [sovereign, ".dossier-index-return:hover"],
    [edition, "button.manager-portrait-frame:hover .lejas-tap-hint"],
  ]) {
    const at = sheet.indexOf(needle);
    const media = sheet.lastIndexOf("@media", at);
    assert.match(sheet.slice(media, at), /^@media \(hover: hover\) and \(pointer: fine\) \{/);
  }
});

test("the sweep adds no keyframes to the dossier, pickup, sovereign or archive sheets", () => {
  for (const [name, sheet] of [
    ["edition", edition],
    ["sovereign", sovereign],
    ["pickup", pickup],
    ["archive", archive],
  ]) {
    for (const block of sheet.split("@keyframes").slice(1)) {
      const name0 = block.trim().split(/\s|\{/)[0];
      assert.doesNotMatch(name0, /sweep/, `${name}: ${name0}`);
    }
  }
});
