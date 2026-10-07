import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "lightningcss";
import ts from "typescript";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const componentPath = "src/components/cinematic/architectural-backdrop.tsx";
const cssPath = "src/styles-architectural-heroes.css";
const hostPaths = {
  world: "src/components/world/world-home.tsx",
  dream: "src/components/dream-chapter/dream-chapter.tsx",
  opening: "src/components/cinematic/title-sequence.tsx",
};
const routePaths = ["src/routes/index.tsx", "src/routes/world.tsx", "src/routes/dream-chapter.tsx"];
const bytes = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function loadBackdrop(dependencies = {}) {
  const context = vm.createContext({
    exports: {},
    require: (name) => dependencies[name] ?? require(name),
  });
  const compiled = ts.transpileModule(read(componentPath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  // Deliberately no window, document, matchMedia or GPU in the SSR context.
  vm.runInContext(compiled, context, { filename: componentPath });
  return context.exports.ArchitecturalBackdrop;
}

function imageNode(tree) {
  if (!tree || typeof tree !== "object") return undefined;
  if (tree.type === "img") return tree;
  return [tree.props?.children].flat().map(imageNode).find(Boolean);
}

function mountBackdrop() {
  const states = [];
  const effects = [];
  const previousDependencies = [];
  const imageRef = { current: null };
  let stateCursor = 0;
  let effectCursor = 0;
  const react = require("react");
  const Backdrop = loadBackdrop({
    react: {
      ...react,
      memo: (component) => component,
      useRef: () => imageRef,
      useState(initial) {
        const index = stateCursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (next) => (states[index] = next)];
      },
      useEffect(callback, dependencies) {
        const index = effectCursor++;
        const previous = previousDependencies[index];
        if (
          !previous ||
          dependencies.some((dependency, i) => !Object.is(dependency, previous[i]))
        ) {
          effects.push(callback);
          previousDependencies[index] = dependencies;
        }
      },
    },
  });
  return {
    render(variant = "world") {
      stateCursor = 0;
      effectCursor = 0;
      return Backdrop({ variant });
    },
    commit(tree, image) {
      assert.equal(imageNode(tree).props.ref, imageRef);
      imageRef.current = image;
      effects.splice(0).forEach((effect) => effect());
    },
  };
}

const normalize = (value) => value.replace(/\s+/gu, " ").trim();

// Read flat rules with their media contexts. The stylesheet deliberately uses
// flat selectors, so this does not need a browser to validate its boundaries.
function cssRules(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//gu, "");
  const result = [];
  const context = [];
  let prelude = "";
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      const selector = normalize(prelude);
      prelude = "";
      if (selector.startsWith("@")) {
        context.push(selector);
        continue;
      }
      const end = css.indexOf("}", index);
      assert.ok(end > index, `Unclosed CSS rule: ${selector}`);
      result.push({ selector, body: normalize(css.slice(index + 1, end)), context: [...context] });
      index = end;
    } else if (character === "}") {
      context.pop();
      prelude = "";
    } else if (character === ";") prelude = "";
    else prelude += character;
  }
  return result;
}

test("all entrance backplates render during SSR without browser, GPU or Ultra preferences", () => {
  const Backdrop = loadBackdrop();
  for (const variant of ["world", "dream", "opening"]) {
    const html = renderToStaticMarkup(createElement(Backdrop, { variant }));
    const asset = variant === "dream" ? "dream" : "world";
    assert.match(html, /<picture\b/);
    assert.match(html, /<img\b[^>]*alt=""/);
    assert.match(html, /aria-hidden="true"/);
    assert.ok(html.includes(`/architectural-heroes/${asset}-1280.webp`));
    assert.ok(html.includes(`/architectural-heroes/${asset}-2560.webp`));
    assert.match(html, /sizes="100vw"/);
    assert.doesNotMatch(html, /<canvas\b|<video\b|tabindex="0"|role="button"/iu);
  }
});

test("the architecture uses event-driven image readiness rather than a perpetual render loop", () => {
  const source = read(componentPath);
  assert.match(source, /onLoad=/);
  assert.match(source, /onError=/);
  assert.match(source, /data-ready=/);
  assert.match(source, /data-failed=/);
  assert.doesNotMatch(
    source,
    /requestAnimationFrame|setInterval|WebGLRenderer|useUltraMode|localStorage/,
  );
  assert.doesNotMatch(source, /prefers-reduced-motion|matchMedia/);
});

test("successful and failed image events update the decorative plate without remounting content", () => {
  const mount = mountBackdrop();
  const initial = mount.render();
  mount.commit(initial, { complete: false, naturalWidth: 0 });
  assert.equal(initial.props["data-ready"], "false");
  assert.equal(initial.props["data-failed"], "false");
  imageNode(initial).props.onLoad();
  const loaded = mount.render();
  assert.equal(loaded.props["data-ready"], "true");
  assert.equal(loaded.props["aria-hidden"], "true");
  imageNode(loaded).props.onError();
  const failed = mount.render();
  assert.equal(failed.props["data-ready"], "false");
  assert.equal(failed.props["data-failed"], "true");
  assert.equal(imageNode(failed).props.alt, "");
});

test("a later successful load clears both cached and event failures without a remount", () => {
  for (const failure of ["cached", "event", "previous-environment"]) {
    const mount = mountBackdrop();
    const world = mount.render("world");
    mount.commit(world, { complete: failure !== "event", naturalWidth: 0 });
    if (failure === "event") imageNode(world).props.onError();
    const failed = mount.render("world");
    assert.equal(failed.props["data-ready"], "false", failure);
    assert.equal(failed.props["data-failed"], "true", failure);
    const variant = failure === "previous-environment" ? "dream" : "world";
    const loading = mount.render(variant);
    mount.commit(loading, { complete: false, naturalWidth: 0 });
    imageNode(loading).props.onLoad();
    const recovered = mount.render(variant);
    assert.equal(recovered.props["data-ready"], "true", failure);
    assert.equal(recovered.props["data-failed"], "false", failure);
    assert.equal(recovered.props["aria-hidden"], "true", failure);
  }
});

test("prehydration cache success becomes visible even when the load event already fired", () => {
  const mount = mountBackdrop();
  const initial = mount.render();
  assert.equal(initial.props["data-ready"], "false", "server and first client state agree");
  mount.commit(initial, { complete: true, naturalWidth: 2560 });
  const hydrated = mount.render();
  assert.equal(hydrated.props["data-ready"], "true");
  assert.equal(hydrated.props["data-failed"], "false");
});

test("prehydration cache failure is marked failed, while a pending image waits for its event", () => {
  for (const complete of [true, false]) {
    const mount = mountBackdrop();
    const initial = mount.render();
    mount.commit(initial, { complete, naturalWidth: 0 });
    const hydrated = mount.render();
    assert.equal(hydrated.props["data-ready"], "false");
    assert.equal(hydrated.props["data-failed"], String(complete));
  }
});

test("switching environment rechecks cached native image state and clears stale failure", () => {
  const mount = mountBackdrop();
  const world = mount.render("world");
  mount.commit(world, { complete: true, naturalWidth: 0 });
  assert.equal(mount.render("world").props["data-failed"], "true");
  const dream = mount.render("dream");
  mount.commit(dream, { complete: true, naturalWidth: 1280 });
  const changed = mount.render("dream");
  assert.equal(changed.props["data-ready"], "true");
  assert.equal(changed.props["data-failed"], "false");
});

test("the Blender production scene and master renders match their recorded generator and bytes", async () => {
  const manifest = JSON.parse(read("public/architectural-heroes/manifest.json"));
  const production = JSON.parse(read(manifest.sourceManifest));
  assert.equal(manifest.generator, "scripts/build-architectural-heroes.py");
  assert.equal(manifest.sourceSha256, sha256(bytes(manifest.generator)));
  for (const name of [
    "generator",
    "sourceSha256",
    "engine",
    "viewTransform",
    "artworkPolicy",
    "materialPolicy",
  ]) {
    assert.equal(manifest[name], production[name], name);
  }
  assert.equal(manifest.engine, "Cycles");
  assert.equal(manifest.viewTransform, "AgX");
  assert.deepEqual(manifest.outputs, production.outputs);
  assert.deepEqual(Object.keys(production.outputs).sort(), ["dream", "world"]);
  for (const [name, output] of Object.entries(production.outputs)) {
    const base = "design/architectural-heroes-v1/production/";
    assert.equal(output.blend, `${name}-atrium.blend`);
    assert.equal(output.image, `${name}-atrium.png`);
    assert.equal(sha256(bytes(base + output.blend)), output.blendSha256);
    assert.equal(sha256(bytes(base + output.image)), output.imageSha256);
    assert.equal(output.samples, 192);
    assert.deepEqual(output.resolution, [2560, 1600]);
    const image = await sharp(bytes(base + output.image)).metadata();
    assert.equal(image.format, "png");
    assert.deepEqual([image.width, image.height], output.resolution);
  }
});

test("all four delivered WebPs match manifest bytes and decode at their true responsive dimensions", async () => {
  const manifest = JSON.parse(read("public/architectural-heroes/manifest.json"));
  const expected = ["dream-1280.webp", "dream-2560.webp", "world-1280.webp", "world-2560.webp"];
  assert.deepEqual(Object.keys(manifest.assets).sort(), expected);
  for (const [name, output] of Object.entries(manifest.assets)) {
    const data = bytes(`public/architectural-heroes/${name}`);
    assert.equal(data.byteLength, output.bytes, name);
    assert.equal(sha256(data), output.sha256, name);
    const metadata = await sharp(data).metadata();
    assert.equal(metadata.format, "webp");
    const width = Number(name.match(/-(\d+)\.webp$/u)[1]);
    assert.deepEqual([output.width, output.height], [width, (width * 5) / 8]);
    const { info } = await sharp(data).raw().toBuffer({ resolveWithObject: true });
    assert.deepEqual([info.width, info.height], [output.width, output.height]);
    assert.equal(info.channels, 3, "the architecture is an opaque RGB render");
  }
});

test("the fingerprinted scene generator accepts no artwork and builds procedural materials only", () => {
  const manifest = JSON.parse(read("public/architectural-heroes/manifest.json"));
  const generator = read(manifest.generator);
  assert.match(manifest.artworkPolicy, /No user artwork, text or outside image is embedded/u);
  assert.match(manifest.materialPolicy, /procedural materials only; no third-party assets/u);
  assert.match(generator, /ShaderNodeTexNoise/u);
  assert.match(generator, /ShaderNodeBump/u);
  assert.doesNotMatch(
    generator,
    /bpy\.data\.images\.load|ShaderNodeTexImage|text_add|type=['"]FONT['"]/u,
  );
  assert.doesNotMatch(generator, /\/gallery\/|poster-card-|rider-|dream-chapter-poster-/u);
  const inputs = [...generator.matchAll(/parser\.add_argument\(['"]([^'"]+)/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(inputs, [
    "--output",
    "--width",
    "--height",
    "--samples",
    "--scene",
    "--runtime-output",
  ]);
});

test("the three original entrances mount their own architectural backdrop", () => {
  for (const [variant, path] of Object.entries(hostPaths)) {
    const source = read(path);
    assert.match(source, /import\s+\{\s*ArchitecturalBackdrop\s*\}/);
    assert.ok(source.includes(`data-architectural-hero="${variant}"`), path);
    assert.match(source, new RegExp(`<ArchitecturalBackdrop\\s+variant="${variant}"`));
  }
});

test("architectural overrides are the final stylesheet on all three entrance routes", () => {
  for (const path of routePaths) {
    const route = read(path);
    const alias = route.match(
      /import\s+(\w+)\s+from\s+["'][^"']*styles-architectural-heroes\.css\?url["']/u,
    )?.[1];
    assert.ok(alias, `${path} must load the architectural skin`);
    const position = route.lastIndexOf(`href: ${alias}`);
    assert.ok(position > 0, `${path} must include the skin in its head`);
    const later = route.slice(position + `href: ${alias}`.length);
    assert.doesNotMatch(later, /rel:\s*["']stylesheet["']/u, `${path} adds a later skin`);
    assert.doesNotMatch(later, /\b[A-Z_]+STYLESHEET_LINK(?:S)?\b/u);
  }
});

test("the original artwork, carousel targets and opening clock remain intact", () => {
  const world = read(hostPaths.world);
  assert.match(world, /className="poster-frame"\s+data-ultra-artwork-ready=/u);
  assert.match(world, /className="poster-media"/u);
  assert.match(world, /key=\{`poster-\$\{poster\}`\}\s+src=\{current\.src\}/u);
  assert.match(world, /className="poster-controls"/u);
  assert.match(world, /className="hero-actions"/u);
  assert.match(world, /className="topbar"/u);

  const dream = read(hostPaths.dream);
  assert.match(dream, /className="dream-hero-art"\s+src=\{DREAM_CHAPTER_HERO_ART\}/u);
  assert.match(
    dream,
    /src=\{DREAM_CHAPTER_HERO_ART\}\s+alt=""\s+width=\{1448\}\s+height=\{1086\}/u,
  );
  assert.match(dream, /className="dream-hero-actions"/u);
  assert.match(dream, /className="dream-site-header"/u);

  const opening = read(hostPaths.opening);
  assert.match(opening, /const SEQUENCE_MS = 7200/u);
  assert.match(opening, /className="cine-camera"/u);
  assert.match(opening, /className="cine-logo-burn"/u);
  assert.match(opening, /const enterWorld = useCallback\(async/u);
  assert.match(opening, /onClick=\{\(\) => void enterWorld\(\)\}/u);
});

test("the photoreal skin parses and never changes iPad chrome or the document scroller", () => {
  const css = read(cssPath);
  assert.doesNotThrow(() => transform({ filename: cssPath, code: Buffer.from(css) }));
  const rules = cssRules(css);
  assert.ok(rules.length > 5);
  for (const { selector, body } of rules) {
    assert.doesNotMatch(
      selector,
      /\.topbar\b|\.dream-site-header\b|\.viewport-chrome-cover\b|\.side-panel-trigger\b/,
    );
    assert.doesNotMatch(selector, /(?:^|,)\s*(?:html|body)\s*(?:,|$)/u);
    if (/\.site-shell(?:\.[\w-]+)*$|\.dream-page(?:\.dream-page)?$/u.test(selector)) {
      assert.doesNotMatch(
        body,
        /(?:^|;)\s*(?:transform|filter|perspective|overflow|position)\s*:/u,
      );
    }
  }
  assert.doesNotMatch(css, /position:\s*fixed|overflow-y:\s*(?:auto|scroll)/u);
});

test("static realism stays available with reduced motion and has a forced-colors fallback", () => {
  const rules = cssRules(read(cssPath));
  const plateRules = rules.filter(({ selector }) => /architectural-backdrop/u.test(selector));
  assert.ok(plateRules.some(({ context }) => context.length === 0));
  const forced = plateRules.filter(({ context }) =>
    context.some((query) => /forced-colors:\s*active/u.test(query)),
  );
  assert.ok(
    forced.some(({ body }) => /display:\s*none/u.test(body)),
    "forced colors hides decorative geometry",
  );
  for (const { body, context } of plateRules) {
    if (context.some((query) => /prefers-reduced-motion:\s*reduce/u.test(query))) {
      assert.doesNotMatch(body, /display:\s*none|visibility:\s*hidden/u);
    }
  }
  assert.ok(plateRules.some(({ body }) => /pointer-events:\s*none/u.test(body)));
});

test("the original prints retain natural aspect and color under the physical surrounds", () => {
  const rules = cssRules(read(cssPath));
  for (const token of ["dream-hero-art", "poster-image"]) {
    const imageRules = rules.filter(({ selector }) => selector.includes(token));
    assert.ok(
      imageRules.some(({ body }) => /object-fit:\s*contain/u.test(body)),
      token,
    );
    assert.ok(
      imageRules.some(({ body }) => /filter:\s*none/u.test(body)),
      token,
    );
  }
  assert.ok(rules.some(({ context }) => context.some((query) => /max-width/u.test(query))));
});

test("mounted Dream art and horizontal catch override the previous scroll and vertical typography", () => {
  const rules = cssRules(read(cssPath));
  const art = rules.find(({ selector }) => selector.endsWith(" .dream-hero-art"));
  const catchLine = rules.find(({ selector }) => selector.endsWith(" .dream-hero-catch"));
  const catchSpans = rules.find(({ selector }) => selector.endsWith(" .dream-hero-catch span"));
  assert.ok(art && catchLine && catchSpans);
  // The prior stage selector carries several :not gates and thus outranks a
  // plain late stylesheet; these targeted important resets are intentional.
  for (const rule of [art, catchLine]) {
    assert.match(rule.body, /animation:\s*none\s*!important/u);
    assert.match(rule.body, /transform:\s*none\s*!important/u);
  }
  assert.match(catchLine.body, /writing-mode:\s*horizontal-tb/u);
  assert.match(catchSpans.body, /padding:\s*0(?:\s*!important)?\s*;/u);
});

test("the Dream obi can wrap its full copy instead of clipping on narrow screens", () => {
  const obi = cssRules(read(cssPath)).find(({ selector }) =>
    selector.endsWith(" .dream-hero-obi"),
  );
  assert.ok(obi, "the architectural hero provides a scoped obi override");
  assert.match(obi.selector, /\.dream-hero\[data-architectural-hero\]/u);
  assert.match(obi.body, /(?:^|;)\s*height:\s*auto\s*;/u);
  assert.match(obi.body, /min-height:\s*var\(--ts-obi,\s*60px\)\s*;/u);
  assert.match(obi.body, /white-space:\s*normal\s*;/u);
  assert.match(obi.body, /text-wrap:\s*balance\s*;/u);
  assert.match(obi.body, /text-align:\s*center\s*;/u);
  assert.match(obi.body, /flex-wrap:\s*wrap\s*;/u);
});

test("legacy holographic pseudo-elements are hidden with valid standalone selectors", () => {
  const css = read(cssPath);
  // :is() is forgiving, so a stylesheet can parse while silently dropping
  // pseudo-element alternatives; that leaves the old ghost text and HUD rim.
  assert.doesNotMatch(css, /:is\([^)]*::(?:before|after)/su);
  const rules = cssRules(css);
  for (const pseudo of [
    ".film-hero-identity::after",
    ".mr-word::before",
    ".mr-word::after",
    ".poster-frame::before",
    ".poster-frame::after",
  ]) {
    assert.ok(
      rules.some(
        ({ selector, body }) =>
          selector.includes(pseudo) && /display:\s*none\s*;/u.test(body),
      ),
      `${pseudo} must be hidden by the physical exhibition skin`,
    );
  }
});
