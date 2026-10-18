import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import sharp from "sharp";
import { getRouteFamily } from "../src/lib/route-family.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("src/routes/saga-cinema.tsx");
const data = read("src/components/saga-cinema/saga-cinema-data.ts");
const page = read("src/components/saga-cinema/saga-cinema.tsx");
const motion = read("src/components/saga-cinema/use-cinema-motion.ts");
const styles = read("src/components/saga-cinema/saga-cinema.css");
const menu = read("src/components/world/external-cinema-link.tsx");
const menuStyles = read("src/components/world/external-cinema-link.css");
const chrome = read("src/components/world/world-chrome.tsx");
const releaseIdentity = read("scripts/build-release-identity.mjs");
const publicVerifier = read("scripts/verify-public-deployment.mjs");
const routeTree = read("src/routeTree.gen.ts");

const films = [
  ["邂逅", "KAIKŌ", "第一部", "chapter-1.jpg"],
  ["覚醒", "KAKUSEI", "第二部", "chapter-2.jpg"],
  ["激情", "GEKIJŌ", "第三部", "chapter-3.jpg"],
  ["終末", "SHŪMATSU", "第四部", "chapter-4.jpg"],
];

test("quadrilogy keeps the four source titles and resolves each poster locally", () => {
  assert.equal((data.match(/\btitle:/gu) ?? []).length, 4);
  for (const [title, roman, part, image] of films) {
    assert.ok(data.includes(`title: "${title}"`), `${title} title`);
    assert.ok(data.includes(`roman: "${roman}"`), `${title} roman title`);
    assert.ok(data.includes(`part: "${part}"`), `${title} part`);
    const asset = `/saga-cinema-assets/${image}`;
    assert.ok(data.includes(`image: "${asset}"`), `${title} poster reference`);
    assert.ok(existsSync(new URL(`../public${asset}`, import.meta.url)), `${asset} exists`);
  }
  assert.match(data, /SAGA_CINEMA_TITLE\s*=\s*"映画『仮面ライダーサーガ』4部作 公式サイト"/u);
});

test("cinema is a native special route with first-party menu and return navigation", () => {
  assert.match(route, /createFileRoute\("\/saga-cinema"\)/u);
  assert.equal(getRouteFamily("/saga-cinema"), "special");
  assert.match(routeTree, /Route as SagaCinemaRouteImport.*\.\/routes\/saga-cinema/u);
  assert.match(publicVerifier, /"\/saga-cinema"/u);
  assert.match(page, /<SideMenuLayer context="cinema"/u);
  assert.match(page, /to="\/world"[\s\S]{0,80}hash="top"/u);
  assert.match(chrome, /context === "cinema"[\s\S]*?to="\/saga-cinema"/u);
  assert.match(chrome, /<CinemaLink beforeNavigate=\{close\}/u);
  assert.match(menu, /const CINEMA_PATH = "\/saga-cinema"/u);
  assert.match(menu, /href=\{`\$\{CINEMA_PATH\}#top`\}/u);
  assert.match(menuStyles, /menu-thumbnail-20261012\.webp/u);
  assert.match(menuStyles, /--sh-art:/u);
  assert.doesNotMatch(menu, /window\.location\.(?:assign|replace)/u);
  assert.doesNotMatch(menu, /https?:\/\//iu);
});

test("route loads a scoped stylesheet and all chapter art is addressed by local paths", () => {
  assert.match(route, /saga-cinema\.css\?url/u);
  assert.match(route, /href: cinemaCss/u);
  assert.match(styles, /\.saga-cinema\.saga-cinema \.hero/u);
  assert.doesNotMatch(styles, /(?:^|[}\n])\s*(?:html|body|:root)\s*[,{]/u);
  for (const [, , , image] of films) {
    assert.ok(styles.includes(`/saga-cinema-assets/${image}`), `${image} is used as local art`);
  }
  for (const asset of [
    ...films.map(([, , , image]) => `/saga-cinema-assets/${image}`),
    "/saga-cinema-assets/saga-logo-original.webp",
    "/saga-cinema-assets/menu-thumbnail.webp",
    "/saga-cinema-assets/menu-thumbnail-20261012.webp",
    "/saga-cinema-assets/michroma-latin.woff2",
  ]) {
    assert.ok(releaseIdentity.includes(`"${asset}"`), `${asset} is included in release identity`);
  }
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
});

test("cinema menu uses native-resolution poster art without loading it while closed", async () => {
  const asset = new URL("../public/saga-cinema-assets/menu-thumbnail-20261012.webp", import.meta.url);
  const bytes = readFileSync(asset);
  const meta = await sharp(bytes).metadata();
  const original = await sharp(new URL("../public/saga-cinema-assets/chapter-4.jpg", import.meta.url).pathname).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, original.width);
  assert.equal(meta.height, original.height);
  assert.ok(meta.width >= 800, "high-DPI menu must not reuse the 192px thumbnail");
  assert.ok(bytes.length < 300_000, "native-resolution menu image stays under 300KB");
  assert.match(menuStyles, /\[data-open="true"\][\s\S]*menu-thumbnail-20261012/u);
  assert.doesNotMatch(menu, /menu-thumbnail|rel="preload"/u);
});

test("reduced-motion preferences and animated resources are cleaned up", () => {
  assert.match(motion, /matchMedia\("\(prefers-reduced-motion:\s*reduce\)"\)/u);
  assert.match(motion, /media\.addEventListener\("change"/u);
  assert.match(motion, /media\.removeEventListener\("change"/u);
  assert.match(motion, /observer\.disconnect\(\)/u);
  assert.match(motion, /cancelAnimationFrame\(frame\)/u);
  assert.match(motion, /removeEventListener\("resize"/u);
  assert.match(page, /timers\.forEach\(\(timer\) => clearTimeout\(timer\)\)/u);
  assert.match(page, /if \(ref\.current\?\.open\) ref\.current\.close\(\)/u);
});

test("route arrival has no second opening dialog and catalogue dialogs remain accessible", () => {
  assert.match(page, /aria-label="メインナビゲーション"/u);
  assert.match(page, /onKeyDown=\{chapterKeyboard\}/u);
  // Entry belongs to the route curtain; an automatic post-navigation modal/replay is a second intro.
  assert.doesNotMatch(
    page,
    /id="opening"|id="opening-skip"|id="enter-world"|id="replay-intro"|saga-opening-v2|openingInitializedRef|replayOpening/u,
  );
  assert.match(page, /id="film-dialog"[\s\S]*?aria-labelledby="dialog-title"/u);
  assert.match(page, /aria-label="作品情報を閉じる"/u);
  assert.match(page, /id="gallery-dialog"[\s\S]*?aria-label="メインビジュアル ギャラリー"/u);
  assert.match(page, /aria-label="ギャラリーを閉じる"/u);
  assert.match(styles, /:focus-visible/u);
});
