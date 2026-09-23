import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const relatedPage = read("src/components/world/related-page.tsx");
const dossierNav = read("src/components/world/dossier-nav.tsx");
const worldHome = read("src/components/world/world-home.tsx");
const worldStyles = read("src/styles-world/21.css");

test("related dossiers return to the Other archive tab through a stable native hash target", () => {
  assert.match(relatedPage, /returnHash="manager-archive-other"/);
  assert.match(
    dossierNav,
    /currentHref\.startsWith\("\/characters\/"\)[\s\S]*?"manager-archive-other"/,
  );
  assert.match(worldHome, /id="manager-archive-other"\s+className="manager-archive-return-anchor"/);
  assert.match(
    worldHome,
    /locationHash !== "manager-archive-other"[\s\S]*?setManagerTab\(2\)[\s\S]*?syncRail\(managerRail\.current, 2\)/,
  );
  assert.match(
    worldStyles,
    /#manager-archive-other[\s\S]*?scroll-margin-top:\s*calc\(96px \+ env\(safe-area-inset-top\)\)/,
  );
  assert.match(worldStyles, /html\[data-mode="world"\][\s\S]*?scroll-padding-top:\s*calc\(96px \+ env\(safe-area-inset-top\)\)/);
  assert.match(worldStyles, /html\[data-mode="world"\]:has\(\.site-shell\)[\s\S]*?scroll-padding-top:\s*0/);
});

test("World section indicator includes the hash landing on short landscape screens", () => {
  const start = worldHome.indexOf("const syncActiveSection = () => {");
  const end = worldHome.indexOf("const requestSectionSync = () => {", start);
  assert.ok(start >= 0 && end > start);
  const sync = worldHome.slice(start, end);
  assert.match(sync, /const landing = parseFloat\(getComputedStyle\(section\)\.scrollMarginTop\) \|\| 0/);
  assert.match(sync, /section\.getBoundingClientRect\(\)\.top <= Math\.max\(marker, landing \+ 8\)/);
});

test("World primary hash targets do not shift when preceding sections leave deferred layout", () => {
  assert.match(
    worldStyles,
    /\.site-shell :is\(\.world-column, \.riders-section\)\s*\{[\s\S]*?content-visibility:\s*visible;[\s\S]*?contain-intrinsic-size:\s*none/,
  );
});
