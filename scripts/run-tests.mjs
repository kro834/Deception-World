import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const testFiles = readdirSync(new URL("./", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => fileURLToPath(new URL(entry.name, import.meta.url)))
  .sort();
const forwardedArgs = process.argv.slice(2);
if (forwardedArgs[0] === "--") forwardedArgs.shift();

if (testFiles.length === 0) {
  console.error("No repository test files were discovered under scripts/");
  process.exitCode = 1;
} else {
  // Passing an explicitly discovered list is portable across cmd.exe,
  // PowerShell and POSIX shells, and prevents generated build output from
  // being rediscovered as a second, stale copy of the same test suite.
  const result = spawnSync(
    process.execPath,
    ["--test", ...forwardedArgs, ...testFiles],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
}
