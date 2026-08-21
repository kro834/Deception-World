import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const cases = [
  {
    file: "public/rexonance-archive-update.css",
    finalTier: '.stage[data-tier="06"] .stage-forms',
  },
  {
    file: "public/realm-archive-update.css",
    finalTier: ".stage[data-tier] .stage-forms",
  },
];

for (const entry of cases) {
  test(`${entry.file} reserves iPad landscape telemetry and progress regions`, () => {
    const css = readFileSync(entry.file, "utf8");

    assert.equal(
      css.match(/max-width: 1440px/g)?.length,
      2,
      "both tablet and iPad landscape rules must cover the 1376px iPad viewport",
    );
    assert.match(css, /@media \(min-width: 901px\) and \(max-width: 1440px\)/);
    assert.match(
      css,
      /\.selected-telemetry \{\s*min-height: 8\.75rem;\s*padding: 0\.82rem 0\.86rem 2rem;/,
    );
    assert.match(
      css,
      /\.telemetry-state \{\s*grid-template-columns: auto minmax\(0, 1fr\);\s*grid-template-rows: auto auto;/,
    );
    assert.match(css, /\.v6s-progress-rail \{\s*inset: auto 0\.88rem 0\.72rem;/);
    assert.match(
      css,
      new RegExp(
        `${entry.finalTier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{\\s*grid-template-columns: minmax\\(0, 1fr\\);`,
      ),
    );
  });
}
