import { createHash } from "node:crypto";
import ts from "typescript";

// Pin content and rendered structure independently of timer/loading logic.
// Poster cancellation disabled states are excluded; dedicated tests cover
// their behavior.
export function worldViewContract(source) {
  const file = ts.createSourceFile(
    "world-home.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const printer = ts.createPrinter({ removeComments: true });
  const records = [];
  const markup = [];
  // WORLD_COLUMNS: the columns' own module (world-columns-data.ts), read
  // together with world-home since rx6 moved them there for the site search.
  const recordNames = new Set([
    "POSTERS",
    "RIDERS",
    "COLUMNS",
    "WORLD_COLUMNS",
    "EPISODES",
    "STORY_TITLE",
    "RIDERS_TITLE",
    "RECORDS_TITLE",
    "FINALE_TITLE",
  ]);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (recordNames.has(declaration.name.getText(file))) {
        const printed = printer.printNode(ts.EmitHint.Unspecified, declaration, file);
        // Original dimensions are independently checked against actual files.
        records.push(
          declaration.name.getText(file) === "POSTERS"
            ? printed.replace(/\s+(?:width|height): \d+,/g, "")
            : printed,
        );
      }
    }
  }
  const transforms = [
    (context) => {
      const visit = (node) => {
        if (ts.isJsxAttribute(node)) {
          const name = node.name.getText(file);
          // React identity and event handlers are not rendered attributes.
          if (name === "key" || /^on[A-Z]/.test(name)) return undefined;
          const attributes = node.parent.properties;
          const posterControl = attributes.some(
            (attribute) =>
              ts.isJsxAttribute(attribute) &&
              attribute.name.getText(file) === "className" &&
              attribute.initializer &&
              /\bposter-(reset|lock)\b/.test(attribute.initializer.getText(file)),
          );
          if (name === "disabled" && posterControl) return undefined;
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (node) => ts.visitNode(node, visit);
    },
  ];
  const collect = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      const result = ts.transform(node, transforms);
      markup.push(printer.printNode(ts.EmitHint.Unspecified, result.transformed[0], file));
      result.dispose();
      return;
    }
    ts.forEachChild(node, collect);
  };
  collect(file);
  const digest = (items) => createHash("sha256").update(JSON.stringify(items)).digest("hex");
  return { records: digest(records), markup: digest(markup) };
}

// Hero composition may change, but its words and everything after it may not.
export function worldArtworkBoundaryContract(source) {
  const start = source.lastIndexOf("<section", source.indexOf("ref={openingHeroRef}"));
  const end = source.indexOf('<MirageTicker variant="open"', start);
  if (start < 0 || end < 0) throw new Error("World hero boundaries missing");
  const hero = source.slice(start, end);
  const file = ts.createSourceFile(
    "hero.tsx",
    hero,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const words = [];
  const visit = (node) => {
    if (ts.isJsxText(node) && node.text.trim()) words.push(node.text.trim().replace(/\s+/g, " "));
    ts.forEachChild(node, visit);
  };
  visit(file);
  return {
    outsideHero: worldViewContract(source.slice(0, start) + "<span />" + source.slice(end)).markup,
    heroWords: createHash("sha256").update(JSON.stringify(words.sort())).digest("hex"),
  };
}
