#!/usr/bin/env node
/**
 * Build and serve a production build of any git ref, or of a checkout, on a
 * loopback port (GET/HEAD only). These are the "base" and "candidate" servers
 * that scripts/verify-samsung-performance.mjs compares.
 *
 *   node scripts/serve-ref-build.mjs <git-ref> [--port=8171] [--rebuild] [--build-only] [--install]
 *   node scripts/serve-ref-build.mjs --dir=<checkout> [--port=8172] [--no-build]
 *
 * A ref is exported with `git archive` into $REF_BUILD_ROOT/<sha>. The
 * default root is <os tmpdir>/deception-world-ref-builds. No git worktree is
 * registered. The export gets a copy-on-write clone of this checkout's
 * node_modules and a copy of its .env, so both builds see the same VITE_*
 * values. It is then built with `npx vite build`. As with
 * scripts/preview-production.mjs, neither the release `db:migrate` step nor
 * the `archive:embed` prebuild runs, and the server keeps its in-memory
 * database. A finished build of the same sha is reused unless --rebuild is
 * given. If the ref's package-lock.json differs from this checkout's, the
 * script warns; --install then runs `npm ci` in the export.
 *
 * --dir builds an existing checkout in place, for example a candidate with
 * uncommitted changes. --no-build serves its current .vercel/output.
 *
 * Typical same-session A/B (see PERFORMANCE_TARGETS.md, Samsung Internet):
 *   node scripts/serve-ref-build.mjs d0a9da8 --port=8171 &
 *   node scripts/serve-ref-build.mjs --dir=. --port=8172 &
 *   BASE_REF_URL=http://127.0.0.1:8171 BASE_URL=http://127.0.0.1:8172 \
 *     node scripts/verify-samsung-performance.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STAMP = ".serve-ref-build.json";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const positional = args.filter(
  (arg, index) => !arg.startsWith("--") && !["--port", "--dir"].includes(args[index - 1]),
);

if (flag("help") || (!positional[0] && !option("dir"))) {
  console.error(
    "usage: node scripts/serve-ref-build.mjs <git-ref> [--port=8171] [--rebuild] [--build-only] [--install]\n" +
      "       node scripts/serve-ref-build.mjs --dir=<checkout> [--port=8172] [--no-build]",
  );
  process.exit(flag("help") ? 0 : 2);
}

const port = Number(option("port") ?? 8171);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error(`--port must be an integer in 1024-65535, got ${option("port")}`);
  process.exit(2);
}

const git = (cwd, ...gitArgs) => {
  const result = spawnSync("git", ["-C", cwd, ...gitArgs], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
};

function run(command, commandArgs, cwd) {
  console.error(`[serve-ref-build] ${cwd}$ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, { cwd, stdio: ["ignore", "inherit", "inherit"] });
  if (result.status !== 0) {
    console.error(`[serve-ref-build] ${command} failed with status ${result.status}`);
    process.exit(1);
  }
}

/** `git archive <sha> | tar -x -C <dir>` without a shell. */
async function exportTree(sha, dir) {
  mkdirSync(dir, { recursive: true });
  const archive = spawn("git", ["-C", repoRoot, "archive", "--format=tar", sha], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const untar = spawn("tar", ["-x", "-f", "-", "-C", dir], {
    stdio: ["pipe", "inherit", "inherit"],
  });
  archive.stdout.pipe(untar.stdin);
  const exited = (child) => new Promise((done) => child.on("close", (code) => done(code)));
  const [archiveStatus, untarStatus] = await Promise.all([exited(archive), exited(untar)]);
  if (archiveStatus !== 0 || untarStatus !== 0) {
    console.error(
      `[serve-ref-build] export of ${sha} failed (git ${archiveStatus}, tar ${untarStatus})`,
    );
    process.exit(1);
  }
}

/** Copy-on-write where the filesystem allows it (APFS, btrfs, XFS); a symlink otherwise. */
function cloneNodeModules(dir) {
  const source = join(repoRoot, "node_modules");
  const target = join(dir, "node_modules");
  if (existsSync(target)) return;
  if (!existsSync(source)) {
    console.error(`[serve-ref-build] ${source} is missing; run npm ci in this checkout first`);
    process.exit(1);
  }
  const copyArgs = process.platform === "darwin" ? ["-Rc"] : ["-R", "--reflink=auto"];
  const copied = spawnSync("cp", [...copyArgs, source, target], { stdio: "inherit" });
  if (copied.status !== 0) {
    console.error("[serve-ref-build] node_modules copy failed; linking instead");
    spawnSync("ln", ["-s", source, target], { stdio: "inherit" });
  }
}

let buildDir;
let label;
let sha;
if (option("dir")) {
  buildDir = resolve(option("dir"));
  if (!existsSync(join(buildDir, "package.json"))) {
    console.error(`[serve-ref-build] ${buildDir} has no package.json`);
    process.exit(1);
  }
  sha = git(buildDir, "rev-parse", "HEAD") ?? "unknown";
  const dirty = git(buildDir, "status", "--porcelain", "--untracked-files=no");
  label = `${buildDir} @ ${sha.slice(0, 12)}${dirty ? " + uncommitted changes" : ""}`;
  if (!flag("no-build")) run("npx", ["vite", "build"], buildDir);
} else {
  const ref = positional[0];
  sha = git(repoRoot, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
  if (!sha) {
    console.error(`[serve-ref-build] ${ref} is not a commit in ${repoRoot}`);
    process.exit(1);
  }
  const buildRoot = process.env.REF_BUILD_ROOT || join(tmpdir(), "deception-world-ref-builds");
  buildDir = join(buildRoot, sha.slice(0, 12));
  label = `${ref} @ ${sha.slice(0, 12)}`;
  if (!existsSync(join(buildDir, "package.json"))) await exportTree(sha, buildDir);
  cloneNodeModules(buildDir);
  const env = join(repoRoot, ".env");
  if (existsSync(env) && !existsSync(join(buildDir, ".env")))
    copyFileSync(env, join(buildDir, ".env"));
  const lock = (dir) => {
    try {
      return readFileSync(join(dir, "package-lock.json"), "utf8");
    } catch {
      return "";
    }
  };
  if (lock(buildDir) !== lock(repoRoot)) {
    if (flag("install")) run("npm", ["ci"], buildDir);
    else
      console.error(
        `[serve-ref-build] warning: ${ref} pins other dependencies than this checkout; ` +
          "rerun with --install to npm ci the export",
      );
  }
  const stampPath = join(buildDir, ".vercel/output", STAMP);
  let built = false;
  try {
    built = JSON.parse(readFileSync(stampPath, "utf8")).sha === sha;
  } catch {
    built = false;
  }
  if (!built || flag("rebuild")) {
    run("npx", ["vite", "build"], buildDir);
    writeFileSync(stampPath, JSON.stringify({ sha, ref, builtAt: new Date().toISOString() }));
  } else {
    console.error(`[serve-ref-build] reusing the build in ${buildDir} (--rebuild to redo it)`);
  }
}

console.error(`[serve-ref-build] build directory: ${buildDir}`);
if (flag("build-only")) process.exit(0);

// The rest mirrors scripts/preview-production.mjs with a chosen root and port.
const publicRoot = resolve(buildDir, ".vercel/output/static");
const serverEntry = resolve(buildDir, ".vercel/output/functions/__server.func/index.mjs");
if (!existsSync(serverEntry)) {
  console.error(`[serve-ref-build] ${serverEntry} is missing; build first`);
  process.exit(1);
}
const handler = (await import(pathToFileURL(serverEntry))).default;
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".webp": "image/webp",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
};
createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const path = resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(publicRoot + sep) && path !== publicRoot) {
      res.writeHead(403);
      res.end();
      return;
    }
    const file = await stat(path).catch(() => null);
    if (file?.isFile()) {
      res.writeHead(200, {
        "content-type": mime[extname(path)] ?? "application/octet-stream",
        "content-length": file.size,
      });
      if (req.method === "HEAD") res.end();
      else createReadStream(path).pipe(res);
      return;
    }
    const response = await handler.fetch(
      new Request(url, { method: req.method, headers: req.headers }),
    );
    const responseHeaders = Object.fromEntries(response.headers);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) responseHeaders["set-cookie"] = cookies;
    res.writeHead(response.status, responseHeaders);
    if (response.body && req.method !== "HEAD") Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end("Production preview failed");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Production preview of ${label}: http://127.0.0.1:${port}`),
);
