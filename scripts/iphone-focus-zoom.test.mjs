import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// iPhone Safari zooms the page in when a control under 16px takes focus.
// These selects were 12-13px; each gets a phone-only 16px rule (portrait via
// max-width, landscape via a short coarse-pointer screen; an iPad is neither).
const read = (name) => readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");

const cases = [
  ["styles-gallery-controls-polish.css", ".gallery-page .gallery-order select"],
  ["styles-gallery-tour-theatre.css", ".gallery-tour-playback-label select"],
  ["styles-dogs-viewer.css", ".dogs-viewer__toolbar .dogs-viewer__pose"],
];

for (const [file, selector] of cases) {
  test(`${selector} is 16px on phones`, () => {
    const css = read(file);
    const at = css.lastIndexOf("(max-height: 500px) and (pointer: coarse)");
    assert.ok(at > 0, `${file} lacks the landscape phone query`);
    const block = css.slice(css.lastIndexOf("@media", at), css.indexOf("\n}\n", at) + 3);
    assert.ok(block.includes(selector), `${file}: rule is not for ${selector}`);
    assert.match(block, /font-size:\s*16px/);
    assert.match(block, /max-width:\s*(700|560)px/);
  });
}
