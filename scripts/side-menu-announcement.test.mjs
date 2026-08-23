import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const chrome = readFileSync(
  new URL("../src/components/world/world-chrome.tsx", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../src/styles-world/23.css", import.meta.url), "utf8");
const styleIndex = readFileSync(new URL("../src/styles-world.css", import.meta.url), "utf8");
const image = new URL("../public/announcement-who-supreme.jpeg", import.meta.url);

test("the world and archive side menu expose the shared announcement", () => {
  assert.match(chrome, /<p>INFORMATION<\/p>/);
  assert.match(chrome, /className="side-panel-announcement-trigger ios26-glass"/);
  assert.match(chrome, /<span>お知らせ<\/span>/);
  assert.match(chrome, /aria-controls="site-announcement-dialog"/);
  assert.match(chrome, /<h2 id="site-announcement-title">Who Supreme\?<\/h2>/);
  assert.match(chrome, /src="\/announcement-who-supreme\.jpeg"/);
});

test("announcement interaction closes the menu and supports every modal exit", () => {
  assert.match(chrome, /if \(controlled\) close\(\)/);
  assert.match(chrome, /\.querySelector<HTMLButtonElement>\("\.side-panel-close"\)\?\.click\(\)/);
  assert.match(chrome, /dialog\.showModal\(\)/);
  assert.match(
    chrome,
    /onCancel=\{\(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?closeAnnouncement\(\)/,
  );
  assert.match(chrome, /onClick=\{onAnnouncementBackdrop\}/);
  assert.match(chrome, /aria-label="お知らせを閉じる"/);
  assert.match(chrome, /document\.body\.style\.overflow = "hidden"/);
});

test("announcement glass is safe-area aware, independently scrollable, and responsive", () => {
  assert.match(styleIndex, /@import "\.\/styles-world\/23\.css"/);
  assert.match(
    styles,
    /\.site-announcement-dialog \{[\s\S]*?height: 100dvh;[\s\S]*?safe-area-inset-top[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain/,
  );
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
  assert.match(styles, /\.site-announcement-dialog::backdrop \{[\s\S]*?backdrop-filter: blur/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(
    styles,
    /\.site-announcement-copy \{[\s\S]*?padding: 2px clamp\(88px, 25vw, 108px\) 8px 4px/,
  );
  assert.match(styles, /@media \(orientation: landscape\) and \(max-height: 600px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /@media \(prefers-reduced-transparency: reduce\)/);
});

test("the supplied announcement image is shipped as an optimized local asset", () => {
  assert.equal(existsSync(image), true);
  const bytes = readFileSync(image);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.ok(statSync(image).size < 200_000, "announcement image should remain below 200 KB");
  assert.match(chrome, /width="960"[\s\S]*?height="1441"[\s\S]*?decoding="async"/);
});
