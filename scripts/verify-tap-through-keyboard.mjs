import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import ts from "typescript";

// Exercise the real guard with trusted Chrome keyboard/pointer activation.
// The fixture isolates the guard from cinematic timing and route changes.
const source = process.env.QA_BASELINE
  ? execFileSync("git", ["show", "HEAD:src/lib/tap-through-guard.ts"], { encoding: "utf8" })
  : readFileSync(new URL("../src/lib/tap-through-guard.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const browser = await chromium.launch({ channel: process.env.PW_BROWSER_CHANNEL || "chrome" });
try {
  const page = await browser.newPage();
  await page.setContent(
    '<button id="arm">close a touch overlay</button><button id="action">next keyboard action</button>',
  );
  await page.addScriptTag({
    content: `const exports = {}; ${code}
    window.count = 0;
    window.arm = () => { window.armedAt = performance.now(); exports.guardTapThrough(); };
    document.getElementById("arm").onclick = window.arm;
    document.getElementById("action").onclick = () => window.count++;
  `,
  });
  await page.locator("#arm").click();
  await page.locator("#action").focus();
  await page.keyboard.press("Enter");
  assert.ok(
    (await page.evaluate(() => performance.now() - window.armedAt)) < 450,
    "keyboard must activate during the guard",
  );
  assert.equal(
    await page.evaluate(() => window.count),
    1,
    "trusted keyboard activation must not be swallowed",
  );
  await page.evaluate(() => window.arm());
  await page.locator("#action").click();
  assert.equal(
    await page.evaluate(() => window.count),
    1,
    "pointer compatibility input must stay blocked",
  );
  await page.evaluate(() => document.getElementById("action").click());
  assert.equal(
    await page.evaluate(() => window.count),
    2,
    "synthetic cleanup actions remain allowed",
  );
  await page.waitForTimeout(500);
  await page.locator("#action").click();
  assert.equal(
    await page.evaluate(() => window.count),
    3,
    "pointer input resumes after the guard expires",
  );
  console.log("PASS: trusted keyboard, pointer-through protection, synthetic cleanup and expiry");
} finally {
  await browser.close();
}
