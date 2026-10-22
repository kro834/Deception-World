import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const style = readFileSync(
  new URL("../src/components/dream-chapter/dream-screening-room.css", import.meta.url),
  "utf8",
);

function mediaBlock(query) {
  const start = style.indexOf(`@media ${query} {`);
  assert.ok(start >= 0, `missing @media ${query}`);
  const open = style.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < style.length; i += 1) {
    if (style[i] === "{") depth += 1;
    if (style[i] === "}") depth -= 1;
    if (depth === 0) return style.slice(open + 1, i);
  }
  assert.fail(`unclosed @media ${query}`);
}

test("narrow short landscape keeps the poster controls beside the caption", () => {
  const phone = mediaBlock("(max-width: 540px)");
  const compactLandscape = mediaBlock("(max-height: 520px) and (orientation: landscape)");

  assert.match(phone, /\.dream-screening-controls\s*\{[^}]*display:\s*grid;/);
  assert.match(phone, /\.dream-screening-actions\s*\{[^}]*display:\s*grid;/);
  assert.match(compactLandscape, /\.dream-screening-controls\s*\{[^}]*display:\s*flex;/);
  assert.match(compactLandscape, /\.dream-screening-caption\s*\{[^}]*flex:\s*1;/);
  assert.match(compactLandscape, /\.dream-screening-actions\s*\{[^}]*display:\s*flex;/);
  assert.match(
    compactLandscape,
    /\.dream-screening-dialog \.dream-screening-ambience,[\s\S]*?\.dream-screening-zoom\s*\{[^}]*width:\s*auto;/,
  );
  assert.ok(
    style.indexOf("@media (max-height: 520px) and (orientation: landscape)") >
      style.indexOf("@media (max-width: 540px)"),
  );
});

test("the compact override is limited to short landscape viewports", () => {
  const narrowLandscape = mediaBlock(
    "(max-width: 540px) and (max-height: 520px) and (orientation: landscape)",
  );
  assert.match(
    narrowLandscape,
    /\.dream-screening-caption > span\s*\{[^}]*-webkit-line-clamp:\s*2;/,
  );
  assert.match(
    narrowLandscape,
    /\.dream-screening-message:has\(\.dream-screening-status:empty\),\s*\.dream-screening-status:empty\s*\{\s*min-height:\s*0;/,
  );
  assert.doesNotMatch(narrowLandscape, /display:\s*none|visibility:\s*hidden/);
  assert.ok(
    style.indexOf(
      "@media (max-width: 540px) and (max-height: 520px) and (orientation: landscape)",
    ) > style.indexOf("@media (max-height: 520px) and (orientation: landscape)"),
  );
});
