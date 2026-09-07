import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readProjectFile = (relativePath) =>
  readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const dataSource = readProjectFile("src/components/dream-chapter/dream-chapter-data.ts");
const pageSource = readProjectFile("src/components/dream-chapter/dream-chapter.tsx");
const menuSource = readProjectFile("src/components/world/world-chrome.tsx");
const styleSource = readProjectFile("src/styles-dream-chapter.css");
const loadGateSource = readProjectFile("src/components/load-gate.tsx");
const routeTransitionStyleSource = readProjectFile("src/styles-route-transitions.css");
const pickupScrollResetSource = readProjectFile("src/components/world/pickup-scroll-reset.ts");

const routePath = "src/routes/dream-chapter.tsx";
const posterAssets = Array.from(
  { length: 8 },
  (_, index) => `public/dream-chapter-poster-${String(index + 1).padStart(2, "0")}.jpeg`,
);
const posterThumbnailAssets = Array.from(
  { length: 8 },
  (_, index) => `public/dream-chapter-poster-thumb-${String(index + 1).padStart(2, "0")}.jpeg`,
);
const characterAssets = [
  "public/dream-chapter-ciel.jpeg",
  "public/dream-chapter-diluculum.jpeg",
  "public/dream-chapter-keiya.jpeg",
  "public/dream-chapter-keiya-awakened.jpeg",
  "public/dream-chapter-kaisaku.jpeg",
];
const dolminenceAssets = [
  "public/dream-chapter-logo.jpeg",
  "public/dream-chapter-lord-knight.jpeg",
  "public/dream-chapter-lord-chaos.jpeg",
  "public/dream-chapter-lord-chaos-spec.jpeg",
  "public/dream-chapter-dread.jpeg",
  "public/dream-chapter-lupin.jpeg",
];
const allMovieAssets = [...posterAssets, ...characterAssets, ...dolminenceAssets];

function extractExportedArray(source, exportName) {
  const declaration = new RegExp(
    `export const ${escapeRegularExpression(exportName)}(?:\\s*:[^=]+)?\\s*=\\s*\\[`,
  ).exec(source);
  const start = declaration?.index ?? -1;
  assert.notEqual(start, -1, `${exportName} must be exported as an array`);
  const end = source.indexOf("] as const;", start);
  assert.notEqual(end, -1, `${exportName} must retain its const array boundary`);
  return source.slice(start, end + "] as const;".length);
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= buffer.length) return null;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (segmentLength < 7) return null;
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

const escapeRegularExpression = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function extractDolminenceRecord(source, id) {
  const startToken = `    id: "${id}",`;
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `DREAM_DOLMINENCE must contain ${id}`);
  const next = source.indexOf('\n    id: "', start + startToken.length);
  return source.slice(start, next === -1 ? source.length : next);
}

test("Dream Chapter route and side menu expose the movie navigation", () => {
  assert.ok(existsSync(path.join(repositoryRoot, routePath)), `${routePath} must exist`);
  const routeSource = readProjectFile(routePath);

  assert.match(routeSource, /createFileRoute\(["']\/dream-chapter["']\)/);
  assert.match(routeSource, /DreamChapter/);
  assert.match(routeSource, /DREAM CHAPTER/i);
  assert.match(routeSource, /ドリームチャプター/);

  assert.match(
    menuSource,
    /context\?:\s*["']world["']\s*\|\s*["']archive["']\s*\|\s*["']movie["']/,
  );
  assert.match(menuSource, /to=["']\/dream-chapter["']/);
  assert.match(menuSource, /DREAM CHAPTER/);
  assert.match(menuSource, /ドリームチャプター/);

  for (const anchor of ["top", "posters", "characters", "dolminence", "cases"]) {
    assert.match(
      menuSource,
      new RegExp(`to=["']\\/dream-chapter["']\\s+hash=["']${anchor}["']`),
      `movie menu must link to #${anchor}`,
    );
    assert.match(pageSource, new RegExp(`id=["']${anchor}["']`));
  }
});

test("Dream Chapter renders its movie logo and maps all four Dolminence records", () => {
  assert.match(pageSource, /src=["']\/dream-chapter-logo\.jpeg["']/);
  assert.match(pageSource, /DREAM_DOLMINENCE\.map/);
  assert.match(pageSource, /id=["']dolminence["']/);
  assert.match(menuSource, /to=["']\/dream-chapter["']\s+hash=["']dolminence["']/);
  assert.match(menuSource, /DOLMINENCE/);
});

test("Dream Chapter data contains exactly eight posters and three mapped characters", () => {
  const posters = extractExportedArray(dataSource, "DREAM_POSTERS");
  const posterSources = [
    ...posters.matchAll(/src:\s*["'](\/dream-chapter-poster-\d{2}\.jpeg)["']/g),
  ].map((match) => match[1]);

  assert.equal(posterSources.length, 8);
  assert.deepEqual(
    posterSources,
    posterAssets.map((asset) => asset.replace(/^public/, "")),
  );

  const characters = extractExportedArray(dataSource, "DREAM_CHARACTERS");
  const characterIds = [...characters.matchAll(/^\s+id:\s*["']([^"']+)["'],?$/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(characterIds, ["ciel", "keiya", "kaisaku"]);
  assert.equal(new Set(characterIds).size, 3);
  assert.match(characters, /^ {4}name:\s*["']怪作["'],?$/m);
  assert.match(characters, /『幻想郷の夢』の夢主/);
  assert.match(characters, /アルフィクトのなり損ない/);
  assert.match(characters, /portrait:\s*["']\/dream-chapter-kaisaku\.jpeg["']/);
  assert.match(pageSource, /DREAM_CHARACTERS\.map/);
  assert.match(pageSource, />03 FILES</);
});

test("Dolminence contains exactly the four requested agents and identities", () => {
  const dolminence = extractExportedArray(dataSource, "DREAM_DOLMINENCE");
  const ids = [...dolminence.matchAll(/^ {4}id:\s*["']([^"']+)["'],?$/gm)].map((match) => match[1]);
  const names = [...dolminence.matchAll(/^ {4}name:\s*["']([^"']+)["'],?$/gm)].map(
    (match) => match[1],
  );
  const agents = [...dolminence.matchAll(/^ {4}agent:\s*["']([^"']+)["'],?$/gm)].map(
    (match) => match[1],
  );

  assert.deepEqual(ids, ["lord-knight", "lord-chaos", "dread", "lupin"]);
  assert.deepEqual(names, [
    "ロードナイト",
    "ロードケイオス",
    "仮面ライダードレッド",
    "仮面ライダールパン",
  ]);
  assert.deepEqual(agents, [
    "コードナンバー：ワン",
    "コード：ケイオス",
    "コードナンバー：エイト / シンソウ",
    "元コードナンバー：トゥエンティーフォー / サヨ",
  ]);
});

test("Dolminence catalog specifications retain the supplied exact values", () => {
  const expectedProfiles = {
    "lord-knight": [
      ["HEIGHT", "203.0cm（est.）"],
      ["WEIGHT", "78.8kg（est.）"],
      ["PUNCH", "130.0t（est.）"],
      ["KICK", "166.6t（est.）"],
      ["JUMP", "計測不能"],
      ["RUN", "0.3秒（100m est.）"],
      ["FINISHER", "ダークネスエクスキューション / バーディクトダークネスエクスキューション"],
    ],
    "lord-chaos": [
      ["DEVICE", "ロードインヴォーカー"],
      ["CAPSEM", "金のカオスカプセム"],
      ["HEIGHT", "199.5cm（est.）"],
      ["WEIGHT", "83.2kg（est.）"],
      ["PUNCH", "19.6t（est.）"],
      ["KICK", "44.4t（est.）"],
      ["JUMP", "26.4m（ひと跳び est.）"],
      ["RUN", "1.5秒（100m est.）"],
      ["FINISHER", "ナイトメアエクスキューション"],
    ],
    dread: [
      ["HEIGHT", "213.4cm"],
      ["WEIGHT", "150.0kg"],
      ["PUNCH", "136.4t"],
      ["KICK", "144.6t"],
      ["JUMP", "∞（ひと跳び）"],
      ["RUN", "0.4秒（100m）"],
      ["FINISHER", "ドレッドブレイキング"],
    ],
    lupin: [
      ["TRANSFORMER", "サヨ"],
      ["FORMER CODE", "トゥエンティーフォー"],
      ["DEVICE", "ルパンガンナー"],
    ],
  };

  for (const [id, profile] of Object.entries(expectedProfiles)) {
    const record = extractDolminenceRecord(dataSource, id);
    for (const [label, value] of profile) {
      assert.match(
        record,
        new RegExp(
          `label:\\s*["']${escapeRegularExpression(label)}["'],\\s*value:\\s*["']${escapeRegularExpression(value)}["']`,
        ),
        `${id} must retain ${label}: ${value}`,
      );
    }
  }

  assert.ok(
    dataSource.includes(
      "コード：ケイオスが『ロードインヴォーカー』へ金の『カオスカプセム』を装填して擬装した姿。",
    ),
    "ロードケイオスの擬装設定を保持する",
  );
});

test("Dream Chapter cases preserve the six requested text-only records", () => {
  const cases = extractExportedArray(dataSource, "DREAM_CASES");
  const caseRecords = [
    ...cases.matchAll(/\{\s*no:\s*["'](\d)["'],\s*title:\s*["']([^"']+)["']/g),
  ].map(([, no, title]) => ({ no, title }));

  assert.deepEqual(caseRecords, [
    { no: "0", title: "交わる" },
    { no: "1", title: "開く" },
    { no: "2", title: "開ける" },
    { no: "3", title: "明ける" },
    { no: "4", title: "来たる" },
    { no: "5", title: "叛く" },
  ]);
  assert.doesNotMatch(cases, /\b(?:src|image|thumbnail|poster)\s*:/i);
  assert.match(pageSource, /DREAM_CASES\.map/);
});

test("Dream Chapter retains the defining Ciel and Keiya lore", () => {
  for (const requiredLore of [
    "仮面ライダーディルクルムサーガ",
    "マキャベルゴアナイトメア",
    "ディルクルム・アビサルフレーム",
    "拒絶の究極の悪夢",
    "夜明守護命",
    "理解する程度の能力",
    "能力行使の代償については、現在の資料では未記録。",
    "東風谷早苗",
  ]) {
    assert.ok(dataSource.includes(requiredLore), `missing lore: ${requiredLore}`);
  }
});

test("Keiya battle-style names are unique and include the compound style", () => {
  const sectionStart = dataSource.indexOf('title: "バトルスタイル"');
  const sectionEnd = dataSource.indexOf('title: "固有魔法・焔雷"', sectionStart);
  assert.notEqual(sectionStart, -1);
  assert.notEqual(sectionEnd, -1);
  const section = dataSource.slice(sectionStart, sectionEnd);
  const names = [...section.matchAll(/\{\s*name:\s*["']([^"']+)["']/g)].map((match) => match[1]);

  assert.ok(names.length >= 4, "Keiya must retain the full battle-style inventory");
  assert.ok(names.includes("複合スタイル"));
  assert.equal(new Set(names).size, names.length, "battle-style names must be unique");
});

test("all nineteen optimized movie JPEG assets are valid and stay below 700 KB", () => {
  assert.equal(allMovieAssets.length, 19);

  for (const asset of allMovieAssets) {
    const absolutePath = path.join(repositoryRoot, asset);
    assert.ok(existsSync(absolutePath), `${asset} must exist`);
    const size = statSync(absolutePath).size;
    assert.ok(size > 0 && size < 700_000, `${asset} is ${size} bytes`);

    const buffer = readFileSync(absolutePath);
    assert.equal(buffer[0], 0xff, `${asset} must start with a JPEG marker`);
    assert.equal(buffer[1], 0xd8, `${asset} must start with a JPEG SOI marker`);
    assert.equal(buffer.at(-2), 0xff, `${asset} must end with a JPEG marker`);
    assert.equal(buffer.at(-1), 0xd9, `${asset} must end with a JPEG EOI marker`);
    const dimensions = jpegDimensions(buffer);
    assert.ok(dimensions, `${asset} must contain a valid JPEG frame`);
    assert.ok(dimensions.width > 0 && dimensions.height > 0, `${asset} dimensions must be valid`);
  }
});

test("poster controls use dedicated low-traffic thumbnails", () => {
  for (const asset of posterThumbnailAssets) {
    const absolutePath = path.join(repositoryRoot, asset);
    assert.ok(existsSync(absolutePath), `${asset} must exist`);
    const size = statSync(absolutePath).size;
    assert.ok(size > 0 && size < 90_000, `${asset} is ${size} bytes`);
    assert.ok(jpegDimensions(readFileSync(absolutePath)), `${asset} must be a valid JPEG`);
  }
  assert.match(pageSource, /dream-chapter-poster-thumb-/);
});

test("Dream Chapter styles cover phone, tablet, safe-area, and reduced motion", () => {
  assert.match(styleSource, /@media\s*\(max-width:\s*980px\)/);
  assert.match(styleSource, /@media\s*\(max-width:\s*640px\)/);
  assert.match(styleSource, /safe-area-inset-top/);
  assert.match(styleSource, /safe-area-inset-bottom/);
  assert.match(styleSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("Dream Chapter collaboration hero uses approved art without intercepting touch", () => {
  const heroClass = pageSource.indexOf('className="dream-hero"');
  const heroStart = pageSource.lastIndexOf("<section", heroClass);
  const heroEnd = pageSource.indexOf("</section>", heroStart);
  assert.notEqual(heroStart, -1, "Dream Chapter must retain its hero section");
  assert.notEqual(heroEnd, -1, "Dream Chapter hero section must be bounded");
  const heroSource = pageSource.slice(heroStart, heroEnd);

  assert.match(
    heroSource,
    /className=["']dream-(?:ambient-backdrop|hero-field)["']/,
    "the hero needs a dedicated decorative backdrop",
  );
  assert.match(
    heroSource,
    /className="dream-hero-art" src="\/dream-chapter-poster-05.jpeg"/,
    "the collaboration hero reuses the approved character and bamboo scene",
  );
  assert.match(styleSource, /\.dream-(?:ambient-backdrop|hero-field)\s*\{/);
  assert.match(
    styleSource,
    /\.dream-(?:ambient-backdrop|hero-field)[\s\S]*?pointer-events:\s*none/,
    "ambient decoration must never intercept touch input",
  );
});

test("poster archive implements unbiased shuffle, lock, and Liquid Glass controls", () => {
  assert.match(
    pageSource,
    /(?:window\.)?crypto\?*\.getRandomValues|(?:window\.)?crypto\.getRandomValues/,
    "poster shuffle must use real randomized selection when Web Crypto is available",
  );
  assert.match(
    pageSource,
    /for\s*\([^;]+;[^;]+>\s*0;[^)]+\)[\s\S]{0,500}\[[^\]]+\]\s*=\s*\[[^\]]+\]/,
    "poster order must be shuffled instead of advancing through a fixed sequence",
  );
  assert.match(pageSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(pageSource, /aria-label=["']ポスターをシャッフル["']/);
  assert.match(pageSource, /ポスターを固定して自動切替を停止/);
  assert.match(pageSource, /ポスターを固定解除して自動切替を再開/);
  assert.match(pageSource, /aria-pressed=\{[^}]*lock/i);
  assert.match(pageSource, /className=[^\n]*dream-poster-shuffle[^\n]*ios26-glass/);
  assert.match(pageSource, /className=[^\n]*dream-poster-lock[^\n]*ios26-glass/);
  assert.match(pageSource, /data-liquid-pointer=["']true["']/);
  assert.match(pageSource, /window\.clearTimeout/);
});

test("Dream Chapter navigation has a dedicated loading transition", () => {
  const loadingSources = `${loadGateSource}\n${routeTransitionStyleSource}\n${styleSource}`;

  assert.match(
    loadGateSource,
    /["']\/dream-chapter["']/,
    "the shared route gate must recognize Dream Chapter navigation",
  );
  assert.match(
    loadingSources,
    /dream[\s\S]{0,100}(?:gate|loading|dive)|(?:gate|loading|dive)[\s\S]{0,100}dream/i,
    "Dream Chapter needs a named loading/dive presentation rather than an unstyled delay",
  );
  assert.match(
    loadingSources,
    /prefers-reduced-motion:\s*reduce/,
    "the loading transition must respect reduced motion",
  );
  assert.match(loadGateSource, /preloadRoute/);
  assert.match(loadGateSource, /document\.documentElement\.dataset\.loading/);
});

test("all Dream Chapter pickup and poster controls use the shared Liquid Glass interaction", () => {
  assert.match(pageSource, /import\s*\{[^}]*LiquidPointerGlow[^}]*\}/);
  assert.ok(
    (pageSource.match(/className=[^\n>]*ios26-glass/g) ?? []).length >= 6,
    "shuffle, lock, poster tabs, character cards, Dolminence cards, and closes need glass surfaces",
  );
  assert.ok(
    (pageSource.match(/data-liquid-pointer=["']true["']/g) ?? []).length >= 6,
    "every interactive glass surface needs pointer-following light",
  );
  assert.ok(
    (pageSource.match(/<LiquidPointerGlow\s*\/>/g) ?? []).length >= 6,
    "every interactive glass surface needs the shared reflected-light layer",
  );
  assert.match(styleSource, /backdrop-filter:\s*blur\(/);
  assert.match(styleSource, /-webkit-backdrop-filter:\s*blur\(/);
  assert.match(styleSource, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/);
});

test("every pickup resets to its top after showModal and clears pointer focus on close", () => {
  assert.match(
    pageSource,
    /import\s*\{[^}]*settlePickupScroll[^}]*\}\s*from\s*["']@\/components\/world\/pickup-scroll-reset["']/,
  );
  assert.ok(
    (pageSource.match(/settlePickupScroll\s*\(/g) ?? []).length >= 2,
    "both character and Dolminence pickups must use the delayed WebKit-safe reset",
  );
  assert.match(pageSource, /showModal\(\)[\s\S]{0,700}settlePickupScroll/);
  assert.match(pageSource, /event\.detail\s*===\s*0/);
  assert.match(pageSource, /event\.currentTarget\.blur\(\)/);
  assert.match(
    pageSource,
    /document\.activeElement\s+instanceof\s+HTMLElement[\s\S]{0,300}\.blur\(\)/,
    "pointer-opened pickups must not leave a latched focus highlight behind",
  );
  assert.match(pickupScrollResetSource, /ResizeObserver/);
  assert.match(pickupScrollResetSource, /\[90,\s*240,\s*520,\s*900\]/);
  assert.match(pickupScrollResetSource, /pointerdown/);
  assert.match(pickupScrollResetSource, /touchstart/);
});

test("Dream Chapter has explicit iPhone/iPad layouts and bounded mobile dialogs", () => {
  assert.match(
    styleSource,
    /@media\s*\(max-width:\s*(?:1080|1100|1180|1200)px\)/,
    "iPad landscape needs its own breakpoint instead of falling through to desktop",
  );
  assert.match(styleSource, /@media\s*\(max-width:\s*640px\)/);
  assert.match(styleSource, /safe-area-inset-top/);
  assert.match(styleSource, /safe-area-inset-bottom/);
  assert.match(styleSource, /\.dream-dossier-dialog[\s\S]{0,500}overscroll-behavior:\s*contain/);
  assert.match(styleSource, /\.dream-dossier-shell[\s\S]{0,500}max-width/);
  assert.match(styleSource, /touch-action:\s*manipulation/);
  assert.match(styleSource, /overflow-x:\s*(?:hidden|clip)/);
});

test("Dream Chapter motion and image work is throttled for mobile performance", () => {
  assert.match(styleSource, /content-visibility:\s*auto/);
  assert.match(styleSource, /contain-intrinsic-size:/);
  assert.ok(
    (pageSource.match(/loading=["']lazy["']/g) ?? []).length >= 4,
    "offscreen posters and dossier art must stay lazy-loaded",
  );
  assert.match(pageSource, /decoding=["']async["']/);
  assert.match(pageSource, /fetchPriority=["']high["']/);
  assert.match(pageSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(styleSource, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(styleSource, /animation:\s*none\s*!important/);
  assert.match(styleSource, /transition:\s*none\s*!important/);
});
