import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Rexonance prose can wrap long calls without modifying comparison typography", () => {
  const css = readFileSync(new URL("../public/rexonance-archive-update.css", import.meta.url), "utf8");
  const article = css.match(/#saga-forms-performance-v5 \.form-detail \.rexonance-finisher-grid article \{([^}]+)\}/)?.[1];
  const paragraph = css.match(/#saga-forms-performance-v5 \.form-detail \.rexonance-finisher-grid p \{([^}]+)\}/)?.[1];
  assert.match(article || "", /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(paragraph || "", /min-width: 0/);
  assert.match(paragraph || "", /overflow-wrap: anywhere/);
  assert.doesNotMatch(`${article}${paragraph}`, /font-size|line-height/);
});
