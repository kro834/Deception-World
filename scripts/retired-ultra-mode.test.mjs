import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(join(root, "src/lib/retired-ultra-mode.ts"), "utf8");
const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: module.exports },
);
const { RETIRED_ULTRA_MODE_SCRIPT: script, RETIRED_ULTRA_STORAGE_KEYS: keys } = module.exports;

test("prepaint cleanup retires saved Ultra settings without touching gallery or other preferences", () => {
  const attrs = new Map([
    ["data-ultra-mode", "on"],
    ["data-ultra-motion", "on"],
    ["data-ultra-quality", "cinema"],
    ["data-ultra-renderer", "gpu"],
    ["data-ultra-paused", "true"],
    ["data-family", "world"],
    ["data-device-profile", "ios"],
  ]);
  const saved = new Map([
    ["dw-ultra-mode-v1", "true"],
    ["dw-ultra-quality-v1", "cinema"],
    ["deception-world.gallery-feature.v1", "019"],
    ["deception-world.gallery-favorites.v1", "[19,23]"],
    ["deception-world.gallery-display.v1", '{"fit":"contain"}'],
    ["deception-world.gallery-titles.v1", '{"019":"作品"}'],
    ["dw-ipad-menu-v1", "dynamic"],
  ]);
  vm.runInNewContext(script, {
    document: { documentElement: { removeAttribute: (key) => attrs.delete(key) } },
    window: { localStorage: { removeItem: (key) => saved.delete(key) } },
  });
  assert.deepEqual(
    [...attrs],
    [
      ["data-family", "world"],
      ["data-device-profile", "ios"],
    ],
  );
  assert.deepEqual(
    [...saved.keys()],
    [
      "deception-world.gallery-feature.v1",
      "deception-world.gallery-favorites.v1",
      "deception-world.gallery-display.v1",
      "deception-world.gallery-titles.v1",
      "dw-ipad-menu-v1",
    ],
  );
  assert.deepEqual([...keys], ["dw-ultra-mode-v1", "dw-ultra-quality-v1"]);
  assert.doesNotMatch(
    script,
    /getItem|setItem|matchMedia|addEventListener|requestAnimationFrame|import\(/,
  );
});

test("blocked storage cannot prevent markup retirement or normal initialization", () => {
  const removed = [];
  let attempts = 0;
  const context = {
    document: { documentElement: { removeAttribute: (name) => removed.push(name) } },
    window: {
      get localStorage() {
        attempts += 1;
        throw new Error("Storage denied");
      },
    },
  };
  assert.doesNotThrow(() => vm.runInNewContext(script, context));
  assert.equal(attempts, 2);
  assert.equal(removed.length, 5);
  assert.ok(removed.includes("data-ultra-mode"));
  assert.doesNotMatch(script, /\b(?:const|let)\b|=>|\?\./);
});

test("no application route can reach the retired runtime, store, shaders or CSS", () => {
  const visited = new Set();
  const visit = (file) => {
    if (visited.has(file)) return;
    visited.add(file);
    const code = readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    const walk = (node) => {
      let dependency;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        dependency = node.moduleSpecifier;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
        dependency = node.arguments[0];
      if (dependency && ts.isStringLiteral(dependency)) {
        const name = dependency.text.split("?")[0];
        const base = name.startsWith("@/")
          ? join(root, "src", name.slice(2))
          : name.startsWith(".")
            ? resolve(dirname(file), name)
            : null;
        if (base) {
          const resolved = [
            base,
            `${base}.tsx`,
            `${base}.ts`,
            `${base}.js`,
            join(base, "index.tsx"),
            join(base, "index.ts"),
          ].find((path) => existsSync(path) && statSync(path).isFile());
          assert.ok(resolved, `unresolved local dependency ${name} in ${file}`);
          if (/\.(?:tsx?|js)$/.test(resolved)) visit(resolved);
          else visited.add(resolved);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(ast);
  };
  for (const file of readdirSync(join(root, "src/routes"), { recursive: true })) {
    if (typeof file === "string" && file.endsWith(".tsx")) visit(join(root, "src/routes", file));
  }
  const paths = [...visited].map((path) => path.slice(root.length)).join("\n");
  assert.doesNotMatch(
    paths,
    /(?:lib\/(?:ultra-(?:mode(?:-visibility)?|quality|artwork-target|renderer)\.|use-ultra-artwork-ready\.)|components\/ultra\/ultra-(?:mode-runtime|mode-toggle|effects)\.|styles-ultra-)/,
  );
  assert.match(paths, /lib\/retired-ultra-mode\.ts/);
  assert.match(
    paths,
    /components\/exhibition\/exhibition-studio\.tsx/,
    "explicit exhibition remains available",
  );
});

test("retired implementation, menu styles and dedicated asset paths are physically removed", () => {
  for (const path of [
    "src/components/ultra/ultra-effects.tsx",
    "src/components/ultra/ultra-mode-runtime.tsx",
    "src/components/ultra/ultra-mode-toggle.tsx",
    "src/components/ultra/exhibition-studio.tsx",
    "src/lib/ultra-mode.js",
    "src/lib/ultra-mode.d.ts",
    "src/lib/ultra-mode-visibility.js",
    "src/lib/ultra-mode-visibility.d.ts",
    "src/lib/ultra-quality.js",
    "src/lib/ultra-quality.d.ts",
    "src/lib/ultra-artwork-target.js",
    "src/lib/ultra-artwork-target.d.ts",
    "src/lib/ultra-renderer.js",
    "src/lib/ultra-renderer.d.ts",
    "src/lib/use-ultra-artwork-ready.ts",
    "src/styles-ultra-mode.css",
    "src/styles-ultra-effects.css",
    "src/styles-ultra-materials.css",
    "src/styles-ultra-transitions.css",
    "public/ultra-materials/brushed-alloy-normal.png",
    "public/ultra-materials/brushed-alloy-roughness.png",
    "public/ultra-materials/frame-rim.png",
    "public/ultra-materials/manifest.json",
    "scripts/build-ultra-materials.py",
    "docs/ultra-material-assets.md",
  ]) {
    assert.equal(existsSync(join(root, path)), false, `retired file must not ship: ${path}`);
  }
  const menuStyles = readFileSync(join(root, "src/styles-stage-shell.css"), "utf8");
  assert.doesNotMatch(menuStyles, /ultra-mode-setting|Ultra setting/);
  const renderer = readFileSync(join(root, "src/lib/exhibition-studio-renderer.ts"), "utf8");
  assert.doesNotMatch(renderer, /\/ultra-materials\//);
  assert.match(renderer, /\/exhibition-metal\/brushed-alloy-normal\.png/);
  assert.match(renderer, /\/exhibition-metal\/brushed-alloy-roughness\.png/);
  for (const asset of [
    "public/realm-ultra-selected-20261007.webp",
    "public/saga-extreme-ultra-20261006.jpeg",
    "public/rider-rexonance-ultra-20260923.webp",
  ])
    assert.ok(existsSync(join(root, asset)), `story artwork is not a graphics setting: ${asset}`);
});

test("normal transitions and story Ultra forms remain in the application", () => {
  const rootSource = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
  for (const name of [
    "transitionCinemaCss",
    "rexonanceCallsCss",
    "ios27EnhancementsCss",
    "viewportChromeCss",
  ]) {
    assert.ok(rootSource.includes(`href: ${name}`));
  }
  const forms = readFileSync(join(root, "src/components/final-stage/final-stage-data.ts"), "utf8");
  assert.match(forms, /レルムロイヤル・ウルトラ/);
});
