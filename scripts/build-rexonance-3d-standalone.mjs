// The REXONANCE 3D viewer as one shareable page, outside the site:
//
//   node scripts/build-rexonance-3d-standalone.mjs [--out output/rexonance-3d/standalone]
//
// Writes index.html (the viewer bundled with three.js, the Draco GLB and the poster
// embedded) beside decoders/ (Draco, WebAssembly and plain-JS builds), textures/ and
// reference/. Serve the folder as it is; the page needs no server code. The site's own
// page stays /rexonance-3d.
import { readFile, mkdir, writeFile, copyFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argOut = process.argv.indexOf("--out");
const out = resolve(root, argOut > 0 ? process.argv[argOut + 1] : "output/rexonance-3d/standalone");
const pub = (file) => join(root, "public", file);

const bundle = await rolldown({
  input: join(root, "src/lib/rexonance-3d/standalone.ts"),
  platform: "browser",
  logLevel: "warn",
  // DRACOLoader builds its default decoder URLs from import.meta.url when it loads; an
  // IIFE has no import.meta, so point it at the page (the viewer passes its own path).
  transform: { define: { "import.meta.url": "document.baseURI" } },
});
const { output } = await bundle.generate({
  format: "iife",
  name: "RexonanceStandalone",
  minify: true,
  codeSplitting: false,
});
await bundle.close();
const code = output[0].code.replace(/<\/script/giu, "<\\/script");

const glb = await readFile(pub("rexonance-3d-20261030/rexonance.glb"));
const manifest = JSON.parse(
  await readFile(pub("rexonance-3d-20261030/model-manifest.json"), "utf8"),
);
const poster = await readFile(pub("rexonance-3d-20261030/rexonance-3d-480.webp"));
const triangles = new Intl.NumberFormat("ja-JP").format(manifest.triangles);

await mkdir(join(out, "decoders"), { recursive: true });
await mkdir(join(out, "textures"), { recursive: true });
await mkdir(join(out, "reference"), { recursive: true });
for (const file of ["draco_decoder.js", "draco_wasm_wrapper.js", "draco_decoder.wasm"])
  await copyFile(pub(`dogs-archive-20261028/decoders/draco/${file}`), join(out, "decoders", file));
await copyFile(
  pub("rexonance-3d-20261030/textures/scale-normal.webp"),
  join(out, "textures/scale-normal.webp"),
);
const sheets = [
  ["front-10", "正面"],
  ["right-07", "右側面"],
  ["back-09", "背面"],
  ["left-08", "左側面"],
];
for (const [id] of sheets)
  await copyFile(
    pub(`rexonance-3d-20261030/reference/${id}.webp`),
    join(out, "reference", `${id}.webp`),
  );

const views = [
  ["front", "正面"],
  ["right", "右側面"],
  ["back", "背面"],
  ["left", "左側面"],
  ["oblique", "斜め"],
];

const html = `<title>Rexonance 3D</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="レクソナンスサーガの立体模型。十面の設定画から起こした黒鱗と金の装甲を、あらゆる角度から。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Noto+Sans+JP:wght@400;500&display=swap">
<style>
/* Layout: the suit stands on a full-height night stage; its name sits top left, one control bar rests at the foot, the sheets open as a side drawer. */
:root {
  color-scheme: dark;
  --stage: #05060d;
  --stage-glow: #0d1430;
  --panel: rgba(12, 14, 28, 0.82);
  --hairline: rgba(207, 154, 98, 0.34);
  --ink: #ece8f4;
  --muted: #a39fbb;
  --gold: #cf9a62;
  --crystal: #6a8fff;
  --font-display: "Cormorant Garamond", Georgia, "Times New Roman", serif;
  --font-ui: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", system-ui, sans-serif;
}
html, body { height: 100%; }
body { background: var(--stage); color: var(--ink); font-family: var(--font-ui); overflow: hidden; }
.rx {
  position: relative; height: 100%; box-sizing: border-box;
  display: grid; grid-template-rows: auto 1fr auto; gap: 12px;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 18px;
  background: radial-gradient(58% 52% at 50% 46%, var(--stage-glow), var(--stage) 72%);
}
.rx-stage { position: absolute; inset: 0; }
.rx-stage canvas { display: block; width: 100%; height: 100%; outline: none; }
.rx-stage canvas:focus-visible { box-shadow: inset 0 0 0 2px var(--crystal); }
.rx-poster {
  position: absolute; inset: 0; margin: auto; height: min(78%, 720px); width: auto; max-width: 100%;
  object-fit: contain; opacity: 0.55; filter: saturate(0.85); pointer-events: none;
  transition: opacity 0.6s ease;
}
.rx[data-viewer-status="ready"] .rx-poster { opacity: 0; }
.rx-head { position: relative; z-index: 2; display: grid; gap: 6px; justify-self: start; pointer-events: none; }
.rx-head h1 {
  margin: 0; font-family: var(--font-display); font-weight: 600;
  font-size: clamp(26px, 4.2vw, 44px); letter-spacing: 0.16em; line-height: 1; text-wrap: balance;
}
.rx-head h1 span { color: var(--gold); }
.rx-head p { margin: 0; font-size: 13px; letter-spacing: 0.12em; color: var(--muted); }
.rx-spec { margin: 4px 0 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.rx-spec div { display: flex; gap: 6px; }
.rx-spec dt { color: var(--gold); }
.rx-spec dd { margin: 0; }
.rx-status {
  position: relative; z-index: 2; align-self: end; justify-self: center; margin: 0;
  font-size: 13px; letter-spacing: 0.08em; color: var(--muted); text-align: center; max-width: 36em;
  transition: opacity 0.4s ease;
}
.rx[data-viewer-status="ready"] .rx-status { opacity: 0; }
.rx[data-viewer-status="error"] .rx-status { color: var(--ink); }
.rx-bar {
  position: relative; z-index: 2; justify-self: center; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px;
  padding: 6px; border: 1px solid var(--hairline); border-radius: 999px; background: var(--panel);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); max-width: 100%; box-sizing: border-box;
}
.rx-group { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; }
.rx-group + .rx-group { border-left: 1px solid var(--hairline); padding-left: 6px; }
.rx-bar button, .rx-panel button {
  font: inherit; font-size: 13px; color: var(--ink); background: transparent; border: 0; border-radius: 999px;
  padding: 8px 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; min-height: 36px;
}
.rx-bar button:hover:not(:disabled), .rx-panel button:hover { background: rgba(106, 143, 255, 0.14); }
.rx-bar button[aria-pressed="true"], .rx-panel button[aria-pressed="true"] {
  background: rgba(207, 154, 98, 0.18); box-shadow: inset 0 0 0 1px var(--gold); color: #fff;
}
.rx-bar button:disabled { opacity: 0.4; cursor: default; }
.rx-bar button:focus-visible, .rx-panel button:focus-visible { outline: 2px solid var(--crystal); outline-offset: 2px; }
.rx-bar svg { width: 16px; height: 16px; }
.rx-panel {
  position: absolute; z-index: 3; top: 18px; bottom: 18px; right: max(16px, env(safe-area-inset-right, 0px));
  width: min(320px, calc(100% - 32px)); box-sizing: border-box; display: grid; grid-template-rows: auto auto 1fr; gap: 10px;
  padding: 14px; border: 1px solid var(--hairline); border-radius: 14px; background: var(--panel);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.rx-panel header { display: flex; align-items: center; justify-content: space-between; }
.rx-panel h2 { margin: 0; font-size: 14px; font-weight: 500; letter-spacing: 0.12em; }
.rx-sheets { display: flex; flex-wrap: wrap; gap: 4px; }
.rx-panel figure { margin: 0; min-height: 0; display: grid; grid-template-rows: 1fr auto; gap: 6px; }
.rx-panel img { width: 100%; height: 100%; min-height: 0; object-fit: contain; background: #f4f2f7; border-radius: 8px; }
.rx-panel figcaption { font-size: 12px; color: var(--muted); text-align: center; }
.rx-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 640px) {
  .rx-group + .rx-group { border-left: 0; padding-left: 0; }
  .rx-bar { border-radius: 18px; }
  .rx-bar button { padding: 7px 10px; }
  .rx-panel { top: auto; height: 62%; left: max(16px, env(safe-area-inset-left, 0px)); width: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .rx-poster, .rx-status { transition: none; }
}
</style>
<div class="rx" data-rx-root data-viewer-status="loading">
  <div class="rx-stage" data-rx-stage></div>
  <img class="rx-poster" src="data:image/webp;base64,${poster.toString("base64")}" alt="" width="480" height="720">
  <header class="rx-head" data-rx-head>
    <h1>REXONANCE <span>3D</span></h1>
    <p>レクソナンスサーガ&#x3000;立体模型</p>
    <dl class="rx-spec">
      <div><dt>全高</dt><dd>2.00 m</dd></div>
      <div><dt>面数</dt><dd>${triangles}</dd></div>
      <div><dt>資料</dt><dd>設定画 10 面</dd></div>
    </dl>
  </header>
  <p class="rx-status" data-rx-status role="status">立体模型を読み込み中</p>
  <nav class="rx-bar" data-rx-toolbar aria-label="立体模型の操作">
    <div class="rx-group" role="group" aria-label="視点">
${views.map(([id, label]) => `      <button type="button" id="rx-view-${id}" data-rx-view="${id}" aria-pressed="false" disabled>${label}</button>`).join("\n")}
    </div>
    <div class="rx-group" role="group" aria-label="表示">
      <button type="button" id="rx-rotate" data-rx-rotate aria-pressed="false" disabled>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M18 3v4h-4M6 21v-4h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>自動回転</span>
      </button>
      <button type="button" id="rx-pause" data-rx-pause aria-pressed="false" disabled>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6v12M16 6v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
        <span>一時停止</span>
      </button>
      <button type="button" id="rx-sheets" data-rx-sheets aria-expanded="false" aria-controls="rx-panel">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h7v14H4zM13 5h7v14h-7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
        <span>参照画像</span>
      </button>
    </div>
  </nav>
  <aside class="rx-panel" id="rx-panel" data-rx-panel aria-labelledby="rx-panel-title" hidden>
    <header>
      <h2 id="rx-panel-title">参照画像</h2>
      <button type="button" id="rx-panel-close" data-rx-close aria-label="参照画像を閉じる">閉じる</button>
    </header>
    <div class="rx-sheets" role="group" aria-label="設定画の向き">
${sheets.map(([id, label]) => `      <button type="button" id="rx-sheet-${id}" data-rx-sheet="${id}" aria-pressed="false">${label}</button>`).join("\n")}
    </div>
    <figure>
      <img data-rx-sheet-image src="reference/front-10.webp" alt="レクソナンスサーガの設定画、正面" width="640" height="960" decoding="async">
      <figcaption data-rx-sheet-caption>正面の設定画</figcaption>
    </figure>
  </aside>
  <span class="rx-sr" data-rx-announce aria-live="polite"></span>
</div>
<script>window.REXONANCE_GLB = "${glb.toString("base64")}";</script>
<script>${code}</script>
<script>
RexonanceStandalone.mountRexonanceStandalone(document.querySelector("[data-rx-root]"), {
  modelBase64: window.REXONANCE_GLB,
  scaleMapUrl: "textures/scale-normal.webp",
  dracoDecoderPath: "decoders/",
  referencePath: "reference/",
});
</script>
`;
await writeFile(join(out, "index.html"), html);
const size = (await stat(join(out, "index.html"))).size;
console.log(
  JSON.stringify({
    out,
    html: size,
    bundle: code.length,
    glb: glb.length,
    triangles: manifest.triangles,
  }),
);
