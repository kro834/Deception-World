import { createHash } from "node:crypto";
import ts from "typescript";

// Pin content and rendered structure independently of timer/loading logic.
// Poster cancellation disabled states and the nonvisual, post-hydration Ultra
// readiness marker are excluded; dedicated tests cover their behavior.
export function worldViewContract(source) {
  const file = ts.createSourceFile("world-home.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter({ removeComments: true });
  const records = [];
  const markup = [];
  const recordNames = new Set(["POSTERS", "RIDERS", "COLUMNS", "EPISODES", "STORY_TITLE", "RIDERS_TITLE", "RECORDS_TITLE", "FINALE_TITLE"]);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (recordNames.has(declaration.name.getText(file))) {
        records.push(printer.printNode(ts.EmitHint.Unspecified, declaration, file));
      }
    }
  }
  const transforms = [(context) => {
    const visit = (node) => {
      if (ts.isJsxAttribute(node)) {
        const name = node.name.getText(file);
        // React identity and event handlers are not rendered attributes.
        if (name === "key" || /^on[A-Z]/.test(name)) return undefined;
        const attributes = node.parent.properties;
        const posterFrame = attributes.some((attribute) =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "className" &&
          attribute.initializer?.getText(file) === '"poster-frame"',
        );
        if (name === "data-ultra-artwork-ready" && posterFrame) return undefined;
        const posterControl = attributes.some((attribute) =>
          ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "className" &&
          attribute.initializer && /\bposter-(reset|lock)\b/.test(attribute.initializer.getText(file)),
        );
        if (name === "disabled" && posterControl) return undefined;
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (node) => ts.visitNode(node, visit);
  }];
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
