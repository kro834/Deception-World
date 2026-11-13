import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const browserTimeoutMs = 180_000;
const extraTest = "src/components/saga-cinema/saga-cinema-data.test.mjs";

// Route names, source names and test names use the same stems in most of the
// repository. Anchoring them to a stem boundary avoids matching asset IDs.
const areaStems = {
  opening: /^(?:a-opening|cinematic|opening|pwa|grok-pwa|favicon|app-icon|logo-title)(?:[./-]|$)/,
  navigation:
    /^(?:b-routing|load-gate|loading-gate|load-error|route|router|side-menu|menu|compact-menu|local-nav|shared-navigation|stable-fragment|phone-landscape-menu|ipad-menu|transition|tap-through|device-shell|viewport)(?:[./-]|$)/,
  world:
    /^(?:c-world|e2-world|stage-world|tablet-world|world|rising|mirage|pickup|re-dive|quote-transcript|episode)(?:[./-]|$)/,
  dossiers:
    /^(?:d-dossiers|e1-dossiers|dossier|stage-dossier|tablet-dossier|character|characters|civilian|manager|managers|rider|riders|dante|ciel|varg|lejas|yoake-mamori)(?:[./-]|$)/,
  archive:
    /^(?:archive|form-archive|iframe|saga-form-archive|realm-form-archive|restore-archive|iphone-archive)(?:[./-]|$)/,
  gallery: /^(?:gallery|tablet-gallery|artwork-stage|artwork-dialog)(?:[./-]|$)/,
  exhibition: /^(?:exhibition|gallery-tour|gallery-tours|quote-exhibition)(?:[./-]|$)/,
  dream: /^(?:dream|stage-dream)(?:[./-]|$)/,
  rexonance:
    /^(?:rexonance|warm-rexonance|rider-rexonance|stage-rexonance|heap-retainers|rx14|rx17)(?:[./-]|$)/,
  "far-from": /^(?:far-from|saga-far-from)(?:[./-]|$)/,
  illusionculum: /^(?:illusionculum|saga-illusionculum)(?:[./-]|$)/,
  "meta-unitas": /^(?:meta-unitas|saga-meta-unitas)(?:[./-]|$)/,
  extreme: /^(?:extreme|stage-extreme|saga-extreme|p14-calibration)(?:[./-]|$)/,
  "final-stage": /^(?:final-stage|stage-final-stage|royal-exhibit)(?:[./-]|$)/,
  "saga-cinema": /^saga-cinema(?:[./-]|$)/,
  search: /^(?:search|quick-search)(?:[./-]|$)/,
  library: /^(?:library|inquiry|record|stage-library)(?:[./-]|$)/,
  zeus: /^(?:zeus|manager-zeus)(?:[./-]|$)/,
  forms:
    /^(?:form-signature|form-pickup|form-slider|over-zeztz|kemonohen|explom|transformation-lab)(?:[./-]|$)/,
  dogs: /^(?:dogs-archive|dogs-viewer|dog-dossier)(?:[./-]|$)/,
  shared:
    /^(?:chunk-retry|asset-loader|auto-sized-image|viewport|rendering-profile|device-profile|liquid|glass|frosted-controls|future-interface|button-style|content-protection|press-feedback|visual-paint|scroll-playhead|startup|site-fonts|site-page-registry|font-subsets|preview-host-bridge|route-css-delivery)(?:[./-]|$)/,
  delivery:
    /^(?:build-release-identity|vercel|delivery-verify|public-deployment|previous-production-main|switch-vercel-production|destructive-migration|preview-production|production-release|embedded-archives|assemble-source|fetch-source|fetch-public-assets|sync-source-parts|source-parts-parity|migrate)(?:[./-]|$)/,
  harness: /^(?:harness|web-harness)(?:[./-]|$)/,
};

const sharedPaths =
  /^src\/(?:router\.tsx|routeTree\.gen\.ts|routes\/__root\.tsx|components\/(?:load-gate|skip-link|content-protection|world\/world-chrome)\.tsx|styles(?:-(?:world-addon|world-common|stage|stage-shell|site-astra|name-words|chrome-elevation|route-transitions|route-transition|transition-cinema|control-optics|visual-astra|load-error))?\.css)$/;
const configPaths =
  /^(?:\.github\/workflows\/.*|package(?:-lock)?\.json|vite\.config\.ts|tsconfig\.json|eslint\.config\.mjs|vercel\.json|startup\.sh|\.vercelignore|\.env\.example)$/;
const implementationPaths =
  /^(?:src|public|server|scripts|archives|migrations|supabase)\/|\.(?:[cm]?[jt]sx?|css|glsl|html|toml|yaml|yml)$/i;
const sharedAreas = ["opening", "navigation", "world", "archive"];
const releaseTestAreas = ["delivery", "harness"];

// Each entry describes a checked-in verifier that propagates failed assertions.
// The existing scripts differ in URL, engine and screenshot environment names.
const browserSuites = [
  {
    id: "opening-controls",
    areas: ["opening"],
    env: { PW_ENGINE: "chrome" },
  },
  {
    id: "route-history",
    areas: ["navigation"],
  },
  {
    id: "route-error-recovery",
    areas: ["navigation"],
    requiresProductionBuild: true,
    artifactDirEnv: "QA_SCREENSHOT_DIR",
  },
  {
    id: "route-warmup-deadline",
    match: /(?:load(?:ing)?-gate|route-warmup-deadline)/,
    requiresProductionBuild: true,
    env: { QA_ONE_CASE: "" },
  },
  {
    id: "world-section-nav",
    areas: ["world"],
  },
  {
    id: "archive-history-navigation",
    areas: ["archive"],
    env: { IFRAME: "false" },
  },
  {
    id: "dante-dossier",
    areas: ["dossiers", "dogs"],
    env: { PW_ENGINE: "chromium" },
  },
  {
    id: "gallery-controls-focus",
    areas: ["gallery"],
    browsers: ["chrome", "webkit"],
    artifactDirEnv: "OUTPUT_DIR",
  },
  {
    id: "exhibition-tours",
    areas: ["exhibition"],
    env: { PW_BROWSER: "chromium" },
  },
  {
    id: "exhibition-discovery",
    match: /(?:exhibition|gallery-tours|quote-exhibition)/,
    env: { PW_BROWSER: "chromium" },
    localOnly: true,
  },
  {
    id: "dream-navigation-recovery",
    areas: ["dream"],
    env: { PW_ENGINE: "chromium" },
    requiresProductionBuild: true,
  },
  {
    id: "dream-chapter-stage",
    match: /(?:dream-chapter|dream-stage)/,
    baseUrlEnv: "BASE",
    browsers: ["chrome", "webkit"],
    artifactDirEnv: "AUDIT_OUT",
    env: { CASES: "", LIVE_FONTS: "0" },
  },
  {
    id: "rexonance-operability",
    areas: ["rexonance"],
    env: { PW_ENGINE: "chromium", PW_PROFILE: "" },
  },
  {
    id: "extreme-fightcard",
    areas: ["extreme"],
    artifactDirEnv: "AUDIT_OUT",
  },
  {
    id: "special-controls",
    areas: ["illusionculum"],
    env: { PW_ENGINE: "chromium" },
  },
  {
    id: "meta-unitas-entry",
    areas: ["meta-unitas"],
    browsers: ["webkit"],
    env: { PW_ENGINE: "webkit", ENTRY_PROFILE: "phone", EXPECT_BROKEN: "0" },
  },
  {
    id: "royal-exhibit-navigation",
    areas: ["final-stage"],
    browsers: ["webkit"],
    requiresProductionBuild: true,
  },
  {
    id: "saga-cinema-transition",
    areas: ["saga-cinema"],
    env: { PW_ENGINE: "chromium" },
  },
  {
    id: "search-observatory",
    areas: ["search"],
    env: { PW_ENGINE: "chromium" },
  },
  {
    id: "record-discovery",
    areas: ["library"],
    artifactDirEnv: "AUDIT_OUT",
    env: { QA_ENGINE: "chromium", QA_WIDTH: "" },
  },
  {
    id: "zeus-stability",
    areas: ["zeus"],
  },
  {
    id: "form-signatures",
    areas: ["forms"],
    artifactDirEnv: "AUDIT_OUT",
    env: { PW_ENGINE: "chromium", PW_WIDTH: "" },
  },
  {
    id: "content-protection",
    match: /(?:content-protection)/,
  },
  {
    id: "site-health",
    areas: ["far-from", "server"],
    timeoutMs: 600_000,
  },
];

function normalizePath(root, file) {
  const path = relative(root, resolve(root, file)).split(sep).join("/");
  if (!path || path === ".." || path.startsWith("../") || path.startsWith("/")) return null;
  if (path.startsWith("source-parts/") && path.endsWith(".part")) {
    return { original: path, source: dirname(path).slice("source-parts/".length), part: true };
  }
  return { original: path, source: path, part: false };
}

function areaNames(path) {
  if (path === "src/routes/index.tsx") return ["opening"];
  if (path.startsWith("src/routes/api/gallery/")) return ["gallery"];
  if (/^(?:server|migrations|supabase|src\/lib\/auth|src\/routes\/api)(?:\/|$)/.test(path)) {
    return ["server"];
  }
  if (/^\.github\/workflows\/.*(?:harness|quality)/.test(path)) return ["harness"];
  if (configPaths.test(path) || path.startsWith("public/__grok/")) return ["delivery"];

  const stem = path
    .replace(/^(?:src\/(?:components|lib|routes)\/|src\/styles-|public\/|archives\/|scripts\/)/, "")
    .replace(
      /^world\/(?=form-signature|dossier-|ciel|dante|dog-dossier|rider-page|manager-stub|zeus)/,
      "",
    )
    .replace(/^verify-/, "")
    .toLowerCase();
  const areas = Object.entries(areaStems)
    .filter(([, pattern]) => pattern.test(stem))
    .map(([area]) => area);
  if (path.startsWith("public/fonts/") || sharedPaths.test(path)) areas.push("shared");
  return areas;
}

function listTests(root) {
  const tests = readdirSync(join(root, "scripts"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => `scripts/${entry.name}`);
  if (existsSync(join(root, extraTest))) tests.push(extraTest);
  return tests.sort();
}

function mentionsFile(root, test, content, file) {
  const path = relative(join(root, dirname(test)), join(root, file))
    .split(sep)
    .join("/");
  const references = [file, path.startsWith("../") ? path : `./${path}`];
  if (file.startsWith("src/")) references.push(`@/${file.slice(4)}`);
  if (file.startsWith("public/")) references.push(file.slice("public".length));
  return references.some((reference) =>
    ['"', "'", "`"].some(
      (quote) =>
        content.includes(`${quote}${reference}${quote}`) ||
        content.includes(`${quote}${reference}?`),
    ),
  );
}

function browserCheck(suite, reason) {
  const {
    id,
    env = {},
    browsers = ["chrome"],
    baseUrlEnv = "BASE_URL",
    artifactDirEnv,
    localOnly = false,
    requiresProductionBuild = false,
    timeoutMs = browserTimeoutMs,
  } = suite;
  return {
    id: `verify-${id}`,
    kind: "browser",
    command: process.execPath,
    args: [`scripts/verify-${id}.mjs`],
    env: { PW_BROWSER_CHANNEL: "chrome", ...env },
    baseUrlEnv,
    browsers,
    artifactDirEnv,
    localOnly,
    requiresProductionBuild,
    timeoutMs,
    reason,
  };
}

/** Plan checks against the current checkout from repo-relative changed paths. */
export function planChecks({ files, root = repositoryRoot, full = false }) {
  const checks = [];
  const warnings = [];
  const unavailableChecks = [];
  const unknownFiles = new Set();
  const areas = new Set();
  const changes = [];
  for (const file of [...new Set(files)].sort()) {
    const change = normalizePath(root, file);
    if (!change) {
      unknownFiles.add(file);
      warnings.push(`Ignored path outside the repository: ${file}`);
      continue;
    }
    if (!change.part && /^(?:docs\/|design\/|\.claude\/)|\.(?:md|mdx)$/i.test(change.source)) {
      continue;
    }
    changes.push(change);
    const matchedAreas = areaNames(change.source);
    matchedAreas.forEach((area) => areas.add(area));
    if (
      !matchedAreas.length &&
      !change.source.endsWith(".test.mjs") &&
      (implementationPaths.test(change.source) || change.original.startsWith("source-parts/"))
    ) {
      unknownFiles.add(change.original);
    }
  }

  if (areas.has("shared")) sharedAreas.forEach((area) => areas.add(area));
  if (areas.has("server")) areas.add("delivery");
  if (unknownFiles.size) areas.add("navigation");

  const runtime = changes.some(
    ({ source }) =>
      /^(?:src|server|public|archives)\//.test(source) && !source.endsWith(".test.mjs"),
  );
  const configuration = changes.some(({ source }) => configPaths.test(source));
  const broad = unknownFiles.size > 0 || configuration || areas.has("server");
  const allGates = full || broad;
  const gateReason = full
    ? "Full verification requested"
    : "Build or unmapped change needs broad verification";
  if (unknownFiles.size) {
    warnings.push(
      `No narrow verification mapping for: ${[...unknownFiles].join(", ")}. Broad checks selected.`,
    );
  }

  const needsSync = changes.some(
    ({ source, part }) => part || existsSync(join(root, "source-parts", source)),
  );
  if (allGates || needsSync) {
    checks.push({
      id: "sync-source-parts",
      kind: "gate",
      command: process.execPath,
      args: ["scripts/sync-source-parts.mjs", "--check"],
      env: {},
      timeoutMs: 30_000,
      reason: allGates ? gateReason : "Source-part parity may have changed",
    });
  }
  const addNpmGate = (id, args, timeoutMs, reason = gateReason) =>
    checks.push({ id, kind: "gate", command: "npm", args, env: {}, timeoutMs, reason });
  if (allGates) addNpmGate("lint", ["run", "lint"], 300_000);
  if (allGates || runtime) {
    addNpmGate(
      "typecheck",
      ["run", "typecheck"],
      300_000,
      allGates ? gateReason : "Application source changed",
    );
  }
  if (allGates) addNpmGate("test", ["test"], 600_000);

  const tests = new Set();
  const changedPaths = [...new Set(changes.map(({ source }) => source))];
  const knownVerifiers = new Set(browserSuites.map(({ id }) => `scripts/verify-${id}.mjs`));
  // The runner adds this specialized forced-GC suite for Rexonance or --memory.
  knownVerifiers.add("scripts/verify-rexonance-heap.mjs");
  for (const path of changedPaths) {
    if (
      /^scripts\/verify-.*\.mjs$/.test(path) &&
      !path.endsWith(".test.mjs") &&
      !knownVerifiers.has(path)
    ) {
      warnings.push(`Changed verifier has no harness adapter: ${path}`);
    }
  }
  for (const path of changedPaths.filter((path) => path.endsWith(".test.mjs"))) {
    if (existsSync(join(root, path))) tests.add(path);
    else warnings.push(`Changed test no longer exists: ${path}`);
  }

  if (allGates && existsSync(join(root, extraTest))) tests.add(extraTest);
  if (!allGates && changedPaths.length) {
    const testAreas = new Set(areas);
    if (areas.has("delivery")) releaseTestAreas.forEach((area) => testAreas.add(area));
    for (const test of listTests(root)) {
      if (tests.has(test) || areaNames(test).some((area) => testAreas.has(area))) {
        tests.add(test);
        continue;
      }
      const content = readFileSync(join(root, test), "utf8");
      if (changedPaths.some((path) => path !== test && mentionsFile(root, test, content, path))) {
        tests.add(test);
      }
    }
  }
  const testPaths = [...tests]
    .filter((path) => !allGates || !/^scripts\/[^/]+\.test\.mjs$/.test(path))
    .sort();
  if (testPaths.length) {
    checks.push({
      id: "selected-node-tests",
      kind: "node",
      command: process.execPath,
      args: ["--test", ...testPaths.map((path) => `./${path}`)],
      env: {},
      timeoutMs: 420_000,
      reason: allGates
        ? "Tests outside the npm test discovery directory"
        : "Changed, referenced or area-specific tests",
    });
  }

  if (allGates) {
    checks.push({
      id: "build",
      kind: "gate",
      command: process.execPath,
      args: ["node_modules/vite/bin/vite.js", "build"],
      env: {},
      timeoutMs: 900_000,
      reason: gateReason,
    });
  }

  for (const suite of browserSuites) {
    const script = `scripts/verify-${suite.id}.mjs`;
    const matchesAreas = suite.areas?.filter((area) => areas.has(area)) ?? [];
    const explicit = changedPaths.includes(script);
    const matchesPath = changedPaths.some(
      (path) => !path.endsWith(".test.mjs") && suite.match?.test(path),
    );
    const broadCheck = (full || broad) && suite.id === "site-health";
    if (!explicit && !matchesAreas.length && !matchesPath && !broadCheck) continue;
    if (!existsSync(join(root, script))) {
      warnings.push(`Selected browser verifier no longer exists: ${script}`);
      unavailableChecks.push({
        id: `verify-${suite.id}`,
        script,
        reason: "Selected browser verifier no longer exists",
      });
      continue;
    }
    const reason = explicit
      ? "Browser verifier changed"
      : broadCheck
        ? gateReason
        : matchesAreas.length
          ? `Affected area: ${matchesAreas.join(", ")}`
          : "Affected source or assets";
    checks.push(browserCheck(suite, reason));
  }

  return {
    checks,
    areas: [...areas].sort(),
    unknownFiles: [...unknownFiles].sort(),
    warnings,
    unavailableChecks,
  };
}
