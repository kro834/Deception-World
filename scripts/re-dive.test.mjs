import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CIEL_THUMBNAIL, cielThumbnail } from "../src/lib/thumbnail-images.ts";
import {
  RE_DIVE,
  RE_DIVE_ART_NATURAL,
  RE_DIVE_CHAR_FROM,
  RE_DIVE_CORE,
  reDiveEdgeHeight,
  reDiveFraming,
  reDiveUniformsAt,
} from "../src/components/world/re-dive-timing.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const samples = (step = 1 / 120, until = RE_DIVE.landed + RE_DIVE.leave) => {
  const out = [];
  for (let T = 0; T <= until + 1e-9; T += step) out.push({ T, ...reDiveUniformsAt(T) });
  return out;
};

test("the transition starts on the end still and lands on the ground alone", () => {
  assert.deepEqual(reDiveUniformsAt(0), { zoom: 1, blur: 0, dive: 0, lift: 0, warp: 0, land: 0 });
  const landed = reDiveUniformsAt(RE_DIVE.landed);
  assert.equal(landed.land, 1);
  assert.equal(landed.dive, 0);
  assert.equal(landed.blur, 0);
  assert.equal(landed.warp, 0);
  assert.ok(RE_DIVE.land[1] <= RE_DIVE.landed, "the ground is whole before the page takes over");
  assert.ok(RE_DIVE.reducedLanded < RE_DIVE.landed);
});

test("the camera only goes in, and the ground only comes up", () => {
  const all = samples();
  for (let index = 1; index < all.length; index += 1) {
    assert.ok(all[index].zoom <= all[index - 1].zoom + 1e-9, `zoom pulls back at ${all[index].T}`);
    assert.ok(all[index].land >= all[index - 1].land - 1e-9, `ground recedes at ${all[index].T}`);
    assert.ok(
      all[index].lift >= all[index - 1].lift - 1e-9,
      `the art dims again at ${all[index].T}`,
    );
  }
});

test("one slow amber swell: no flashing (at most one brightening, under 1 per second)", () => {
  const all = samples();
  let peaks = 0;
  for (let index = 1; index < all.length - 1; index += 1) {
    const [before, now, after] = [all[index - 1].warp, all[index].warp, all[index + 1].warp];
    if (now > before && now >= after && now > 0.05) peaks += 1;
  }
  assert.equal(peaks, 1);
  // The swell takes longer than a second to come and go.
  assert.ok(RE_DIVE.warp[2] - RE_DIVE.warp[0] >= 1);
  // It rises over at least a third of a second (no step).
  assert.ok(RE_DIVE.warp[1] - RE_DIVE.warp[0] >= 1 / 3);
});

test("the dive goes into the art's core on every screen shape", () => {
  for (const [width, height] of [
    [412, 915],
    [390, 844],
    [768, 1024],
    [1440, 900],
    [2560, 1080],
  ]) {
    const { map, focus, feather } = reDiveFraming(width, height);
    const art = { x: focus.x * map[0] + map[2], y: focus.y * map[1] + map[3] };
    assert.ok(Math.abs(art.x - RE_DIVE_CORE.x) < 1e-9, `${width}x${height} x`);
    assert.ok(Math.abs(art.y - RE_DIVE_CORE.y) < 1e-9, `${width}x${height} y`);
    assert.ok(focus.x > 0 && focus.x < 1 && focus.y > 0 && focus.y < 1);
    // Landscape screens fit the rider by height with feathered sides, like .rw-end-art.
    assert.equal(feather[3], width / height >= 3 / 4 ? 1 : 0);
  }
  // Portrait: cover at 50% 30%.
  const phone = reDiveFraming(412, 915);
  const scale = Math.max(412 / RE_DIVE_ART_NATURAL.width, 915 / RE_DIVE_ART_NATURAL.height);
  assert.ok(
    Math.abs(
      phone.map[3] +
        ((915 - RE_DIVE_ART_NATURAL.height * scale) * 0.3) / (RE_DIVE_ART_NATURAL.height * scale),
    ) < 1e-9,
  );
});

test("the shader, the stage and the section draw the same ground", async () => {
  const css = stripComments(await read("src/styles-world-re-dive.css"));
  const clamp = css.match(/--re-dive-edge-h:\s*clamp\((\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/);
  assert.ok(clamp, "the lip's height is a clamp()");
  const [, min, vw, max] = clamp.map(Number);
  for (const width of [320, 412, 600, 900, 1440, 2560]) {
    assert.equal(reDiveEdgeHeight(width), Math.min(max, Math.max(min, (width * vw) / 100)));
  }
  assert.match(
    css,
    new RegExp(
      `\\.re-dive-char\\s*\\{[^}]*top:\\s*calc\\(var\\(--rw-ground-top, 0px\\) \\+ var\\(--re-dive-edge-h\\) \\* ${RE_DIVE_CHAR_FROM}\\)`,
    ),
  );
  assert.match(css, /\.re-dive-edge\s*\{[^}]*top:\s*var\(--rw-ground-top, 0px\)/);
  assert.match(css, /\.re-dive-edge\s*\{[^}]*background-size:\s*100% 100%/);
  // Uploads are top-down and the shader works y-down: textures are read as is.
  const shader = stripComments(await read("src/components/world/re-dive.frag.glsl"));
  assert.doesNotMatch(shader, /sampleTop\(/);
  assert.match(shader, /texture2D\(uArt,/);
  assert.match(shader, /texture2D\(uEdgeTex,/);
  // The gate's floor above the section, then the lip from the section's top.
  assert.match(shader, /float gy = px\.y - uGroundTop;/);
});

test("the six signals: シエル first with his illustration and his own page", async () => {
  const section = await read("src/components/world/re-dive-section.tsx");
  const home = await read("src/components/world/world-home.tsx");
  assert.match(section, /const CIEL = RE_DIVE_RIKUEI_NAV\[0\];/);
  assert.match(section, /to=\{CIEL\.href \?\? "\/characters\/ciel"\}/);
  // His card carries his illustration, in the managers' card slot.
  assert.match(
    section,
    /src="\/ciel-thumb-20260924\.jpeg"\s*\{\.\.\.cielThumbnail\(\)\}\s*alt="シエルのキャラクタービジュアル"\s*width=\{640\}\s*height=\{800\}/,
  );

  const order = [
    ...section.matchAll(
      /<(GuardedLink|VacantSignal)[\s\S]*?(?:aria-label="六詠([IV]+)|numeral="([IV]+)")/g,
    ),
  ].map(([, , linked, vacant]) => linked ?? vacant);
  assert.deepEqual(order, ["I", "II", "III", "IV", "V", "VI"]);
  assert.match(section, /aria-label="六詠I シエルの個別資料を開く"/);
  assert.match(section, /<b>シエル<\/b>/);
  assert.match(section, /<VacantSignal numeral="III"/);
  assert.match(section, /<VacantSignal numeral="VI"/);
  assert.match(section, /aria-label=\{`六詠\$\{numeral\} 欠番`\}/);
  assert.match(section, /<b>欠番<\/b>/);
  assert.doesNotMatch(section, /zeus/i, "rank I is シエル, not Zeus");
  for (const manager of ["rex-loi", "lejas", "opus"]) {
    assert.match(section, new RegExp(`to="/managers/${manager}"`));
  }
  // The archive's own box: same classes and words as the Deception World 六詠.
  for (const needle of [
    'className="threat-panel',
    'className="manager-slot-grid signal-array"',
    'aria-label="六詠を示す6つのシグナル"',
    "MANAGER ARCHIVE",
    "SIX SIGNALS",
    "ABOVE THE WORLD.",
    "OPEN DOSSIER",
  ]) {
    assert.ok(section.includes(needle), `section: ${needle}`);
    assert.ok(home.includes(needle), `archive: ${needle}`);
  }
});

test("シエル's thumbnails: the supplied illustration, cropped and right-sized", () => {
  const publicFile = (path) => new URL(`../public${path}`, import.meta.url);
  const supplied = readFileSync(publicFile("/ciel-illustration-20260924.webp"));
  assert.equal(
    createHash("md5").update(supplied).digest("hex"),
    "3866f0581f4ccbf8ce01f5394c98be9c",
  );
  const webpWidth = (bytes) => {
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    const chunk = bytes.subarray(12, 16).toString("ascii");
    if (chunk === "VP8 ") return bytes.readUInt16LE(26) & 0x3fff;
    if (chunk === "VP8L") return (bytes.readUInt32LE(21) & 0x3fff) + 1;
    return bytes.readUIntLE(24, 3) + 1;
  };
  let previous = { width: 0, size: 0 };
  for (const variant of CIEL_THUMBNAIL.variants) {
    const bytes = readFileSync(publicFile(variant.path));
    assert.equal(webpWidth(bytes), variant.width, variant.path);
    assert.ok(variant.width > previous.width && bytes.length > previous.size, variant.path);
    assert.ok(bytes.length <= (variant.width <= 480 ? 70_000 : 110_000), `${variant.path} weight`);
    previous = { width: variant.width, size: bytes.length };
  }
  assert.ok(statSync(publicFile(CIEL_THUMBNAIL.source)).size > 0);
  const { srcSet, sizes } = cielThumbnail();
  assert.equal(srcSet, "/ciel-thumb-20260924-480.webp 480w, /ciel-thumb-20260924.webp 640w");
  assert.match(sizes, /^\(max-width: 560px\) max\(40vw, 170px\)/);
});

test("RE DIVE…? is offered at the end still only, outside the SKIP / もう一度 spot", async () => {
  const component = await read("src/components/world/rising-world.tsx");
  const controls = component.slice(
    component.indexOf('className="rw-controls"'),
    component.indexOf("</div>", component.indexOf('className="rw-controls"')),
  );
  assert.doesNotMatch(controls, /rw-redive-button/);
  assert.match(
    component,
    /\{ended && reDive === "idle" \? \(\s*<button[\s\S]*?className="rw-redive-button"[\s\S]*?>\s*RE DIVE…\?\s*<\/button>/,
  );
  // The section is rendered only once reached (or linked), never on the server.
  assert.match(component, /useSyncExternalStore\(subscribeUnlock, readUnlocked, \(\) => false\)/);
  assert.match(component, /\{unlocked \? \(?\s*<ReDiveSection/);
  // Browser back from a card lands on the section, not on the World's top.
  assert.match(component, /window\.history\.replaceState\(\s*window\.history\.state,/);
  const css = stripComments(await read("src/styles-world-re-dive.css"));
  // Motion only for readers who have not asked for less.
  for (const name of ["re-dive-rise", "re-dive-offer"]) {
    const use = css.indexOf(`animation: ${name}`);
    assert.ok(use > 0, name);
    const media = css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", use);
    assert.ok(media > 0, `${name} is gated`);
    const between = css.slice(media, use);
    // Still inside the media block: its brace and the rule's are open.
    assert.equal(between.split("{").length - between.split("}").length, 2, `${name} is gated`);
  }
});

test("the RE DIVE sheet sits between the rising sheet and the Mirage face", async () => {
  const route = await read("src/routes/world.tsx");
  assert.match(route, /import worldReDiveCssUrl from "@\/styles-world-re-dive\.css\?url";/);
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  const order = [
    "href: worldRisingCssUrl",
    "href: worldReDiveCssUrl",
    "href: MIRAGE_FONTS_URL",
    "href: worldMirageCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(
    order.every((index, i) => index > 0 && (i === 0 || index > order[i - 1])),
    String(order),
  );
});

test("usability: RE DIVE in the menu once reached, the offer not pressable while unseen", async () => {
  const menu = await read("src/components/world/world-chrome.tsx");
  assert.match(menu, /window\.sessionStorage\.getItem\("dw-re-dive"\) === "1"/);
  assert.match(menu, /\{reDiveReached \? \(\s*<GuardedLink to="\/world" hash="re-dive"/);
  const css = stripComments(await read("src/styles-world-re-dive.css"));
  assert.match(css, /@keyframes re-dive-offer \{\s*from \{\s*visibility: hidden;/);
  // The vacant slots stay readable.
  assert.match(css, /\.signal\.is-vacant > span \{\s*color: rgb\(255 214 190 \/ 0\.6\);/);
});
