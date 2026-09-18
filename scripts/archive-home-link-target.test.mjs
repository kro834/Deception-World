import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const archives = [
  new URL("../archives/saga-form-archive-standalone.html", import.meta.url),
  new URL("../archives/realm-form-archive-standalone.html", import.meta.url),
  new URL("../public/saga-form-archive-embedded.html", import.meta.url),
  new URL("../public/realm-form-archive-embedded.html", import.meta.url),
];

test("archive home links retain a 48px hit target while their compact sigil stays 32px", () => {
  for (const file of archives) {
    const html = readFileSync(file, "utf8");
    assert.match(html, /\.archive-wordmark \{[\s\S]*?box-sizing: border-box;[\s\S]*?min-height: 3rem;/);
    assert.match(html, /\.archive-wordmark \{ padding-block: 0\.5rem; \}/);
    assert.match(html, /\.archive-wordmark \{ min-width: 3rem; justify-content: center; \}/);
    assert.match(html, /\.wordmark-sigil \{ width: 2rem; \}/);
  }
});
