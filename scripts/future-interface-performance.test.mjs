import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("adaptive futuristic interface layer is last in the world cascade", async () => {
  const index = await read("src/styles-world.css");
  assert.match(index, /@import "\.\/styles-world\/24\.css";\s*@import "\.\/styles-world\/25\.css";/);
});

test("modern interface layer includes mobile and economy rendering fallbacks", async () => {
  const css = await read("src/styles-world/25.css");
  assert.match(css, /data-world-effects="economy"/);
  assert.match(css, /data-world-page-visible="false"/);
  assert.match(css, /@media \(max-width: 840px\), \(pointer: coarse\)/);
  assert.match(css, /content-visibility: auto/);
  assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/);
});

test("Liquid Glass rails use concentric shell, lens, and control radii", async () => {
  const css = await read("src/styles-world/28.css");
  assert.match(css, /--liquid-shell-radius: 999px/);
  assert.match(css, /--liquid-control-radius: 999px/);
  assert.match(
    css,
    /\.rider-tabs\.liquid-swipe-tabs \{[\s\S]*?--liquid-shell-radius: 40px;[\s\S]*?--liquid-control-radius: 999px;/,
  );
  assert.match(css, /\.manager-archive-tabs\.liquid-swipe-tabs > \.liquid-selection-lens[\s\S]*border-radius: var\(--liquid-control-radius\)/);
  assert.match(css, /\.manager-archive-tabs\.liquid-swipe-tabs > button\[role="tab"\][\s\S]*border-radius: var\(--liquid-control-radius\)/);
});

test("pointer lighting coalesces work and pauses with the page", async () => {
  const pointer = await read("src/components/world/use-liquid-pointer-light.ts");
  const mode = await read("src/components/world/use-world-mode.ts");
  assert.match(pointer, /if \(!active && pointerId === null\) return/);
  assert.match(pointer, /visibilitychange/);
  assert.match(pointer, /requestAnimationFrame\(flush\)/);
  // The economy flag (data-world-effects) is set before the first paint by the
  // root's device profile; the World hook keeps the page-visibility flag.
  assert.match(await read("src/lib/device-profile-gate.js"), /data-world-effects", "economy"/);
  assert.match(mode, /worldPageVisible/);
});

test("final future interface polish stays finite, light, and motion-safe", async () => {
  const root = await read("src/routes/__root.tsx");
  const css = await read("src/styles-future-interface.css");
  assert.match(root, /frostedControlsCss[\s\S]*futureInterfaceCss/);
  assert.match(root, /href: frostedControlsCss[\s\S]*href: futureInterfaceCss/);
  assert.doesNotMatch(css, /animation(?:-\w+)?\s*:[^;]*(?:infinite|filter)/i);
  assert.doesNotMatch(css, /(?<!-)filter\s*:/i);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);

  const riderTabs = css.match(/:is\([^{}]*\.rider-tabs[^{}]*\)\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(riderTabs, /\b(?:width|height|scale|transform|padding|margin)\s*:/i);
});
