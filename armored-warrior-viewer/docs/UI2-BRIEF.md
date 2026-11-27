# UI v2 — a new interface for the new site

`SP` = `/tmp/claude-0/-home-user-Deception-World/e3b46e06-f0d8-552d-88dc-50400a3b44dc/scratchpad`.
Read `SP/docs/CONTRACT.md` for the project as a whole; this file is the brief for the interface.

## Why
The owner's words: 「新しいサイトとして公開。UIも一新します」 — the viewer goes out as a new site, and the
interface is to be made anew, not iterated. The previous brush-up (`SP/work/index.html`, `viewer.css`;
the judge gave it 88/100) kept the original's structure: a masthead, a boxed stage, a dock of text
buttons under it. That structure is what is being replaced. Do not start from that CSS.

Three designers work in parallel, one direction each (section "Directions"). The judge scores all three
with the UI rubric; the lead and the owner choose. So commit fully to your direction and do not hedge
towards the others.

## What the page is
- One character, one 3D model: 装甲戦士, a tokusatsu-style armoured hero. Near-black armour, bronze-gold
  trim, crystal blades running blue → violet → pink, a silver-white "driver" belt buckle with cyan and
  magenta light, star emblems on the shoulder discs, a scorpion-like tail. Character sheets:
  `SP/refs/front.png`, `SP/refs/back.jpg`. Current render: `SP/shots/r03/*.png` (the shading is still being
  refined; the palette and the dark stage stay).
- Functions — all of them exist in `viewer.js`; the interface only presents them: orbit by drag, zoom by
  pinch or scroll; seven preset views (front 正面, rear 背面, side 側面, face 顔, chest 胸の炉, belt ベルト,
  belt-rear ベルト背面); reset; a quality toggle (standard ⇄ detail); loading with progress; error;
  WebGL context lost and restored.
- Audience: mostly iPhone, Safari, portrait. Desktop second.
- There is no other content: no story, no stats, no parts database. Do not invent any.

## Fixed: the contract with viewer.js
- Elements the viewer looks up (keep the ids and attributes; the tag for controls must be `<button>`):
  `#stage` (the viewer appends its `<canvas>` here and sizes it to the stage's box), `#poster` (`<img>`;
  the viewer sets `src`, `alt`, `hidden`), `#status` (`role="status"`; the viewer sets its text and
  `hidden`), `#progress` (optional, decorative; text such as `42%` while downloading), `#quality`
  (the viewer sets text, `disabled`, `aria-pressed`), `#reset` (the viewer sets `disabled`),
  `[data-view="front|rear|side|face|chest|belt|belt-rear"]` (the viewer sets `aria-pressed`; when the
  camera has been moved by hand none is pressed), `#hint` (the canvas is `aria-describedby="hint"`, so
  it must exist and hold the gesture hint as text).
- State for CSS: `html[data-viewer="loading|ready|error|lost"]`, `html[data-mode="standard|detail"]`,
  the custom property `--load-progress` (0 → 1) on `#stage` while a model downloads.
- Text the viewer writes (owner-approved copy; design for these lengths, do not replace them):
  `#status`: 「3Dモデルを読み込み中」「高精細モデルを読み込み中」「切替に失敗しました。現在のモデルを表示しています。」
  「3Dを読み込めませんでした。画像で確認するか、再試行できます。」「このブラウザでは3Dを表示できません。画像で各方向を確認できます。」
  「3D表示を復旧中。各方向の画像を確認できます。」「3D表示を再試行できます。」
  `#quality`: 「高精細に切替」「標準に切替」「3D表示を再試行」.
- Head plumbing: your sandbox's `index.html` starts as a copy of the current page. Keep, unchanged, the
  `<meta charset>` and viewport lines, the `modulepreload` links, the inline early-model `<script>`, and
  `<script type="module" src="./viewer.js?v=15">`. Everything else in the file is yours (title, meta
  description, theme-color, icon, body).
- The stage's backdrop is drawn inside the canvas: a radial gradient from `#232a40` (centre) to `#0b0d14`
  (edge), ellipse 62% × 56% at 50% 46% of the stage. The page must paint the same thing behind the
  poster so nothing jumps when the canvas appears. If your design wants other stage colours, say so in
  your hand-back (they are tunables; the lead decides).
- The poster: the viewer picks `previews-v15/<view>.webp` (square) or `previews-v15p/<view>.webp`
  (portrait 5:8; the folder is empty until the final stills exist, so today you get the square one) and
  sets `--poster-ratio` on the `<img>`. Fit it with `object-fit: contain`, centred in the fit area (next
  section).
- No framework, no build step, no request to another host at run time. Vanilla JS in `ui.js` is allowed
  for interface-only behaviour (a collapsible panel, a carousel). It must not touch the canvas, WebGL or
  the viewer's internals; it may click the contract buttons, read `html[data-*]`, and read
  `window.__viewer.state()`.

## New: the stage may run under your controls
`#stage` can be full-bleed with controls floating over it. Tell the viewer which part of the stage is
free with one empty element inside `#stage`:

`<div id="fit" aria-hidden="true"></div>` — positioned absolutely by your CSS so that it covers exactly
the area the figure may occupy (`pointer-events: none`, no paint). The viewer frames the figure inside
that rectangle and follows it when the layout changes; place the poster in the same rectangle. Without
the element the whole stage is the fit area. Support for `#fit` in viewer.js is being added by another
worker; until it lands the figure is centred in the whole stage — design as if it worked, and say in
your hand-back what rectangle you expect at 390×844.

Backdrop with a fit area: the gradient's centre moves to the point 50% / 46% of the fit rectangle; its
radii stay 62% × 56% of the stage. Paint the page's copy of the gradient by the same rule (define your
insets once as custom properties and use them for both `#fit` and the gradient position), so poster and
canvas still match.

## States (every one must appear in your screenshots)
loading (poster, progress, status text) · ready, first visit (gesture hint) · free view (no preset
pressed) · a close-up view pressed · detail model loading · detail on · error (3D unavailable: the poster
stays, a message, a retry button) · context lost (復旧中) · disabled controls · keyboard focus ·
`prefers-reduced-motion` · `forced-colors` (must stay usable).
`SP/pipeline/ui/states-real.cjs` forces these states on the real page (read its header for the options;
it takes `--url` and `--css`). The view tag and the free-view label in the old page were CSS-only; do
the same or drop them.

## Phone requirements
- Check at 390×844 and 430×932 (iPhone, portrait), 360×640 (small), 844×390 (landscape), 1280×800 and
  1920×1080 (desktop). `viewport-fit=cover` is set: keep everything clear of the notch, the Dynamic
  Island and the home indicator with `env(safe-area-inset-*)`.
- Touch targets at least 44×44 CSS px; primary controls within reach of a thumb (bottom of the screen);
  nothing depends on hover.
- The canvas owns drag and pinch on the stage. Do not put a scrolling container over it. If your page
  is taller than the screen, say how a visitor scrolls past the stage without the canvas eating the
  gesture; if it is one screen, the page must not scroll or rubber-band on phones.
- Use `svh` (not `vh` / `dvh`) for heights tied to the screen, so Safari's toolbar showing and hiding
  does not resize the canvas.
- Keep effects cheap: no `backdrop-filter` across the stage (a blur over a WebGL canvas is expensive on
  iOS; a small one is acceptable if you justify it), no continuous animation while the 3D is
  interactive.
- Type: system fonts by default (iOS: Hiragino Sans, Hiragino Mincho ProN; give real fallbacks for
  Android and Windows). A display face is allowed only if self-hosted, subset to the glyphs you use
  (`pyftsubset` from fonttools; `@fontsource/*` packages on npm are reachable from this machine, nothing
  else is), under an open licence with the licence file in the tree, `font-display: swap`, 60 KB or less
  in total, and the layout must hold with the fallback.
- Thumbnails, if you use them: 192² WebP crops made from `SP/work/previews-v15/*.webp` into
  `<sandbox>/thumbs/`, 8 KB or less each. The lead regenerates them from the final stills.

## Copy
Japanese. Existing strings: 装甲戦士 / 3Dビューア, the view names above, リセット, the hint
「ドラッグで回転 · ピンチ／スクロールで拡大・縮小」, and the viewer's own strings. New labels are allowed where the
design needs them: short and plain. List every new string in your hand-back; the owner approves copy.

## Work in your sandbox only
`SP/ui2-a/`, `SP/ui2-b/` or `SP/ui2-c/` (served at `http://localhost:8765/ui2-<x>/`). Each already holds
a starting `index.html`, an empty `viewer.css`, a three-line `ui.js`, and links to a stable copy of the
viewer and to the models and stills. Edit `index.html`, `viewer.css`, `ui.js`; add `thumbs/`, `fonts/`.
Do not edit anything else, in particular nothing under `SP/work/` or `SP/work-safari/`.

Screenshots: `cd SP && node tools/shot.cjs --url http://localhost:8765/ui2-<x>/ --out shots/ui2-<x>/<name>
--clip page --mobile --size 390x844 --dpr 2 --views front,chest --orbits free:140:80` (see the header of
`tools/shot.cjs`; drop `--mobile` for desktop sizes), plus the states script. Rendering is software GL:
6–10 s per frame, pictures correct, timings meaningless. One browser at a time — four other workers
share the machine's 4 cores. Playwright is installed (`require('playwright')`; outside `SP/tools` set
`NODE_PATH=/opt/node-tools/node_modules`); do not install browsers. Look at your own screenshots with
the Read tool and fix what you see before handing back.

## Hand back
- The three files (and assets) in your sandbox, working against the real viewer.
- Screenshots in `SP/shots/ui2-<x>/`: phone portrait ready (front), a close-up view, free view, detail
  on, loading with a real percentage, error, context lost, keyboard focus, phone landscape, desktop.
  One contact sheet `SP/shots/ui2-<x>/sheet.png` with the six most telling phone frames side by side.
- A rationale in five lines or fewer; the list of new copy strings; what you need from the viewer (the
  fit rectangle you expect, stage colours, anything else); known weaknesses, plainly.

## How it is judged
UI rubric: U1 レイアウトと階層 20 · U2 タイポグラフィ 15 · U3 作品との調和 15 · U4 スマホでの操作性 20 ·
U5 状態表現 15 · U6 アクセシビリティ 10 · U7 完成度 5. Pass = 85 or more with every category at 70% or more.
The old interface scored 88, so a new one has to be at least as usable while being unmistakably new.

## Directions
**A — イマーシブ・ショーケース.** The stage is the whole screen, edge to edge; the figure is as large as
the phone allows. Controls float over it: a slim title at the top, a dock at the bottom whose view
selector uses small thumbnails of the seven stills (the picture is the label; the name sits under it),
the quality toggle and reset as compact controls, the gesture hint appearing once and fading. The
reference is a game's character showcase or a product 3D viewer: the model is the page.

**B — ドライバー HUD.** The interface as the hero's own instrumentation, taken from the belt driver:
silver-white and near-black hardware, cyan and magenta light lines, chamfered corners, a view selector
that reads as a device control (a segmented dial or a rail with a moving indicator), status and progress
as instrument read-outs showing real state only (mode, view, load progress — no invented numbers).
Full-bleed stage under a HUD frame. Tokusatsu mecha design, not generic sci-fi.

**C — 設定資料.** The page as an animation production design sheet (settei) for this character, in a
dark "night" edition so the stage keeps its backdrop: a title block like a model sheet's header, the
stage as the main plate with registration marks, and below it the seven views as a numbered plate
gallery (still, name, a one-line factual caption such as 「胸の炉 正面寄り」) — tapping a plate moves the 3D
camera and returns to the stage. This one is a scrolling page; solve the scroll-versus-orbit conflict
well.
