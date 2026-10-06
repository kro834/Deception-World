import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const [worldPath, dreamPath] = process.argv.slice(2);
assert.ok(
  worldPath && dreamPath && process.argv.length === 4,
  "Usage: node scripts/verify-story-source-quotes.mjs <world-source.txt> <dream-source.txt>",
);

function collectObjects(node, output) {
  if (ts.isObjectLiteralExpression(node)) output.push(node);
  ts.forEachChild(node, (child) => collectObjects(child, output));
}

function prop(object, name) {
  return object.properties.find(
    (entry) =>
      ts.isPropertyAssignment(entry) &&
      ((ts.isIdentifier(entry.name) && entry.name.text === name) ||
        (ts.isStringLiteral(entry.name) && entry.name.text === name)),
  );
}

function stringValue(property) {
  return property &&
    ts.isPropertyAssignment(property) &&
    ts.isStringLiteralLike(property.initializer)
    ? property.initializer.text
    : null;
}

function unwrap(node) {
  while (
    node &&
    (ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isParenthesizedExpression(node))
  ) {
    node = node.expression;
  }
  return node;
}

async function publicQuotes(filePath, targetNames) {
  const file = await readFile(filePath, "utf8");
  const ast = ts.createSourceFile(
    typeof filePath === "string" ? filePath : fileURLToPath(filePath),
    file,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const quotes = [];
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !targetNames.includes(declaration.name.text))
        continue;
      const initializer = unwrap(declaration.initializer);
      if (
        declaration.name.text === "DREAM_CHRONICLE" &&
        initializer &&
        ts.isArrayLiteralExpression(initializer)
      ) {
        for (const event of initializer.elements) {
          if (!ts.isObjectLiteralExpression(event)) continue;
          const eventNo = Number(
            stringValue(prop(event, "no")) ?? prop(event, "no")?.initializer?.text,
          );
          if (eventNo < 41) continue;
          const segments = prop(event, "segments")?.initializer;
          const eventText = stringValue(prop(event, "text"));
          if (eventText) {
            const { line } = ast.getLineAndCharacterOfPosition(prop(event, "text").getStart(ast));
            quotes.push({ data: `DREAM_CHRONICLE[${eventNo}].text:${line + 1}`, text: eventText });
          }
          if (segments && ts.isArrayLiteralExpression(segments)) {
            for (const segment of segments.elements) {
              if (!ts.isObjectLiteralExpression(segment)) continue;
              const text = stringValue(prop(segment, "text"));
              if (!text) continue;
              const { line } = ast.getLineAndCharacterOfPosition(
                prop(segment, "text").getStart(ast),
              );
              quotes.push({ data: `DREAM_CHRONICLE[${eventNo}].segment:${line + 1}`, text });
            }
          }
        }
        continue;
      }
      const objects = [];
      if (declaration.initializer) collectObjects(declaration.initializer, objects);
      for (const object of objects) {
        const by = stringValue(prop(object, "by"));
        const text =
          stringValue(prop(object, "text")) ??
          (declaration.name.text === "DREAM_CASE_NOTES" ? stringValue(prop(object, "line")) : null);
        if (!by || !text) continue;
        const { line } = ast.getLineAndCharacterOfPosition(object.getStart(ast));
        quotes.push({ data: `${declaration.name.text}:${line + 1}`, text });
      }
    }
  }
  return quotes;
}

function occurrences(source, quote) {
  const found = [];
  let index = 0;
  while ((index = source.indexOf(quote, index)) !== -1) {
    found.push(source.slice(0, index).split("\n").length);
    index += Math.max(quote.length, 1);
  }
  return found;
}

async function verify({ label, sourcePath, dataPath, names }) {
  const [sourceText, quotes] = await Promise.all([
    readFile(sourcePath, "utf8"),
    publicQuotes(dataPath, names),
  ]);
  assert.ok(quotes.length > 0, `${label}: no public quotations were collected`);
  const source = sourceText.replaceAll("\r\n", "\n");
  const results = quotes.map((quote) => ({
    ...quote,
    sourceLines: occurrences(source, quote.text),
  }));
  const missing = results.filter((result) => !result.sourceLines.length);
  console.log(
    JSON.stringify({
      source: label,
      sha256: createHash("sha256").update(sourceText).digest("hex"),
      quoteCount: results.length,
      matched: results.length - missing.length,
      unmatched: missing.map(({ data }) => data),
      matches: results
        .filter((result) => result.sourceLines.length)
        .map(({ data, sourceLines }) => ({ data, sourceLines })),
    }),
  );
  assert.equal(
    missing.length,
    0,
    `${label}: ${missing.length} public quote(s) do not occur in the supplied source`,
  );
}

await verify({
  label: "World",
  sourcePath: worldPath,
  dataPath: new URL("../src/components/world/world-annex-data.ts", import.meta.url),
  names: ["WORLD_EPISODE_NOTES"],
});
await verify({
  label: "Dream",
  sourcePath: dreamPath,
  dataPath: new URL("../src/components/dream-chapter/dream-chapter-data.ts", import.meta.url),
  names: ["DREAM_QUOTES", "DREAM_CASE_NOTES"],
});
await verify({
  label: "Dream chronicle",
  sourcePath: dreamPath,
  dataPath: new URL("../src/components/dream-chapter/dream-chapter-extra-data.ts", import.meta.url),
  names: ["DREAM_CHRONICLE"],
});
