import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { parseArgs } from "node:util";
import ts from "typescript";

// faa5ab25b9b0 production entry, before the preview/gallery import separation.
// These are decoded and reproducibly gzipped file bytes, not elapsed load time.
export const STARTUP_BASELINE = {
  entryBytes: 528209,
  entryGzipBytes: 162759,
  criticalBytes: 657845,
  criticalGzipBytes: 207380,
};
export const STARTUP_BUDGET = {
  maxEntryBytes: Math.floor(STARTUP_BASELINE.entryBytes * 0.8),
  maxEntryGzipBytes: Math.floor(STARTUP_BASELINE.entryGzipBytes * 0.85),
  maxCriticalBytes: Math.floor(STARTUP_BASELINE.criticalBytes * 0.85),
  maxCriticalGzipBytes: Math.floor(STARTUP_BASELINE.criticalGzipBytes * 0.9),
};

// Runtime string values survive minification and escaped Unicode. The channel
// name remains in the lightweight preview loader, so it is deliberately absent.
export const FORBIDDEN_STARTUP_PAYLOADS = [
  {
    name: "Ciel secret renderer",
    markers: ["Ciel canvas unavailable", "シエルの緑炎", "EMERALD INFERNO"],
  },
  { name: "Zod implementation", markers: ["$ZodType", "$ZodError", "ZodError"] },
  { name: "preview bridge implementation", markers: ["__grokPreviewBridgeRoot"] },
  {
    name: "gallery artwork descriptions",
    markers: [
      "夕焼けの荒れた商店街を駆ける青と金の装甲姿",
      "夕暮れの廃墟の壁に立つ青緑と桃色と金の装甲姿",
    ],
  },
  {
    name: "gallery tour prose",
    markers: [
      "仮面を縁取る細い光から、胸章の虹色、白い空間へ広がる装飾まで。",
      "濡れた路面、雨の森、水飛沫の中に描かれた姿を巡ります。",
    ],
  },
];

function attributes(source) {
  return Object.fromEntries(
    [...source.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu)].map(
      (match) => [
        match[1].toLowerCase(),
        (match[2] ?? match[3] ?? match[4] ?? "").replace(/&amp;/gu, "&").replace(/&quot;/gu, '"'),
      ],
    ),
  );
}

function inspectModule(source, name) {
  const ast = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (ast.parseDiagnostics.length) throw new Error(`Cannot parse startup module: ${name}`);
  const imports = ast.statements
    .filter(
      (node) =>
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier,
    )
    .map((node) => node.moduleSpecifier.text);
  const violations = new Map();
  function visit(node) {
    if (
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      for (const rule of FORBIDDEN_STARTUP_PAYLOADS) {
        const marker = rule.markers.find((value) => node.text.includes(value));
        if (marker) violations.set(rule.name, { payload: rule.name, marker });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return { imports, violations: [...violations.values()] };
}

/** Analyze only the SSR roots and their static ESM edges; never glob assets. */
export async function analyzeStartupBundle({ html, pageUrl, readAsset, budget = STARTUP_BUDGET }) {
  const limits = Object.fromEntries(
    Object.entries(STARTUP_BUDGET).map(([key, fallback]) => [key, budget[key] ?? fallback]),
  );
  const page = new URL(pageUrl);
  const roots = new Set();
  const entryRoots = new Set();
  const externalScripts = new Set();
  const unmeasuredModules = new Set();
  const violations = [];
  function localModule(specifier, importer = page.href) {
    if (!/^(?:\.{1,2}\/|\/|https?:\/\/)/u.test(specifier)) {
      throw new Error(`Unresolved module specifier ${JSON.stringify(specifier)} in ${importer}`);
    }
    const url = new URL(specifier, importer);
    if (url.origin !== page.origin) {
      unmeasuredModules.add(url.href);
      return null;
    }
    return url.pathname + url.search;
  }
  // Consume complete scripts so strings containing <link> cannot become roots.
  const tags =
    /<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>|<link\b((?:"[^"]*"|'[^']*'|[^'">])*)>/giu;
  for (const match of html.replace(/<!--[\s\S]*?-->/gu, "").matchAll(tags)) {
    const isScript = match[1] !== undefined;
    const attrs = attributes(isScript ? match[1] : match[3]);
    const isModule = attrs.type?.toLowerCase() === "module";
    const isPreload = !isScript && attrs.rel?.toLowerCase().split(/\s+/u).includes("modulepreload");
    if (!isScript && !isPreload) continue;
    if (
      isScript &&
      attrs.type &&
      !isModule &&
      !/^(?:text|application)\/javascript$/iu.test(attrs.type)
    )
      continue;
    const source = isScript ? attrs.src : attrs.href;
    if (source) {
      const url = new URL(source, page);
      if (url.origin !== page.origin && !isModule && !isPreload) {
        externalScripts.add(url.href);
        continue;
      }
      const key = localModule(url.href);
      if (key) {
        roots.add(key);
        if (isModule) entryRoots.add(key);
      }
    } else if (isScript && isModule) {
      const inline = inspectModule(match[2], "inline module");
      violations.push(...inline.violations.map((value) => ({ module: "inline module", ...value })));
      for (const specifier of inline.imports) {
        const key = localModule(specifier);
        if (key) {
          roots.add(key);
          entryRoots.add(key);
        }
      }
    }
  }
  if (!entryRoots.size) throw new Error("SSR HTML contains no same-origin module entry");

  const modules = new Map();
  async function visit(key) {
    if (modules.has(key)) return;
    const body = Buffer.from(await readAsset(key));
    const parsed = inspectModule(body.toString("utf8"), key);
    const dependencies = [
      ...new Set(
        parsed.imports
          .map((specifier) => localModule(specifier, new URL(key, page)))
          .filter(Boolean),
      ),
    ];
    // Register before recursion to deduplicate cycles and shared dependencies.
    modules.set(key, {
      module: key,
      bytes: body.length,
      gzipBytes: gzipSync(body).length,
      dependencies,
    });
    violations.push(...parsed.violations.map((value) => ({ module: key, ...value })));
    for (const dependency of dependencies) await visit(dependency);
  }
  for (const root of roots) await visit(root);
  const criticalModules = [...modules.values()].sort(
    (a, b) => b.bytes - a.bytes || a.module.localeCompare(b.module),
  );
  const total = (items) =>
    items.reduce(
      (sum, item) => ({
        modules: sum.modules + 1,
        bytes: sum.bytes + item.bytes,
        gzipBytes: sum.gzipBytes + item.gzipBytes,
      }),
      { modules: 0, bytes: 0, gzipBytes: 0 },
    );
  const entry = total([...entryRoots].map((key) => modules.get(key)));
  const criticalGraph = total(criticalModules);
  const failures = violations.map((value) => `${value.payload} is in ${value.module}`);
  for (const url of unmeasuredModules)
    failures.push(`External critical module cannot be measured from build: ${url}`);
  if (entry.bytes > limits.maxEntryBytes)
    failures.push(`Entry bytes ${entry.bytes} exceed ${limits.maxEntryBytes}`);
  if (entry.gzipBytes > limits.maxEntryGzipBytes)
    failures.push(`Entry gzip bytes ${entry.gzipBytes} exceed ${limits.maxEntryGzipBytes}`);
  if (criticalGraph.bytes > limits.maxCriticalBytes)
    failures.push(`Critical graph bytes ${criticalGraph.bytes} exceed ${limits.maxCriticalBytes}`);
  if (criticalGraph.gzipBytes > limits.maxCriticalGzipBytes)
    failures.push(
      `Critical graph gzip bytes ${criticalGraph.gzipBytes} exceed ${limits.maxCriticalGzipBytes}`,
    );
  return {
    ok: failures.length === 0,
    pageUrl: page.href,
    baseline: STARTUP_BASELINE,
    budget: limits,
    entry: {
      ...entry,
      byteReductionPercent: 100 * (1 - entry.bytes / STARTUP_BASELINE.entryBytes),
      gzipReductionPercent: 100 * (1 - entry.gzipBytes / STARTUP_BASELINE.entryGzipBytes),
    },
    criticalGraph,
    roots: [...roots],
    entryRoots: [...entryRoots],
    externalScripts: [...externalScripts],
    violations,
    failures,
    criticalModules,
  };
}

export async function verifyStartupBundle({
  baseUrl,
  buildDir,
  pathname = "/",
  budget,
  fetchImpl = fetch,
}) {
  const pageUrl = new URL(pathname, baseUrl);
  if (!/^https?:$/u.test(pageUrl.protocol) || pageUrl.username || pageUrl.password) {
    throw new Error("BASE_URL must be an HTTP(S) URL without credentials");
  }
  const response = await fetchImpl(pageUrl, {
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (!response.ok) throw new Error(`SSR request failed with HTTP ${response.status}`);
  const root = await realpath(buildDir);
  const report = await analyzeStartupBundle({
    html: await response.text(),
    pageUrl,
    budget,
    readAsset: async (key) => {
      const pathname = decodeURIComponent(new URL(key, pageUrl).pathname);
      const file = await realpath(resolve(root, `.${pathname}`));
      const within = relative(root, file);
      if (within.startsWith("..") || isAbsolute(within))
        throw new Error(`Asset is outside build directory: ${key}`);
      return readFile(file);
    },
  });
  return { ...report, buildDir: root };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        "base-url": { type: "string", default: process.env.BASE_URL ?? "http://127.0.0.1:8171" },
        "build-dir": {
          type: "string",
          default: process.env.STARTUP_BUILD_DIR ?? ".vercel/output/static",
        },
        path: { type: "string", default: "/" },
        help: { type: "boolean", short: "h" },
      },
    });
    if (values.help) {
      console.log(
        "Usage: node scripts/verify-startup-bundle.mjs [--base-url URL] [--build-dir STATIC_DIR] [--path /]\nEnvironment: BASE_URL, STARTUP_BUILD_DIR. STATIC_DIR contains assets/.\nReports decoded/gzip file bytes, not network transfer bytes or elapsed time.",
      );
    } else {
      const report = await verifyStartupBundle({
        baseUrl: values["base-url"],
        buildDir: values["build-dir"],
        pathname: values.path,
      });
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Startup bundle verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
