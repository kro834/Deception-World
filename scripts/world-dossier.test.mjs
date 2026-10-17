import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = new Map();
function loadData(path) {
  const absolute = resolve(root, path);
  if (cache.has(absolute)) return cache.get(absolute);
  const exports = {};
  cache.set(absolute, exports);
  runInNewContext(
    ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      require: (specifier) =>
        loadData(resolve(dirname(absolute), `${specifier.replace(/\.ts$/, "")}.ts`)),
    },
  );
  return exports;
}

/* Column 06 『？？？』 (owner, 2026-10-17): a spoiler warning on the World page,
   and the owner's 『犬』 dossier shown only once its plus slider is moved. */
const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replaceAll("\r\n", "\n");
const { DOG_DOSSIER, DOG_DOSSIER_COLUMN } = loadData(
  "src/components/world/world-dog-dossier-data.ts",
);

test("the dossier is the owner's record, section by section", () => {
  assert.equal(DOG_DOSSIER.title, "終の来訪者『犬』");
  assert.equal(DOG_DOSSIER.subtitle, "種族設定・総合資料");
  // The data comes from another realm (vm): compare by value, not prototype.
  assert.equal(
    JSON.stringify(DOG_DOSSIER.sections.map((section) => section.heading)),
    JSON.stringify([
      "概要",
      "存在吸収・魂の融合",
      "管理権限の獲得",
      "適応性・人格形成",
      "世界への干渉・捕食",
      "形態・固有能力",
      "脅威評価・討伐原則",
      "管理体系との関係",
      "未解明事項",
      "総括",
    ]),
  );
  // The owner's ⸻ stands before the summing-up only.
  assert.equal(
    JSON.stringify(
      DOG_DOSSIER.sections.filter((section) => section.divider).map((section) => section.heading),
    ),
    JSON.stringify(["総括"]),
  );
  assert.equal(DOG_DOSSIER.sections.flatMap((section) => section.paragraphs).length, 57);
  assert.ok(DOG_DOSSIER.sections[0].paragraphs[0].startsWith("『犬』とは、異なる世界へ来訪し"));
  assert.ok(
    DOG_DOSSIER.sections.at(-1).paragraphs.at(-1).endsWith("異なる存在へと変化し得るのである。"),
  );
});

test("column 06 is 『？？？』 with a warning; the dossier stays out of the search", () => {
  assert.equal(DOG_DOSSIER_COLUMN.no, "06");
  assert.equal(DOG_DOSSIER_COLUMN.title, "？？？");
  assert.equal(DOG_DOSSIER_COLUMN.spoiler, true);
  assert.match(DOG_DOSSIER_COLUMN.body, /ネタバレ/);
  assert.equal(DOG_DOSSIER_COLUMN.pickup.length, 57);
  const columns = read("src/components/world/world-columns-data.ts");
  assert.match(
    columns,
    /DOG_ISAKU_COLUMN,\s*(?:\/\/[^\n]*\n\s*)*DOG_DOSSIER_COLUMN,\s*\] as const;/,
  );
  const search = read("src/components/search/search-data.ts");
  assert.match(search, /"spoiler" in column && column\.spoiler \? "" : column\.pickup\.join/);
});

test("the World page shows the warning and the plus slider first, the dossier once slid open", () => {
  const home = read("src/components/world/world-home.tsx");
  assert.match(home, /const \[dossierOpen, setDossierOpen\] = useState\(false\);/);
  // The column panel's slider opens the dossier for column 06, the pickup otherwise.
  assert.match(home, /label=\{"spoiler" in column \? "ネタバレを開く" : "ピックアップ"\}/);
  assert.match(home, /setDossierOpen\(true\);\s*openPickup\(\);/);
  // The dialog pane: gate first, dossier after.
  assert.match(
    home,
    /item\.no === "06" \? \(\s*dossierOpen \? \(\s*<DogDossierProse id="world-column-dossier" \/>/,
  );
  assert.match(
    home,
    /className="world-column-spoiler-gate">\s*<p>\{item\.body\}<\/p>[\s\S]*?\{pickupOpen \? \(\s*<SlideOpenControl/,
  );
  assert.match(home, /opensDialog=\{false\}\s*onOpen=\{\(\) => setDossierOpen\(true\)\}/);
  const prose = read("src/components/world/dog-dossier-prose.tsx");
  assert.match(prose, /world-mystery-reading world-dossier-reading/);
  const css = read("src/styles-world-transcript.css");
  assert.match(css, /#column-dialog-panel-5 \.world-mystery-chapter \{/);
  assert.match(css, /#column-dialog-panel-5 \.world-column-spoiler-gate \{/);
});
