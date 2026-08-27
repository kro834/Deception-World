import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const baseStyles = await readFile(
  new URL("../src/styles-world/06.css", import.meta.url),
  "utf8",
);
const responsiveStyles = await readFile(
  new URL("../src/styles-world/09.css", import.meta.url),
  "utf8",
);

test("rider overview copy stays inside the text pane", () => {
  assert.match(
    baseStyles,
    /\.rider-copy-block \{[\s\S]*?width: min\(calc\(47% - 8px\), 640px\);[\s\S]*?min-width: 0;/,
  );
  assert.match(
    baseStyles,
    /\.rider-description \{[\s\S]*?width: 100%;[\s\S]*?overflow-wrap: anywhere;[\s\S]*?word-break: normal;/,
  );
});

test("iPad rider records stack the portrait and copy panes", () => {
  assert.match(
    responsiveStyles,
    /@media \(max-width: 1120px\)[\s\S]*?\.rider-detail \{[\s\S]*?padding: 0;[\s\S]*?\.rider-visual \{[\s\S]*?position: relative;[\s\S]*?width: 100%;[\s\S]*?\.rider-copy-block \{[\s\S]*?width: 100%;/,
  );
});
