import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sagaArchivePath = resolve(root, "public/saga-form-archive-standalone.html");
const realmMotionPath = resolve(root, "public/realm-archive-motion.js");

const realmAccents = `const accents = {
    stella: ['#76d8ff', '#8f7bff', '118 216 255', '143 123 255'],
    burst: ['#ff8a6c', '#ffc36d', '255 138 108', '255 195 109'],
    blast: ['#5ddcff', '#7198ff', '93 220 255', '113 152 255'],
    legends: ['#f0c56d', '#6ddcff', '240 197 109', '109 220 255'],
    royal: ['#f0c56d', '#b98cff', '240 197 109', '185 140 255'],
    'royal-wrath': ['#ff667f', '#f0c56d', '255 102 127', '240 197 109'],
    'royal-abyss': ['#9a72ff', '#586fff', '154 114 255', '88 111 255'],
    'royal-birth': ['#67e6ff', '#67e0b0', '103 230 255', '103 224 176'],
    'royal-nehan': ['#fff0bd', '#8fe9ff', '255 240 189', '143 233 255']
  };`;

function scriptById(html, id) {
  const expression = new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`);
  const match = html.match(expression);
  if (!match) throw new Error(`Missing Saga archive script: ${id}`);
  return match[1].trim();
}

function normalizeIdentifiers(source) {
  return source
    .replaceAll("SagaMotionController", "RealmMotionController")
    .replaceAll("saga-", "realm--saga-")
    .replaceAll("#form-selector", "#realm--form-selector");
}

function normalizeMaster(source) {
  const normalized = normalizeIdentifiers(source)
    .replace("const DEFAULT_FORM_ID = 'multi';", "const DEFAULT_FORM_ID = 'stella';")
    .replace("17 / 17 FORMS", "09 / 09 FORMS")
    .replace(
      /const accents = \{[\s\S]*?\n {2}\};\n\n {2}const telemetry =/,
      `${realmAccents}\n\n  const telemetry =`,
    );

  if (!normalized.includes("const DEFAULT_FORM_ID = 'stella';")) {
    throw new Error("Realm default form normalization failed");
  }
  if (!normalized.includes("09 / 09 FORMS")) {
    throw new Error("Realm form count normalization failed");
  }
  if (!normalized.includes("'royal-nehan':")) {
    throw new Error("Realm accent normalization failed");
  }
  return normalized;
}

export function createRealmArchiveMotion(sagaArchive) {
  const master = normalizeMaster(scriptById(sagaArchive, "saga-archive-master-script"));
  const adaptive = normalizeIdentifiers(
    scriptById(sagaArchive, "saga-adaptive-motion-v16-script"),
  );
  const runtime = normalizeIdentifiers(scriptById(sagaArchive, "saga-runtime-v16-script"));

  return `/* eslint-disable no-empty, @typescript-eslint/no-unused-vars */
/* Generated from the Saga archive motion controllers. Do not hand-edit. */
${master}

${adaptive}

${runtime}
`;
}

export function buildRealmArchiveMotion() {
  const sagaArchive = readFileSync(sagaArchivePath, "utf8");
  const output = createRealmArchiveMotion(sagaArchive);
  writeFileSync(realmMotionPath, output);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = buildRealmArchiveMotion();
  console.log(`[realm-archive-motion] generated ${Buffer.byteLength(output)} byte controller`);
}
