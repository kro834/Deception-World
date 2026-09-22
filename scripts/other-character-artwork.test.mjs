import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const component = read("../src/components/world/other-artwork-card.tsx");
const worldHome = read("../src/components/world/world-home.tsx");
const styles = read("../src/styles-other-artwork.css");

const artwork = [
  {
    id: "haiku",
    name: "ハイク",
    image: "/character-haiku-20260923.webp",
    thumb: "/character-haiku-20260923-thumb.webp",
  },
  {
    id: "fable",
    name: "フェイブル",
    image: "/character-fable-20260923.webp",
    thumb: "/character-fable-20260923-thumb.webp",
  },
];

test("the supplied names map only to their matching full and thumbnail artwork", () => {
  assert.match(component, /do not invent profile information/);
  for (const item of artwork) {
    const record = component.slice(
      component.indexOf(`id: "${item.id}"`),
      component.indexOf("},", component.indexOf(`id: "${item.id}"`)) + 2,
    );
    assert.match(record, new RegExp(`name: "${item.name}"`));
    assert.ok(record.includes(`image: "${item.image}"`));
    assert.ok(record.includes(`thumb: "${item.thumb}"`));
    assert.ok(component.includes("alt={`${artwork.name}のキャラクタービジュアル全体`}"));
  }
  assert.doesNotMatch(component, /人物紹介|年齢|身長|能力|設定/);
});

test("all four delivered WebP assets are valid and lightweight", () => {
  for (const item of artwork) {
    for (const source of [item.image, item.thumb]) {
      const url = new URL(`../public${source}`, import.meta.url);
      const bytes = readFileSync(url);
      assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", source);
      assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", source);
      assert.ok(statSync(url).size < 200 * 1024, `${source} should remain below 200 KB`);
    }
  }
});

test("the Other archive keeps Terra and Luna and fills exactly six slots", () => {
  const panel = worldHome.slice(
    worldHome.indexOf('className="manager-archive-panel is-other"'),
    worldHome.indexOf(
      "</div>\n              </div>",
      worldHome.indexOf('className="manager-archive-panel is-other"'),
    ),
  );
  assert.match(panel, /to="\/characters\/terra"/);
  assert.match(panel, /value="テラ・アレイン"/);
  assert.match(panel, /to="\/characters\/luna"/);
  assert.match(panel, /value="ルナ・アレイン"/);
  assert.match(panel, /OTHER_ARTWORK\.map\(\(artwork\) =>/);
  assert.match(panel, /Array\.from\(\{ length: 2 \}/);
  assert.match(panel, /index=\{index \+ 5\}/);
  assert.equal(2 + artwork.length + 2, 6);
});

test("native dialog close paths cannot leave the page scroll lock behind", () => {
  assert.match(component, /dialog\.current\.showModal\(\)/);
  assert.match(component, /onClose=\{\(\) => \{\s*setOpen\(false\)/);
  assert.match(
    component,
    /if \(event\.target === event\.currentTarget\) dialog\.current\?\.close\(\)/,
  );
  assert.match(
    component,
    /onClick=\{\(event\) => \{\s*keyboardOpened\.current = event\.detail === 0;\s*dialog\.current\?\.close\(\)/,
  );
  assert.match(styles, /:is\(html, body\):has\(\.other-artwork-dialog\[open\]\)/);
  assert.match(styles, /:has\(\.other-artwork-dialog\[open\]\)\s*\{[^}]*overflow: hidden/s);
  assert.doesNotMatch(
    component,
    /document\.(?:body|documentElement)\.style|classList\.(?:add|toggle)/,
  );
});

test("keyboard and pointer closures restore an appropriate trigger state", () => {
  assert.match(component, /keyboardOpened\.current = event\.detail === 0/);
  assert.match(
    component,
    /keyboardOpened\.current\) trigger\.current\?\.focus\(\{ preventScroll: true \}\)/,
  );
  assert.match(component, /else trigger\.current\?\.blur\(\)/);
  assert.match(component, /aria-haspopup="dialog"/);
  assert.match(component, /aria-labelledby=\{`\$\{dialogId\}-title`\}/);
});

test("artwork opens without automatically highlighting its close button", () => {
  assert.match(
    component,
    /showModal\(\)[\s\S]*?dialog\.current\.focus\(\{ preventScroll: true \}\)/,
  );
  assert.match(component, /tabIndex=\{-1\}/);
  assert.match(component, /tabIndex=\{-1\}\s*autoFocus/);
  assert.match(component, /data-input-mode=\{keyboardFocus \? "keyboard" : "pointer"\}/);
  assert.match(
    styles,
    /\.other-artwork-dialog:focus-visible\s*\{\s*outline: none;\s*box-shadow: none;/,
  );
  assert.match(
    styles,
    /\[data-input-mode="pointer"\] \.other-artwork-viewer button:focus\s*\{\s*outline: none;/,
  );
  assert.match(styles, /\.other-artwork-viewer button:focus-visible\s*\{\s*outline: 3px solid/);
  assert.match(component, /onKeyDownCapture=[\s\S]*?setKeyboardFocus\(true\)/);
  assert.match(component, /onPointerDownCapture=[\s\S]*?setKeyboardFocus\(false\)/);
});
