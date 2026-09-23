import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MIRAGE_BOOT_GATE_SCRIPT, MIRAGE_BOOT_KEY } from "../src/lib/mirage-boot-gate.js";
import { prefersLightweightRendering } from "../src/lib/rendering-profile.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readCss = async () =>
  (await read("src/styles-world-mirage.css")).replace(/\/\*[\s\S]*?\*\//g, "");

const splitSelectors = (group) => {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of group) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  return [...parts, current.trim()];
};

// Style rules with their selector and body, skipping keyframe stops.
const styleRules = (css) =>
  [...css.matchAll(/(?:^|[{};])\s*([^{};@\s][^{};]*)\{([^{}]*)\}/g)]
    .map((match) => ({ selector: match[1].trim().replace(/\s+/g, " "), body: match[2] }))
    .filter(
      ({ selector }) => !/^(?:from|to|[\d.]+%)(?:\s*,\s*(?:from|to|[\d.]+%))*$/.test(selector),
    );

const keyframes = (css) =>
  Object.fromEntries(
    [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );

// Strip leading html qualifiers such as :not(...), :is(...) and [...].
const stripHtmlQualifiers = (selector) => {
  let rest = selector.slice(4);
  while (rest.startsWith(":") || rest.startsWith("[")) {
    const open = rest.startsWith("[") ? "[" : "(";
    const close = open === "[" ? "]" : ")";
    let depth = 0;
    let index = rest.indexOf(open);
    for (; index < rest.length; index += 1) {
      if (rest[index] === open) depth += 1;
      if (rest[index] === close) depth -= 1;
      if (depth === 0) break;
    }
    rest = rest.slice(index + 1);
  }
  return rest;
};

const inScope = (part) => {
  if (part.startsWith('html[data-mode="world"]')) {
    return part.includes("body:has(.site-shell.film-edition.mirage-edition)");
  }
  const rest = part.startsWith("html") ? stripHtmlQualifiers(part).trimStart() : part;
  return /^\.site-shell\.film-edition\.(?:motion-on\.)?mirage-edition(?![\w-])/.test(rest);
};

test("Mirage layer and its HUD face load last on /world only", async () => {
  const route = await read("src/routes/world.tsx");
  assert.match(route, /import worldMirageCssUrl from "@\/styles-world-mirage\.css\?url";/);
  assert.match(route, /family=Michroma&display=swap&text=/);
  const links = route.slice(route.search(/stylesheetLinks:\s*\[/));
  assert.match(links, /^stylesheetLinks:\s*\[\s*\.\.\.WORLD_STYLESHEET_LINKS/);
  const order = [
    "href: otherArtworkCssUrl",
    "href: MIRAGE_FONTS_URL",
    "href: worldMirageCssUrl",
  ].map((needle) => links.indexOf(needle));
  assert.ok(
    order.every((index) => index > 0),
    String(order),
  );
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
  );
  assert.equal(
    links.lastIndexOf('rel: "stylesheet"'),
    links.lastIndexOf('{ rel: "stylesheet", href: worldMirageCssUrl }') + 2,
  );
  for (const path of [
    "src/lib/world-head.ts",
    "src/routes/__root.tsx",
    "src/routes/dream-chapter.tsx",
  ]) {
    assert.doesNotMatch(await read(path), /mirage/i, path);
  }
});

test("the World page carries the edition hooks without new headings, paragraphs or images", async () => {
  const source = await read("src/components/world/world-home.tsx");
  assert.match(source, /className="site-shell motion-on film-edition mirage-edition"/);
  assert.match(source, /useMirageBoot\(shellRef\);/);
  assert.match(source, /<div className="mr-hero-hud" aria-hidden="true">/);
  assert.match(source, /<i className="mr-word" data-text="DECEPTION">\s*DECEPTION\s*<\/i>/);
  assert.match(source, /<i className="mr-word" data-text="WORLD">\s*WORLD\s*<\/i>/);
  assert.match(source, /<i className="mr-redact">欺瞞<\/i>でできている。/);
  assert.match(source, /<MirageTicker variant="open" records=\{EPISODES\.length\} \/>/);
  assert.match(source, /<MirageTicker variant="close" records=\{EPISODES\.length\} \/>/);
  assert.match(source, /<div className="mr-endmark" aria-hidden="true">/);
  assert.doesNotMatch(source, /<(?:p|h[1-6]|img)\b[^>]*className="mr-/);
  const ticker = await read("src/components/world/mirage-ticker.tsx");
  assert.match(ticker, /aria-hidden="true"/);
  for (const phrase of [
    "THE SECOND SAGA",
    "THIS IS NOT A DREAM",
    "POWER BEYOND THE BORDER",
    "THE STORY CONTINUES",
  ]) {
    assert.ok(source.includes(phrase), phrase);
  }
  const boot = await read("src/components/world/use-mirage-boot.ts");
  assert.match(boot, /MIRAGE_BOOT_SENTINEL = "mr-boot-seal"/);
  assert.match(boot, /prefersLightweightRendering\(navigator\)/);
  assert.match(boot, /prefers-reduced-motion: reduce/);
});

test("every rule stays inside the edition scope", async () => {
  const rules = styleRules(await readCss());
  assert.ok(rules.length > 100, String(rules.length));
  for (const { selector } of rules) {
    for (const part of splitSelectors(selector)) {
      assert.ok(inScope(part), part);
    }
  }
});

test("scroll choreography binds to the document, never to a clipping panel", async () => {
  const css = await readCss();
  // <body> would otherwise capture every view timeline and freeze it.
  assert.match(
    css,
    /html\[data-mode="world"\]:not\(\[data-rail-lock\]\):not\(\[data-loading\]\)\s+body:has\(\.site-shell\.film-edition\.mirage-edition\):not\(:has\(dialog\[open\]\)\) \{\s*overflow: visible;\s*overflow-x: clip;/,
  );
  const gate = css.indexOf("@supports (animation-timeline: view())");
  assert.ok(gate > 0);
  assert.doesNotMatch(css.slice(0, gate), /animation-timeline|view-timeline/);
  const clipping =
    /\.hero |\.hero-backdrop|\.mr-hero|\.threat-panel|\.threat-copy|\.world-column|\.rider-detail|\.rider-monogram|\.episode-archive|\.finale-sticky|\.finale-content|\.signal|\.other-archive-card|\.dante-visual|\.episode-grid|\.orbit|\.mr-word/;
  for (const { selector, body } of styleRules(css)) {
    if (!/animation-timeline:\s*view\(/.test(body)) continue;
    assert.doesNotMatch(selector, clipping, selector);
  }
  // A scroll lock turns <body> back into a scroll container; the choreography
  // is switched off meanwhile instead of rebinding to it.
  for (const { selector, body } of styleRules(css.slice(gate))) {
    if (!/animation-timeline|view-timeline/.test(body)) continue;
    for (const part of splitSelectors(selector)) {
      for (const lock of [
        ":not([data-side-menu-open])",
        ":not([data-rail-lock])",
        ":not([data-loading])",
        ":not(:has(dialog[open]))",
      ]) {
        const flat = part.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
        assert.ok(flat.includes(lock), `${part} lacks ${lock}`);
      }
    }
  }
  for (const name of ["--mr-hero", "--mr-archive", "--mr-column", "--mr-records", "--mr-finale"]) {
    assert.match(css, new RegExp(`view-timeline: ${name} block;`), name);
  }
});

test("motion is gated, finite and compositor-friendly", async () => {
  const css = await readCss();
  const firstGate = css.indexOf(
    "@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
  );
  assert.ok(firstGate > 0);
  assert.doesNotMatch(css.slice(0, firstGate), /animation:(?!\s*none)/);
  assert.doesNotMatch(css, /infinite|animation-iteration-count/);
  for (const { selector, body } of styleRules(css)) {
    if (!/(?:^|;)\s*animation(?:-name)?:(?!\s*none)/.test(body)) continue;
    for (const part of splitSelectors(selector)) {
      assert.match(part, /^html(?::not\(\[data-world-effects="economy"\]\)|:is\()/, part);
    }
  }
  const frames = keyframes(css);
  assert.ok(Object.keys(frames).length >= 25);
  for (const [name, body] of Object.entries(frames)) {
    assert.match(name, /^mr-/, name);
    const properties = [...body.matchAll(/([\w-]+)\s*:/g)].map((match) => match[1]);
    for (const property of properties) {
      const allowed = [
        "opacity",
        "translate",
        "scale",
        "rotate",
        "clip-path",
        "--mr-sweep",
        "--mr-pct",
      ];
      if (name === "mr-par-floor") allowed.push("transform");
      assert.ok(allowed.includes(property), `${name}: ${property}`);
    }
  }
  // Flicker budget for time-based keyframes: at most two opacity reversals a second.
  for (const match of css.matchAll(/animation: (mr-[\w-]+) (\d+)ms/g)) {
    const [, name, ms] = match;
    const values = [...(frames[name] ?? "").matchAll(/opacity:\s*([\d.]+)/g)].map((value) =>
      Number(value[1]),
    );
    let reversals = 0;
    for (let index = 2; index < values.length; index += 1) {
      const before = Math.sign(values[index - 1] - values[index - 2]);
      const after = Math.sign(values[index] - values[index - 1]);
      if (before && after && before !== after) reversals += 1;
    }
    assert.ok(reversals / (Number(ms) / 1000) <= 2, `${name}: ${reversals} in ${ms}ms`);
  }
  // Scroll-linked keyframes are monotonic in opacity, except two faint bands.
  for (const match of css.matchAll(
    /animation: (mr-[\w-]+) (?:linear|steps|var)[^;]*;\s*animation-timeline/g,
  )) {
    const name = match[1];
    if (["mr-curtain", "mr-iris"].includes(name)) continue;
    const values = [...(frames[name] ?? "").matchAll(/opacity:\s*([\d.]+)/g)].map((value) =>
      Number(value[1]),
    );
    const rising = values.every((value, index) => index === 0 || value >= values[index - 1]);
    const falling = values.every((value, index) => index === 0 || value <= values[index - 1]);
    assert.ok(rising || falling, name);
  }
});

test("boot holds under covers, and its sentinel never disappears", async () => {
  const css = await readCss();
  assert.match(css, /\.mr-hero-hud \{\s*animation: mr-boot-seal 2200ms linear both;/);
  assert.match(
    css,
    /html:is\(\[data-loading\], \[data-opening-handoff-active\]\)[\s\S]*?animation-play-state: paused;/,
  );
  for (const { selector, body } of styleRules(css)) {
    if (!/display:\s*none|visibility:\s*hidden/.test(body)) continue;
    for (const part of splitSelectors(selector)) {
      assert.doesNotMatch(part, /\.mr-hero-hud$/, part);
    }
  }
});

test("ornaments never take input, and pinned controls are left alone", async () => {
  const css = await readCss();
  const hud = css.slice(css.indexOf(".site-shell.film-edition.mirage-edition .mr-hero-hud {"));
  assert.match(hud, /^[^}]*position: absolute;[^}]*pointer-events: none;/);
  for (const selector of [".mr-ticker {", ".mr-endmark {", ".mr-hero-hud > * {"]) {
    const start = css.indexOf(`.site-shell.film-edition.mirage-edition ${selector}`);
    assert.ok(start > 0, selector);
    assert.match(css.slice(start, css.indexOf("}", start)), /pointer-events: none;/, selector);
  }
  assert.match(
    css,
    /\.site-shell\.film-edition\.mirage-edition \.orbit \{\s*display: none;\s*pointer-events: none;/,
  );
  for (const match of css.matchAll(
    /([^{}]*\.orbit[^{}]*)\{([^{}]*animation(?:-name)?:(?!\s*none)[^{}]*)\}/g,
  )) {
    assert.match(match[1], /:not\(\.is-shuffling\)/, match[1]);
  }
  assert.doesNotMatch(css, /touch-action:|overscroll-behavior:|scroll-snap|@layer/);
  assert.doesNotMatch(css, /backdrop-filter:(?!\s*none)/);
  assert.doesNotMatch(
    css,
    /ios-slide-open|liquid-selection-lens|liquid-rail-surface|rider-tabs|episode-pickup-plus/,
  );
  for (const match of css.matchAll(/([^;{}]+)!important/g)) {
    assert.match(match[1], /^\s*(?:background|box-shadow):/, match[0]);
  }
  const heading = css.slice(
    css.indexOf(".site-shell.film-edition.mirage-edition .story-heading h2 {"),
  );
  assert.doesNotMatch(heading.slice(0, heading.indexOf("}")), /transparent|background-clip/);
});

test("type never drops below 12px and generated duplicates stay silent", async () => {
  const css = await readCss();
  const sizes = [...css.matchAll(/font(?:-size)?:\s*([^;]+);/g)].map((match) => match[1]);
  assert.ok(sizes.length > 30, String(sizes.length));
  for (const size of sizes) {
    for (const value of size.matchAll(/(?:clamp\()?(\d+(?:\.\d+)?)px/g)) {
      if (/line-height|\/\s*[\d.]+$/.test(value[0])) continue;
      const pixels = Number(value[1]);
      // Font shorthand line-heights such as "12px/1.6" are unitless here.
      assert.ok(pixels >= 12, size);
    }
  }
  for (const match of css.matchAll(/(?:^|[;{\s])content:\s*([^;]+);/g)) {
    const value = match[1].trim();
    if (value === '""' || value === "none") continue;
    assert.match(value, /\/ ""$/, value);
  }
});

test("accessibility modes are restated", async () => {
  const css = await readCss();
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
  assert.match(css, /@media \(prefers-contrast: more\)/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*-webkit-text-fill-color: CanvasText;/);
  assert.match(
    css,
    /\.topbar nav a\[aria-current="location"\] \{\s*text-decoration: underline 2px;/,
  );
});

const runGate = (device, { storage = {}, hash = "" } = {}) => {
  const attributes = new Map();
  const documentStub = {
    documentElement: { setAttribute: (key, value) => attributes.set(key, value) },
  };
  const windowStub = {
    sessionStorage: { getItem: (key) => storage[key] ?? null },
    location: { hash },
  };
  new Function("document", "navigator", "window", MIRAGE_BOOT_GATE_SCRIPT)(
    documentStub,
    device,
    windowStub,
  );
  return attributes.has("data-mirage-quiet");
};

test("the pre-paint boot gate follows the lightweight renderer rules and session state", async () => {
  const desktop = {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    maxTouchPoints: 0,
    hardwareConcurrency: 10,
    deviceMemory: 8,
  };
  const iphone = (tail) => ({
    userAgent: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) ${tail}`,
    maxTouchPoints: 5,
  });
  const pixel9 = {
    userAgent:
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    maxTouchPoints: 5,
    hardwareConcurrency: 9,
    deviceMemory: 8,
  };
  const galaxyS24 = {
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    maxTouchPoints: 5,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  };
  const samsungInternet = {
    ...galaxyS24,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  };
  const mac = (touch) => ({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
    maxTouchPoints: touch,
  });
  const devices = [
    desktop,
    iphone("Version/18.5 Mobile/15E148 Safari/604.1"),
    iphone("Version/26.0 Mobile/15E148 Safari/604.1"),
    iphone("CriOS/140.0 Mobile/15E148 Safari/604.1"),
    mac(5),
    mac(0),
    pixel9,
    { ...pixel9, hardwareConcurrency: 8, deviceMemory: 8 },
    galaxyS24,
    samsungInternet,
    { ...pixel9, hardwareConcurrency: 4 },
    { ...samsungInternet, hardwareConcurrency: 4, deviceMemory: 4 },
    { ...pixel9, deviceMemory: 2 },
    { ...galaxyS24, hardwareConcurrency: 2 },
    { ...samsungInternet, connection: { saveData: true } },
    { ...pixel9, connection: { effectiveType: "slow-2g" } },
    { ...desktop, hardwareConcurrency: 4 },
    { ...desktop, connection: { saveData: true } },
    { ...desktop, connection: { effectiveType: "2g" } },
    { ...desktop, connection: { effectiveType: "4g" } },
    { ...desktop, deviceMemory: 2 },
    { ...desktop, hardwareConcurrency: 2 },
  ];
  for (const device of devices) {
    assert.equal(
      runGate(device),
      prefersLightweightRendering(device),
      `${device.userAgent} ${JSON.stringify({ ...device, userAgent: undefined })}`,
    );
  }
  // Capable Android plays the boot; weak Android and constrained hints stay quiet.
  for (const device of [pixel9, galaxyS24, samsungInternet]) assert.equal(runGate(device), false);
  assert.equal(runGate({ ...pixel9, deviceMemory: 2 }), true);
  assert.equal(runGate({ ...galaxyS24, hardwareConcurrency: 4 }), true);
  assert.equal(runGate(desktop, { storage: { [MIRAGE_BOOT_KEY]: "1" } }), true);
  assert.equal(runGate(desktop, { storage: { "deception-world:rider-return": "saga" } }), true);
  assert.equal(runGate(desktop, { hash: "#riders" }), true);

  const route = await read("src/routes/world.tsx");
  assert.match(route, /scripts: \[\{ children: MIRAGE_BOOT_GATE_SCRIPT \}\]/);
  const boot = await read("src/components/world/use-mirage-boot.ts");
  assert.match(boot, /import \{ MIRAGE_BOOT_KEY \} from "@\/lib\/mirage-boot-gate";/);
  assert.match(boot, /hasAttribute\("data-mirage-quiet"\)/);
  assert.match(boot, /sentinel\?\.playState === "finished"/);

  // Every time-based boot rule stays off once the gate has spoken.
  const css = await readCss();
  for (const { selector, body } of styleRules(css)) {
    if (!/animation(?:-name)?:(?!\s*none)/.test(body) || /animation-timeline/.test(body)) continue;
    if (/:hover/.test(selector)) continue;
    for (const part of splitSelectors(selector)) {
      assert.match(part, /:not\(\[data-mirage-quiet\]\)/, part);
    }
  }
});
