import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("the baked fire fields match every outgoing cutout and preserve its ordered fracture origins", () => {
  const generator = fileURLToPath(new URL("./build-far-from-fire-masks.mjs", import.meta.url));
  execFileSync(process.execPath, [generator, "--check"], { stdio: "inherit" });
});
