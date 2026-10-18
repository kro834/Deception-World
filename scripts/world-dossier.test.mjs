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

test("the dossier moves out of ordinary columns into the post-RISING book", () => {
  assert.equal(DOG_DOSSIER_COLUMN.title, "？？？");
  assert.match(DOG_DOSSIER_COLUMN.body, /ネタバレ/);
  assert.equal(DOG_DOSSIER_COLUMN.pickup.length, 57);
  const columns = loadData("src/components/world/world-columns-data.ts").WORLD_COLUMNS;
  assert.equal(columns.length, 5);
  assert.ok(columns.every((column) => column.no !== "06"));
  const home = read("src/components/world/world-home.tsx");
  assert.doesNotMatch(home, /DogDossierProse|dossierOpen|world-column-dossier/);
  const viewer = read("src/components/world/re-dive-file-dialog.tsx");
  assert.match(viewer, /const \[dossierOpen, setDossierOpen\] = useState\(false\)/);
  assert.match(viewer, /DOG_DOSSIER_COLUMN\.title/);
  assert.match(viewer, /DOG_DOSSIER_COLUMN\.body/);
  assert.match(viewer, /aria-expanded=\{dossierOpen\}/);
  assert.match(viewer, /aria-controls="rd-file-dog-dossier"/);
  assert.match(viewer, /\{dossierOpen \? <DogDossierProse \/> : null\}/);
  assert.ok(viewer.indexOf("rd-file-appendix") > viewer.indexOf("paragraphs.map"));
  assert.match(read("src/components/world/re-dive-section.tsx"), /fileOpen \? <ReDiveFileDialog/);
});
