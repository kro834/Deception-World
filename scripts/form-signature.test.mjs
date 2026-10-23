import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const forms = read("src/components/world/rider-page.tsx");
const pickup = read("src/components/world/manager-stub.tsx");
const signature =
  read("src/components/world/form-signature.tsx") +
  read("src/components/world/form-signature-state.ts");
const css = read("src/styles-form-signature.css");

test("only Explom and Kemonohen opt into their distinct presentation", () => {
  assert.match(forms, /sub: "エクスプロム",\s*theme: "explom"/);
  assert.match(forms, /sub: "犭フォーム",\s*theme: "kemonohen"/);
  assert.equal(forms.match(/theme: "explom"/g)?.length, 1);
  assert.equal(forms.match(/theme: "kemonohen"/g)?.length, 1);
  assert.match(forms.slice(forms.indexOf("partnerForms.map")), /theme: form.theme/);
  assert.equal(pickup.match(/data-form-theme=\{rider.theme\}/g)?.length, 2);
  assert.match(pickup, /data-form-theme=\{f.theme\}/);
  // Owner (2026-10-23): Explom and 犭 open through their own covers too; only ungated forms open at once.
  assert.match(pickup, /if \(!gate\) \{\s*showDialog\(source\);\s*return;/);
  assert.match(pickup, /const gate = formGate\(rider\.theme\)/);
});

test("signature arrivals are local, finite, disposable, and never hide the art", () => {
  assert.match(signature, /if \(!node \|\| !isSignatureForm\(theme\)\) return/);
  assert.match(signature, /threshold: 0/);
  assert.match(signature, /observer.disconnect\(\)/);
  assert.match(signature, /return \(\) => observer.disconnect\(\)/);
  assert.match(signature, /!\("IntersectionObserver" in window\)/);
  assert.match(signature, /aria-hidden="true"/);
  assert.doesNotMatch(signature, /requestAnimationFrame|setInterval|addEventListener\("scroll"/);
  assert.doesNotMatch(css, /\binfinite\b|filter:\s*(?:blur|url)|animation:[^;]*(?:width|height)/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /data-world-effects="economy"/);
  assert.match(css, /forced-colors: active/);
  assert.doesNotMatch(css, /> img\s*\{[^}]*opacity:\s*0/);
});

test("special type is small, local, licensed, and loaded on only the two rider routes", () => {
  let total = 0;
  for (const face of ["explom-display", "kemonohen-brush"]) {
    const bytes = readFileSync(new URL(`../public/fonts/${face}-20261018.woff2`, import.meta.url));
    assert.equal(bytes.subarray(0, 4).toString(), "wOF2");
    total += bytes.length;
    assert.match(read(`public/fonts/${face}-OFL.txt`), /SIL OPEN FONT LICENSE/);
  }
  assert.ok(total < 12_000, `local subsets are ${total} bytes`);
  assert.equal(css.match(/font-display: swap/g)?.length, 2);
  assert.doesNotMatch(css, /https?:\/\//);
  const head = read("src/lib/world-head.ts");
  assert.match(
    head,
    /id === "over-zeztz" \|\| id === "leddic"\s*\? \[\.\.\.DOSSIER_STYLESHEET_LINKS, \{ rel: "stylesheet", href: formSignatureCssUrl \}\]/,
  );
  const common = head.slice(
    head.indexOf("export const DOSSIER_STYLESHEET_LINKS"),
    head.indexOf("type WorldHeadInput"),
  );
  assert.doesNotMatch(common, /formSignatureCssUrl/);
});
