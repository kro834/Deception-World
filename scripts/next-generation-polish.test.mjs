import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  worldMode,
  loadGate,
  worldHome,
  worldChrome,
  dream,
  dreamStyles,
  worldPolishStyles,
  worldDialogStyles,
  worldAddonStyles,
  globalStyles,
  zeusButton,
  riderRoute,
  downloadRoute,
  exportRoute,
  sourceSync,
] = await Promise.all([
  read("src/components/world/use-world-mode.ts"),
  read("src/components/load-gate.tsx"),
  read("src/components/world/world-home.tsx"),
  read("src/components/world/world-chrome.tsx"),
  read("src/components/dream-chapter/dream-chapter.tsx"),
  read("src/styles-dream-chapter.css"),
  read("src/styles-world/25.css"),
  read("src/styles-world/07.css"),
  read("src/styles-world-addon.css"),
  read("src/styles.css"),
  read("src/components/zeus-button.tsx"),
  read("src/routes/riders/$id.tsx"),
  read("src/routes/download.tsx"),
  read("src/routes/api/export.ts"),
  read("scripts/sync-source-parts.mjs"),
]);

test("world mode publishes coalesced, passive scroll progress", () => {
  assert.match(worldMode, /--page-progress/);
  assert.match(worldMode, /requestAnimationFrame\(syncPageProgress\)/);
  assert.match(worldMode, /addEventListener\("scroll", requestProgressSync, \{ passive: true \}\)/);
  assert.match(worldMode, /data(?:set\.)?pageScrolled|dataset\.pageScrolled/);
});

test("content protection stays outside the route-loading interaction guard", () => {
  assert.doesNotMatch(loadGate, /addEventListener\("(?:copy|cut|paste|contextmenu|selectstart)"/);
});

test("world hero work pauses offscreen and primary navigation reports location", () => {
  assert.match(worldHome, /if \([^\n]*!heroVisible\) return/);
  assert.match(worldHome, /aria-current=\{activeSection === "story" \? "location" : undefined\}/);
  assert.match(worldHome, /aria-current=\{activeSection === "riders" \? "location" : undefined\}/);
  assert.match(worldHome, /aria-current=\{activeSection === "records" \? "location" : undefined\}/);
});

test("world motion and poster changes stay stable on constrained clients", () => {
  assert.match(worldHome, /prefers-reduced-motion: reduce/);
  assert.match(worldHome, /motionReduced/);
  assert.match(worldHome, /finalImage\s*\.decode\?\.\(\)/);
  assert.match(worldHome, /Promise\.race\(\[/);
  assert.match(worldHome, /finalImage\.naturalWidth > 0/);
});

test("manager archive cards use bounded thumbnail assets", async () => {
  const names = ["zeus", "rex-loi", "shuza", "lejas-portrait", "opus", "reemu"];
  for (const name of names) {
    const path = `public/manager-${name}-thumb.jpeg`;
    assert.match(worldHome, new RegExp(`/manager-${name}-thumb\\.jpeg`));
    assert.ok((await stat(new URL(`../${path}`, import.meta.url))).size < 180_000, path);
  }
});

test("detail pages share the accessible dossier navigation chrome", async () => {
  assert.match(worldChrome, /export function DossierTopbar/);
  assert.match(worldChrome, /<SideMenuTrigger/);
  assert.match(worldChrome, /<SideMenuLayer/);
  const detailPages = await Promise.all(
    ["rider-page.tsx", "manager-stub.tsx", "related-page.tsx", "lejas-page.tsx"].map((file) =>
      read(`src/components/world/${file}`),
    ),
  );
  detailPages.forEach((source) => assert.match(source, /<DossierTopbar/));
});

test("unknown rider paths are rejected instead of silently showing Saga", () => {
  assert.match(riderRoute, /beforeLoad/);
  assert.match(riderRoute, /throw notFound\(\)/);
  assert.match(riderRoute, /createRiderHead/);
});

test("Dream Chapter provides landmark navigation, staged reveals, and modal scroll restoration", () => {
  assert.match(dream, /className="dream-chapter-nav"/);
  assert.match(dream, /data-dream-reveal/);
  assert.match(dream, /lockDreamViewport/);
  assert.match(dream, /window\.scrollTo\(\{ top: scrollY, left: 0, behavior: "auto" \}\)/);
  assert.match(dreamStyles, /min-height:\s*100svh/);
  assert.match(dreamStyles, /prefers-reduced-motion:\s*reduce/);
  assert.match(dreamStyles, /#dolminence\s*\{[^}]*contain-intrinsic-size:\s*auto\s+2810px/s);
  assert.match(
    dreamStyles,
    /\.dream-dossier-dialog \.dream-dossier-close\[data-liquid-pointer\]\s*\{[^}]*position:\s*fixed/s,
  );
});

test("Dream Chapter pauses its hero offscreen and keeps ambient drift compositor-friendly", () => {
  assert.match(dream, /ref=\{heroRef\}/);
  assert.match(dream, /data-dream-hero-active=\{heroVisible \? "true" : "false"\}/);
  assert.match(
    dreamStyles,
    /\.dream-hero\[data-dream-hero-active="false"\][\s\S]{0,1000}animation-play-state:\s*paused/,
  );
  assert.match(
    dreamStyles,
    /@media \(max-width:\s*760px\), \(hover:\s*none\) and \(pointer:\s*coarse\)[\s\S]*?clip-path:\s*none/,
  );

  const starDriftStart = dreamStyles.indexOf("@keyframes dream-star-drift");
  const starDriftEnd = dreamStyles.indexOf("@keyframes dream-orbit", starDriftStart);
  assert.ok(starDriftStart >= 0 && starDriftEnd > starDriftStart);
  const starDrift = dreamStyles.slice(starDriftStart, starDriftEnd);
  assert.match(starDrift, /translate3d\(/);
  assert.doesNotMatch(starDrift, /background-position/);
});

test("long mobile dossiers retain a visible close control and floating UI avoids hero actions", () => {
  assert.match(
    worldPolishStyles,
    /\.form-pickup-dialog \.form-pickup-close\[data-liquid-pointer\]\s*\{[^}]*position:\s*sticky/s,
  );
  assert.match(zeusButton, /"\.dream-hero-actions a"/);
  assert.match(zeusButton, /"\.dream-dossier-close"/);
  assert.match(worldDialogStyles, /:has\(\.form-pickup-dialog\[open\]\)/);
  assert.match(worldDialogStyles, /:has\(\.dante-denied-dialog\[open\]\)/);

  const columnDialog = worldHome.indexOf('className="world-column-dialog"');
  const columnClose = worldHome.indexOf('className="world-column-dialog-close"', columnDialog);
  const columnScrollSurface = worldHome.indexOf(
    'className="world-column-dialog-card"',
    columnDialog,
  );
  assert.ok(columnDialog >= 0 && columnClose > columnDialog && columnClose < columnScrollSurface);

  assert.match(
    worldAddonStyles,
    /html\s+\.side-panel\s*>\s*\.side-panel-head\s*\{[^}]*position:\s*sticky/s,
  );
  assert.match(
    worldAddonStyles,
    /max-width:\s*920px[^}]*max-height:\s*560px[^}]*orientation:\s*landscape/,
  );
  assert.match(
    globalStyles,
    /\.zeus-button\[data-menu-open="true"\]\s*\{[^}]*pointer-events:\s*none/s,
  );
});

test("downloads point at the real repository archive", () => {
  assert.match(downloadRoute, /Deception-World\/archive\/refs\/heads\/main\.zip/);
  assert.match(exportRoute, /status:\s*302/);
  assert.match(exportRoute, /Deception-World\/archive\/refs\/heads\/main\.zip/);
});

test("authoritative source can safely refresh every checked-in part group", () => {
  assert.match(sourceSync, /source-parts/);
  assert.match(sourceSync, /writeFile/);
  assert.match(sourceSync, /listPartGroups/);
});
