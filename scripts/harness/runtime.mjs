import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { createWriteStream, existsSync, readFileSync, writeFileSync, unlinkSync, openSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

export function localUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Harness targets must be credential-free loopback origins (http://127.0.0.1:PORT).");
  }
  return url.origin;
}

// Never pass ambient deployment/database credentials to builds or browser tests.
export function localEnvironment(extra = {}, source = process.env) {
  const names = ["PATH", "HOME", "USERPROFILE", "SystemRoot", "SYSTEMROOT", "COMSPEC", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "CI", "NO_COLOR", "FORCE_COLOR", "PLAYWRIGHT_BROWSERS_PATH", "PW_BROWSER_CHANNEL"];
  const env = Object.fromEntries(names.filter(key => source[key] != null).map(key => [key, source[key]]));
  return { ...env, ...extra, DATABASE_URL: "", APPLY_DESTRUCTIVE_MIGRATIONS: "0" };
}

export function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim();
}

export function revision(root, ref) {
  // Resolve options as values; reject ambiguous leading flags before invoking git.
  if (!ref || ref.startsWith("-") || /[\0\r\n]/.test(ref)) throw new Error("Invalid Git reference");
  return git(root, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
}

export function changedFiles(root, baseRef) {
  const baseSha = revision(root, baseRef);
  const output = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  return { baseSha, files: [...new Set([
    ...output(["diff", "--name-only", "-z", "--no-renames", `${baseSha}...HEAD`]),
    ...output(["diff", "--name-only", "-z", "--no-renames", "HEAD"]),
    ...output(["ls-files", "--others", "--exclude-standard", "-z"]),
  ])].sort() };
}

export function acquireLock(root) {
  const common = resolve(root, git(root, ["rev-parse", "--git-common-dir"]));
  const file = join(tmpdir(), `dw-harness-${createHash("sha256").update(common).digest("hex").slice(0, 20)}.lock`);
  const token = randomUUID();
  const claim = () => { const fd = openSync(file, "wx", 0o600); closeSync(fd); writeFileSync(file, JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() })); };
  try { claim(); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const prior = JSON.parse(readFileSync(file, "utf8"));
    let alive = true;
    try { process.kill(prior.pid, 0); } catch (e) { if (e.code === "ESRCH") alive = false; }
    if (alive) throw new Error(`Another harness owns this repository (PID ${prior.pid}); browser/performance runs must be sequential.`);
    unlinkSync(file); claim();
  }
  return () => { if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).token === token) unlinkSync(file); };
}

export function launch(command, args, { cwd, env = {}, log, timeoutMs = 600000 } = {}) {
  const stream = log ? createWriteStream(log) : null;
  const child = spawn(command, args, { cwd, env: localEnvironment(env), shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  let timedOut = false;
  let closed = false;
  let killTimer;
  const kill = signal => {
    if (closed || !child.pid) return;
    try {
      if (process.platform === "win32") {
        if (child.exitCode == null && child.signalCode == null) child.kill(signal);
      } else {
        // A descendant may still hold the output pipes after the leader exits.
        process.kill(-child.pid, signal);
      }
    } catch { /* already exited */ }
  };
  const stop = () => {
    if (closed || killTimer) return;
    kill("SIGTERM");
    killTimer = setTimeout(() => kill("SIGKILL"), 2500);
    killTimer.unref();
  };
  const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; stop(); }, timeoutMs) : null;
  child.stdout.on("data", chunk => stream?.write(chunk));
  child.stderr.on("data", chunk => stream?.write(chunk));
  const done = new Promise(resolveDone => {
    let error;
    child.on("error", e => { error = e.message; });
    child.once("close", (code, signal) => {
      closed = true;
      clearTimeout(timer); clearTimeout(killTimer);
      const result = { code, signal, timedOut, error: error ?? null };
      if (stream) stream.end(() => resolveDone(result)); else resolveDone(result);
    });
  });
  return { child, done, stop };
}

export async function freePort() {
  const server = createServer();
  await new Promise((yes, no) => { server.once("error", no); server.listen(0, "127.0.0.1", yes); });
  const port = server.address().port;
  await new Promise((yes, no) => server.close(error => error ? no(error) : yes()));
  return port;
}

export async function waitForPreview(url, processHandle, timeoutMs = 30_000, expectedSha) {
  const identityUrl = new URL("/release-identity.json", localUrl(url));
  const deadline = performance.now() + timeoutMs;
  const child = processHandle?.child;
  const assertRunning = () => {
    if (child?.exitCode != null || child?.signalCode != null) {
      throw new Error("Preview exited before becoming ready; see preview log");
    }
  };

  while (performance.now() < deadline) {
    assertRunning();
    const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
    const signal = AbortSignal.timeout(Math.min(1500, remaining));
    const response = await fetch(identityUrl, { signal, redirect: "error" }).catch(() => null);
    if (response?.ok) {
      const identity = await response.json().catch((error) => {
        if (signal.aborted) return null;
        throw new Error("Preview release identity is not valid JSON", { cause: error });
      });
      if (!signal.aborted && performance.now() <= deadline) {
        assertRunning();
        if (typeof identity?.sha !== "string" || !/^[0-9a-f]{40}$/u.test(identity.sha)) {
          throw new Error("Preview release identity does not contain a full commit SHA");
        }
        if (expectedSha != null && identity.sha !== expectedSha) {
          throw new Error(`Preview SHA mismatch: expected ${expectedSha}, received ${identity.sha}`);
        }
        return identity;
      }
    } else if (response?.body) {
      await response.body.cancel().catch(() => {});
    }
    const pause = Math.min(200, deadline - performance.now());
    if (pause > 0) await new Promise((resolveWait) => setTimeout(resolveWait, pause));
  }
  assertRunning();
  throw new Error("Preview readiness timed out");
}
