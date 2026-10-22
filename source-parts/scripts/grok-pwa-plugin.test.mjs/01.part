import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  appNameFromHost,
  createHeadInjector,
  descriptionFromDocument,
  grokXCreatorHeadTags,
  imageFromDocument,
  injectGrokPwaHead,
  isDocumentPath,
  isInstallQuery,
  renderWebManifest,
  stripInstallParams,
} from "./grok-pwa-shared.mjs";
import { renderInstallPage } from "./grok-pwa-plugin.mjs";

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("injects before </head>", () => {
  const out = injectGrokPwaHead("<html><head><title>x</title></head><body></body></html>");
  assert.match(out, /rel="manifest"/);
  assert.match(out, /apple-touch-icon/);
  assert.match(out, /grok-app-builder\/extensions\.js/);
  assert.ok(out.indexOf("manifest") < out.indexOf("</head>"));
});

const NATIVE_APP_META = [
  ["mobile-web-app-capable", "yes"],
  ["apple-mobile-web-app-capable", "yes"],
  ["apple-mobile-web-app-status-bar-style", "black"],
];

test("root owns the opaque Home Screen metadata before the prepaint viewport guard", () => {
  const root = readFileSync(join(TEMPLATE_ROOT, "src/routes/__root.tsx"), "utf8");
  const guard = root.search(
    /scripts:\s*\[\s*\{\s*children:\s*IPAD_STANDALONE_VIEWPORT_SCRIPT\s*\}/,
  );
  assert.ok(guard > 0);
  for (const [name, content] of NATIVE_APP_META) {
    const declaration = `{ name: "${name}", content: "${content}" }`;
    assert.equal(root.split(declaration).length - 1, 1, `${name} is root-owned once`);
    assert.ok(root.indexOf(declaration) < guard, `${name} precedes the viewport guard`);
  }
});

test("fallback injection includes one capable/status pair and preserves root-owned tags", () => {
  const empty = "<html><head></head><body></body></html>";
  const rootOwned = `<html><head>${NATIVE_APP_META.map(
    ([name, content]) => `<meta name="${name}" content="${content}"/>`,
  ).join("")}</head><body></body></html>`;
  for (const original of [empty, rootOwned]) {
    const once = injectGrokPwaHead(original);
    const twice = injectGrokPwaHead(once);
    assert.equal(once, twice);
    for (const [name, content] of NATIVE_APP_META) {
      assert.equal(once.split(`name="${name}"`).length - 1, 1);
      assert.ok(once.includes(`name="${name}" content="${content}"`));
      assert.ok(once.indexOf(`name="${name}"`) < once.indexOf("</head>"));
    }
    assert.ok(
      once.indexOf('name="apple-mobile-web-app-capable"') <
        once.indexOf('name="apple-mobile-web-app-status-bar-style"'),
    );
  }
});

test("Home Screen install tutorial uses the same opaque native metadata", () => {
  const html = renderInstallPage("deception-world.vercel.app", "/?install=1&platform=ios");
  for (const [name, content] of NATIVE_APP_META) {
    assert.equal(html.split(`name="${name}"`).length - 1, 1);
    assert.ok(html.includes(`name="${name}" content="${content}"`));
    assert.ok(html.indexOf(`name="${name}"`) < html.indexOf("<script>"));
  }
});

test("injects the extensions script without a project id", () => {
  const out = injectGrokPwaHead("<html><head></head></html>", "Demo", "");
  assert.match(out, /src="https:\/\/grok\.com\/grok-app-builder\/extensions\.js" defer/);
  assert.doesNotMatch(out, /grok-project-id/);
  assert.doesNotMatch(out, /data-project-id/);
  assert.doesNotMatch(out, /property="grok:app_id"/);
});

test("injects project id on the script and meta when provided", () => {
  const out = injectGrokPwaHead("<html><head></head></html>", "Demo", "proj-123");
  assert.match(out, /name="grok-project-id" content="proj-123"/);
  assert.match(out, /data-project-id="proj-123"/);
  assert.match(out, /property="grok:app_id" content="proj-123"/);
});

test("does not duplicate grok:app_id", () => {
  const once = injectGrokPwaHead("<html><head></head></html>", "Demo", "proj-123");
  const twice = injectGrokPwaHead(once, "Demo", "proj-123");
  assert.equal(once, twice);
  assert.equal(twice.split('property="grok:app_id"').length - 1, 1);
});

test("omits x:creator tags without both creator values", () => {
  assert.deepEqual(grokXCreatorHeadTags("", "42"), []);
  assert.deepEqual(grokXCreatorHeadTags("@alice", ""), []);
  const out = injectGrokPwaHead("<html><head></head></html>", "Demo", "", "@alice", "");
  assert.doesNotMatch(out, /property="x:creator"/);
});

test("injects x:creator tags when both creator values are set", () => {
  const out = injectGrokPwaHead("<html><head></head></html>", "Demo", "", "@alice", "42");
  assert.match(out, /property="x:creator" content="@alice"/);
  assert.match(out, /property="x:creator:id" content="42"/);
});

test("escapes x:creator values", () => {
  const tags = grokXCreatorHeadTags('"><script>', '1" onclick="alert(1)');
  assert.equal(tags[0], '<meta property="x:creator" content="&quot;&gt;&lt;script&gt;">');
  assert.equal(tags[1], '<meta property="x:creator:id" content="1&quot; onclick=&quot;alert(1)">');
});

test("does not duplicate x:creator tags", () => {
  const once = injectGrokPwaHead("<html><head></head></html>", "Demo", "", "@alice", "42");
  const twice = injectGrokPwaHead(once, "Demo", "", "@alice", "42");
  assert.equal(once, twice);
  assert.equal(twice.split('property="x:creator" content=').length - 1, 1);
  assert.equal(twice.split('property="x:creator:id"').length - 1, 1);
});

test("platform chrome injects twitter:card when the document has none", () => {
  const out = injectGrokPwaHead("<html><head><title>Hello World</title></head></html>");
  assert.match(out, /name="twitter:card" content="summary_large_image"/);
  assert.doesNotMatch(out, /property="og:title"/);
});

test("does not duplicate twitter:card", () => {
  const once = injectGrokPwaHead("<html><head><title>Hello World</title></head></html>");
  const twice = injectGrokPwaHead(once);
  assert.equal(once, twice);
  assert.equal(twice.split('name="twitter:card"').length - 1, 1);
});

test("leaves an existing twitter:card alone", () => {
  const html = '<html><head><meta name="twitter:card" content="summary"></head></html>';
  const out = injectGrokPwaHead(html, "Wild Race");
  assert.match(out, /name="twitter:card" content="summary"/);
  assert.doesNotMatch(out, /summary_large_image/);
  assert.equal(out.split('name="twitter:card"').length - 1, 1);
});

test("does not duplicate the extensions script", () => {
  const once = injectGrokPwaHead("<html><head></head></html>", "Demo", "proj-123");
  const twice = injectGrokPwaHead(once, "Demo", "proj-123");
  assert.equal(once, twice);
  assert.equal(twice.split("extensions.js").length - 1, 1);
});

test("is idempotent", () => {
  const once = injectGrokPwaHead("<html><head></head></html>");
  const twice = injectGrokPwaHead(once);
  assert.equal(once, twice);
});

test("uses the app name in the injected title tag", () => {
  const out = injectGrokPwaHead("<html><head></head></html>", "Wild Race");
  assert.match(out, /apple-mobile-web-app-title" content="Wild Race"/);
});

test("streaming injector handles </head> split across chunks", () => {
  const injector = createHeadInjector("Wild Race");
  const chunks = [
    ...injector.push("<html><head><title>x</title></he"),
    ...injector.push("ad><body>hello</body></html>"),
  ];
  const out = Buffer.concat(chunks).toString("utf8");
  assert.match(out, /rel="manifest"/);
  assert.ok(out.indexOf("manifest") < out.indexOf("</head>"));
  assert.match(out, /<body>hello<\/body>/);
  assert.deepEqual(injector.flush(), []);
});

test("streaming injector passes post-head chunks through untouched", () => {
  const injector = createHeadInjector();
  injector.push("<html><head></head>");
  const [tail] = injector.push("<body>tail</body>");
  assert.equal(tail.toString("utf8"), "<body>tail</body>");
});

test("streaming injector falls back when no </head> is seen", () => {
  const injector = createHeadInjector();
  assert.deepEqual(injector.push("<html><head>"), []);
  const out = Buffer.concat(injector.flush()).toString("utf8");
  assert.match(out, /rel="manifest"/);
});

test("detects install query", () => {
  assert.equal(isInstallQuery("/?install=1&platform=ios"), true);
  assert.equal(isInstallQuery("/app?foo=1&install=true&platform=ios"), true);
  assert.equal(isInstallQuery("/?install=1"), false);
  assert.equal(isInstallQuery("/?install=1&platform=android"), false);
  assert.equal(isInstallQuery("/?install=0&platform=ios"), false);
  assert.equal(isInstallQuery("/"), false);
});

test("filters non-document paths", () => {
  assert.equal(isDocumentPath("/"), true);
  assert.equal(isDocumentPath("/app"), true);
  assert.equal(isDocumentPath("/api/thing"), false);
  assert.equal(isDocumentPath("/__grok/install/styles.css"), false);
  assert.equal(isDocumentPath("/logo.png"), false);
});

test("strips install params from the app link", () => {
  assert.equal(stripInstallParams("/?install=1&platform=ios"), "/");
  assert.equal(stripInstallParams("/app?install=1&platform=ios&tab=2"), "/app?tab=2");
});

test("names the install page from host slug", () => {
  assert.equal(appNameFromHost("localhost:8080"), "Grok App");
  assert.equal(appNameFromHost("172.17.154.217:8080"), "Grok App");
  assert.equal(appNameFromHost("wild-race.grok.me"), "Wild Race");
});

test("rejects hosts that are not plain slugs", () => {
  assert.equal(appNameFromHost("<script>alert(1)</script>"), "Grok App");
  assert.equal(appNameFromHost('"><img src=x onerror=1>.grok.me'), "Grok App");
});

test("renders install page markup", () => {
  const html = renderInstallPage("wild-race.grok.me", "/?install=1&platform=ios");
  assert.match(html, /Add Deception World to your/);
  assert.match(html, /\/__grok\/install\/styles\.css/);
  assert.match(html, /href="\/"/);
  assert.equal(html.includes("{{APP_NAME}}"), false);
  assert.equal(html.includes("{{APP_URL}}"), false);
});

test("escapes host-derived values in the install page", () => {
  const html = renderInstallPage("<script>alert(1)</script>", "/?install=1&platform=ios");
  assert.equal(html.includes("<script>alert(1)</script>"), false);
});

test("renders the manifest with the per-app name", () => {
  const manifest = JSON.parse(renderWebManifest("wild-race.grok.me"));
  assert.equal(manifest.name, "Deception World");
  assert.equal(manifest.short_name, "Deception World");
  assert.equal(manifest.icons[0].src, "/__grok/icon-180.png");
});

// Tripwires: the deployed-app path only works if Nitro scans server/ — an
// accidental edit that drops serverDir or the middleware file would otherwise
// fail silently (published apps would just render the app for ?install=1).
test("vite config keeps the nitro serverDir wiring", () => {
  const viteConfig = readFileSync(join(TEMPLATE_ROOT, "vite.config.ts"), "utf8");
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);
  assert.match(viteConfig, /grokPwaPlugin\(\)/);
});

test("nitro middleware and its bundled assets exist", () => {
  const middleware = readFileSync(join(TEMPLATE_ROOT, "server/middleware/grok-pwa.ts"), "utf8");
  assert.match(middleware, /install-page\.html\?raw/);
  readFileSync(join(TEMPLATE_ROOT, "scripts/install-page.html"));
  readFileSync(join(TEMPLATE_ROOT, "public/__grok/icon-180.png"));
  readFileSync(join(TEMPLATE_ROOT, "public/__grok/install/styles.css"));
});

/* 2026-10-21 sweep F07: the share card of a route that describes itself
   (/rexonance-saga) kept only its title. The injector stripped the route's
   og:description and added one only from the site identity, never emitted
   og:type, and gave no twitter:title or twitter:description. */
const ROUTE_HEAD = (extra = "") =>
  "<html><head><title>レクソナンスサーガ｜Deception World</title>" +
  '<meta name="description" content="究極が始まる。">' +
  '<meta property="og:title" content="レクソナンスサーガ｜Deception World">' +
  '<meta property="og:description" content="覚醒する、全てが最高峰で。">' +
  '<meta property="og:image" content="/rider-rexonance-saga-pickup-20260923.webp">' +
  `${extra}</head><body></body></html>`;
const SHARE = (html) =>
  Object.fromEntries(
    [...html.matchAll(/<meta (?:property|name)="((?:og|twitter):[^"]+)" content="([^"]*)">/g)].map(
      ([, key, content]) => [key, content],
    ),
  );

test("a route's own description, og:type and twitter title/description reach its card", () => {
  const out = injectGrokPwaHead(ROUTE_HEAD(), {
    host: "deception-world.grok.me",
    site: { card: "custom", image: "/og.jpg" },
  });
  const share = SHARE(out);
  assert.equal(share["og:title"], "レクソナンスサーガ｜Deception World");
  assert.equal(share["twitter:title"], "レクソナンスサーガ｜Deception World");
  assert.equal(share["og:description"], "覚醒する、全てが最高峰で。");
  assert.equal(share["twitter:description"], "覚醒する、全てが最高峰で。");
  assert.equal(share["og:type"], "website");
  // The portrait WebP is not a share card: the absolute 1200x630 site card stays.
  assert.equal(share["og:image"], "https://deception-world.grok.me/og.jpg");
  assert.equal(share["og:image:width"], "1200");
  assert.equal(share["og:image:height"], "630");
  assert.equal(out.split('property="og:description"').length - 1, 1);
  assert.equal(out.split('property="og:image"').length - 1, 1);
  // Injecting the injected document again changes nothing.
  assert.equal(
    injectGrokPwaHead(out, {
      host: "deception-world.grok.me",
      site: { card: "custom", image: "/og.jpg" },
    }),
    out,
  );
});

test("the meta description stands in for a missing og:description; the site's wins", () => {
  const plain =
    '<html><head><title>World</title><meta name="description" content="公式記録サイト。"></head></html>';
  assert.equal(
    descriptionFromDocument(plain),
    "公式記録サイト。",
    "the meta description when the route has no og:description",
  );
  assert.equal(
    SHARE(injectGrokPwaHead(plain, { host: "a.grok.me", site: {} }))["og:description"],
    "公式記録サイト。",
  );
  const site = SHARE(
    injectGrokPwaHead(ROUTE_HEAD(), { host: "a.grok.me", site: { description: "Site-wide" } }),
  );
  assert.equal(site["og:description"], "Site-wide");
  assert.equal(site["twitter:description"], "Site-wide");
  // No description anywhere: none is invented.
  const bare = injectGrokPwaHead("<html><head><title>x</title></head></html>", {
    host: "a.grok.me",
    site: {},
  });
  assert.doesNotMatch(bare, /og:description|twitter:description/);
  // x:game identities keep their type.
  assert.equal(
    SHARE(injectGrokPwaHead(plain, { host: "a.grok.me", site: { type: "x:game" } }))["og:type"],
    "x:game",
  );
});

test("route share text is decoded once and escaped once", () => {
  const html =
    '<html><head><title>T</title><meta property="og:description" content="P14 &amp; &quot;MAX&quot; &lt;5&gt;"></head></html>';
  assert.equal(descriptionFromDocument(html), 'P14 & "MAX" <5>');
  const out = injectGrokPwaHead(html, { host: "a.grok.me", site: {} });
  assert.match(out, /property="og:description" content="P14 &amp; &quot;MAX&quot; &lt;5&gt;"/);
  assert.match(out, /name="twitter:description" content="P14 &amp; &quot;MAX&quot; &lt;5&gt;"/);
});

test("a route's own 1200x630 JPEG card replaces the site card, absolute and sized", () => {
  const card =
    '<meta property="og:image" content="/og-rexonance-saga.jpg">' +
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">';
  const html =
    "<html><head><title>T</title>" +
    card +
    '<meta property="og:description" content="D"></head></html>';
  assert.deepEqual(imageFromDocument(html), {
    path: "/og-rexonance-saga.jpg",
    width: 1200,
    height: 630,
  });
  const share = SHARE(
    injectGrokPwaHead(html, { host: "deception-world.grok.me", site: { card: "custom" } }),
  );
  assert.equal(share["og:image"], "https://deception-world.grok.me/og-rexonance-saga.jpg");
  assert.equal(share["og:image:width"], "1200");
  assert.equal(share["og:image:height"], "630");
  // 2026-10-22 F07: the route's own card is X's large image too.
  assert.equal(share["twitter:image"], share["og:image"]);
  // Without a custom site card the placeholder service still draws the card.
  const placeholder = SHARE(injectGrokPwaHead(html, { host: "a.grok.me", site: {} }));
  assert.match(placeholder["og:image"], /\/v1\/card\.png\?host=a\.grok\.me/);
  assert.equal(placeholder["twitter:image"], undefined);
  // The site card names no twitter:image (X reads og:image), as before.
  assert.equal(
    SHARE(injectGrokPwaHead(ROUTE_HEAD(), { host: "a.grok.me", site: { card: "custom" } }))[
      "twitter:image"
    ],
    undefined,
  );
  // Not a card: a WebP, a card without its size, a remote or parent path.
  for (const image of [
    '<meta property="og:image" content="/key.webp"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
    '<meta property="og:image" content="/key.jpg">',
    '<meta property="og:image" content="https://elsewhere.example/key.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
    '<meta property="og:image" content="//elsewhere.example/key.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
    '<meta property="og:image" content="/a/../key.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
  ]) {
    const doc = `<html><head>${image}</head></html>`;
    assert.equal(imageFromDocument(doc), null, image);
    assert.equal(
      SHARE(injectGrokPwaHead(doc, { host: "a.grok.me", site: { card: "custom" } }))["og:image"],
      "https://a.grok.me/og.jpg",
    );
  }
});

test("the shipped /rexonance-saga head describes itself for its share card", () => {
  const route = readFileSync(join(TEMPLATE_ROOT, "src/routes/rexonance-saga.tsx"), "utf8");
  assert.match(route, /\{\s*property: "og:description",\s*content:/);
  assert.match(route, /\{\s*name: "description",\s*content:/);
});

/* 2026-10-22 F07 remainder: the route's links were shared with the generic
   site card. It now names its own card: a versioned 1200x630 JPEG under
   public/, declared with its size, which the injector publishes absolute as
   og:image (with its size) and twitter:image. */
const jpegSize = (bytes) => {
  assert.equal(bytes.readUInt16BE(0), 0xffd8, "a JPEG");
  for (let i = 2; i < bytes.length;) {
    const marker = bytes.readUInt16BE(i);
    const length = bytes.readUInt16BE(i + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
      return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    }
    i += 2 + length;
  }
  return null;
};

test("the shipped /rexonance-saga head names its own 1200x630 card, and the injector publishes it", () => {
  const route = readFileSync(join(TEMPLATE_ROOT, "src/routes/rexonance-saga.tsx"), "utf8");
  const meta = (key) =>
    route.match(new RegExp(`\\{ property: "${key}", content: "([^"]+)" \\}`))?.[1];
  assert.equal(meta("og:image"), "/og-rexonance-saga-20261022.jpg");
  assert.equal(meta("og:image:width"), "1200");
  assert.equal(meta("og:image:height"), "630");
  const card = readFileSync(join(TEMPLATE_ROOT, "public/og-rexonance-saga-20261022.jpg"));
  assert.deepEqual(jpegSize(card), [1200, 630]);
  assert.ok(card.length < 200 * 1024, `${card.length} bytes`);
  // The SSR head as the router emits it (the route's meta win over the root's).
  const html =
    "<html><head><title>レクソナンスサーガ｜Deception World</title>" +
    `<meta property="og:image" content="${meta("og:image")}">` +
    `<meta property="og:image:width" content="${meta("og:image:width")}">` +
    `<meta property="og:image:height" content="${meta("og:image:height")}">` +
    "</head><body></body></html>";
  const out = injectGrokPwaHead(html, {
    host: "deception-world.grok.me",
    site: { card: "custom", image: "/og.jpg" },
  });
  const share = SHARE(out);
  assert.equal(share["og:image"], "https://deception-world.grok.me/og-rexonance-saga-20261022.jpg");
  assert.equal(share["og:image:width"], "1200");
  assert.equal(share["og:image:height"], "630");
  assert.equal(share["twitter:image"], share["og:image"]);
  assert.equal(out.split('property="og:image"').length - 1, 1);
  assert.equal(out.split('name="twitter:image"').length - 1, 1);
});
