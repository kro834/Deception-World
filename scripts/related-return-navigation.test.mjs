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
  assert.match(worldHome, /id="manager-archive-other" className="manager-archive-return-anchor"/);
  assert.match(
    worldHome,
    /locationHash !== "manager-archive-other"[\s\S]*?setManagerTab\(2\)[\s\S]*?syncRail\(managerRail\.current, 2\)/,
  );
  assert.match(
    worldStyles,
    /#manager-archive-other[\s\S]*?scroll-margin-top:\s*calc\(96px \+ env\(safe-area-inset-top\)\)/,
  );
});
