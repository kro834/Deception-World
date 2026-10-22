# Rexonance 引き継ぎ (2026-10-22)

main に反映済み: 炎の作り直し (覆う→完全燃焼→爆散→ナノマシン)、共鳴場の装着演出、Blender製アンダースーツ/装着前リアクター、ナノマシン品質、構成・文字組み・動きの全面刷新、厳格走査で確定した21件、装着切替フェード+リアクター消灯部の読み戻し削減。

以下は未完了。各節がそのまま別のAIに渡せる指示文。

---

## 1. レビュー待ちブランチ `review/rexonance-stylesheets-share` (8b3cadc)

> リポジトリ kro834/Deception-World のブランチ `review/rexonance-stylesheets-share` を審査し、問題なければ main にマージしてください。内容: (a) /rexonance-saga の専用スタイルシート23枚を、適用順を変えずに @import 集約ファイル1枚にまとめた (描画ブロックの local stylesheet 49→27)。(b) 枚数と順序を固定する `scripts/rexonance-stylesheet-budget.test.mjs`。(c) 専用共有カード `public/og-rexonance-saga-20261022.jpg` (1200×630) と route head の og:image 登録。
> 必ず確認すること: main にはこのブランチ以降に別セッションが `src/styles-rexonance-apex.css` 等の新しいシートを追加している。マージ時にそれらを集約ファイルの正しい位置 (元のリンク順) に入れ、予算テストを更新する。証明として、main とブランチの本番ビルドで /rexonance-saga の全要素の getComputedStyle ダンプが 390(タッチ)/1440 で一致し、390/1024/1440 の全ページスクリーンショットの画素差がゼロであること (入場カバー中・メニュー展開・reduced-motion も)。一致しない場合は集約をやめ、共有カード部分だけマージする。styles-world の部分集合化 (計画の第2段階) は状態依存で証明できないため行わない。ゲート: npm test (失敗0)、npm run typecheck、npm run lint (エラー0)、npm run build。main へは push で本番公開される。

## 2. レビュー待ちブランチ `review/rexonance-fire-polish` (65723cb)

> リポジトリ kro834/Deception-World のブランチ `review/rexonance-fire-polish` を審査し、問題なければ main にマージしてください。内容 (src/lib/rexonance-fire/*, src/lib/rexonance-flame.js のみ): 爆散の亀裂を点線から連続した裂け目に、足裏下の段差状の帯の除去、覆っていく炎の前縁を不規則に、脛横・頭上の炎の輪郭の直線を崩す。CPU版 (fire-raster.js) と GLSL (fire-shaders.js) は1行対応を維持。
> オーナー仕様: 「炎がアンダースーツを段々と覆っていき、爆散。ナノマシンと化し、そこから装着シークエンスが始まります。」「消え際に近づくにつれて完全燃焼になる感じで色が変わります」。炎は固体のように揺れて見えてはならない。全身は動かさない。
> 確認すること: 入場演出 (World メニューから /rexonance-saga へ。凍結クロックで 900–1500ms) とスクロール場面 (進行度 .03–.12) を 1440 と 390 タッチで連続フレーム撮影し、上記4点が改善され後退がないこと。タイミング値・fireFragmentPose の意味・描画予算・決定性 (逆スクロールで同一フレーム)・フレームごとの割り当てゼロを維持。未検証: タッチ (detail 0) の GPU 読み戻しでの CPU/GPU 一致。ゲートは上と同じ。

## 3. 装着準備のさらなる短縮

> /rexonance-saga の装着場面 (src/lib/rexonance-resonance.js がマウント) で、スマホ相当 (390 タッチ、CPU 4倍低速) の準備完了までの時間が約7秒かかる。律速は src/lib/rexonance-assembly-nanites.js の createAssemblyLayerJob が GPU キャンバスから行う「ソースごと1回」の読み戻し (1回で最大1.2秒) と、src/lib/rexonance-unlit.js の driver シート読み戻し (155–350ms)。GPU 待ちを避けるため、元画像をデコード済み ImageBitmap / OffscreenCanvas(willReadFrequently) など CPU 側のバッファから読む構成に変え、出力バイトが現行と完全一致することをテストで固定してください。逆スクロールでの決定性、タッチ層の軽さ、reduced-motion/economy の静止画は維持。過去ヒーロー到達から data-rzn-load=ready までの時間を main と比較して報告。

## 4. 厳格走査の未検証指摘 (94件) の検証と修正

> /rexonance-saga について以前の厳格監査が出した指摘のうち、下記94件は未検証 (監査時点の版は 94c0f77。その後に構成・文字組み・動き・炎・装着の大改修が入っている)。各指摘について、現在の main の本番ビルドで再現するかを実測し (Chromium、1440 / 1024 タッチ / 390 タッチ、必要なら reduced-motion)、再現しないものは除外、再現するものはオーナーの決定 (コード内の "(owner, …)" コメント、docs/、DESIGN*.md) に反しない範囲で修正してください。オーナー文言は誤りの修正以外で書き換えない。ゲートは上と同じ。

- F08 [typography/high] Every Japanese display line asks for palt, but the font has none, so headings set fixed-width kana with full-em gaps after 、 and 。 — src/styles-stage-special.css, src/styles-rexonance-forge.css, src/styles-rexonance-saga.css
- F09 [typography/high] The chapter 03 (suit-up) heading is outside the type system: the eyebrow is 14px Noto body text, the H2 is 48px/26px without palt or keep-all, and a g — src/styles-rexonance-editorial.css, src/components/rexonance-saga/rexonance-assembly-guide.tsx, src/styles-rexonance-type-20261021.css
- F10 [typography/high] No type scale: 39 computed sizes, 19 Michroma size/weight/tracking combinations and 13 tracking values, defined in five font-token namespaces across a — src/styles-stage.css, src/styles-rexonance-saga.css, src/styles-showcase-elevation.css
- F11 [layout/high] The chapter 03 opener breaks the chapter layout: no 03 numeral although the map lists one, its own gutter (x=56 vs 488/940), the 形態を見る button 1,300 px — src/components/rexonance-saga/rexonance-assembly-guide.tsx, src/styles-rexonance-editorial.css, src/styles-rexonance-layout-20261021.css
- F12 [layout/high] The hero's first screen is a split HUD dashboard, not a film key visual: the name appears three times and the art fills about 35% of the screen — src/components/rexonance-saga/rexonance-saga.tsx, src/styles-stage-rexonance.css, src/styles-rexonance-layout-20261021.css
- F13 [layout/high] One identical frame is pinned for about 8,400px, and the same artwork returns twice more — src/styles-stage-rexonance.css, src/components/rexonance-saga/rexonance-saga.tsx
- F14 [layout/high] iPad landscape hero: stacking the stage first pushes the H1 「究極が始まる。」 below the fold — src/styles-stage-rexonance.css, src/styles-saga-showcase.css, docs/cinematic-design-20260921.md
- F15 [layout/high] iPad portrait system grid renders three 238px columns with lines of about 13 Japanese characters — src/styles-stage-rexonance.css, src/styles-rexonance-saga.css
- F16 [layout/high] The footer CTAs show no focus indicator: the plates' clip-path cuts away the outline drawn 3px outside them, in forced colours too — src/styles-stage-rexonance.css, src/styles-showcase-elevation.css, src/styles-saga-showcase.css
- F17 [layout/high] Label in Name failures (WCAG 2.5.3, Level A): the accessible names of the header brand link and the comparison select leave out their visible labels — src/components/rexonance-saga/rexonance-saga.tsx
- F18 [motion/high] Entry handover: after the tap on the Rexonance card, the /world page shows uncovered for seconds before the call begins — src/components/load-gate.tsx, src/styles-transition-cinema.css, src/components/rexonance-saga/rexonance-call-sequence.tsx
- F19 [motion/high] The MAX/ULTRA form change loads different image files from the ones on screen, so the morph starts late and the old form flashes back over the new one — src/components/rexonance-saga/rexonance-saga.tsx, src/lib/rexonance-overwrite.js, src/lib/warm-rexonance-stages.ts
- F20 [art/high] The P14 artwork is far brighter than the rest of the page and shows garbled AI pseudo-text — public/rexonance-p14-core.jpg, public/rexonance-p14-core-delivery-640.webp, public/rexonance-p14-core-delivery-960.webp
- F31 [fire/med] When scrolling stops, the calm frame redraws all 220 fire-heat tongues in a new, unrelated pattern, so the flame jumps on every stop in the fire windo — src/lib/rexonance-resonance.js, src/lib/rexonance-flame.js
- F35 [typography/med] Chapter H2s don't lead their chapters: they cap at 62px while stage H3s, figures and the footer H2 outgrow them, and on tablets they are smaller than — src/styles-stage-special.css, src/styles-rexonance-couture.css, src/styles-rexonance-forge.css
- F36 [typography/med] 10-11px tracked Michroma and Japanese micro-labels at every width (chapter map, CONTENTS counter, FORM SEQUENCE/COMPARISON, form status, brand), under — src/styles-rexonance-editorial.css, src/styles-rexonance-saga.css, DESIGN.md
- F37 [typography/med] Reading text stays the same size while display type scales 3x: 14px body and 13px notes, CTAs and nav at 1920 (display to body 18:1) — src/styles-rexonance-editorial.css, src/styles-rexonance-saga.css
- F38 [typography/med] Section kickers use wider Michroma tracking (0.20-0.22em) than DESIGN.md specifies for phones, so 11 kickers wrap at 320 and one splits at a hyphen (' — src/styles-rexonance-editorial.css, src/styles-stage-rexonance.css, src/styles-rexonance-forge.css
- F39 [typography/med] Comparison and P14 footnotes run 49-73 characters per line at 13px (923 px wide at 1920), in low-contrast ink — src/styles-stage-rexonance.css, src/styles-rexonance-saga.css, src/styles-rexonance-couture.css
- F40 [typography/med] Weights the loaded faces don't have: Zen Kaku 600 renders as 700, Michroma 500 as 400, and the hero h1's 680 as 700 — src/lib/site-fonts.ts, src/styles-rexonance-editorial.css, src/styles-rexonance-saga.css
- F41 [typography/med] Phrase breaking in multi-line body text causes bad breaks (犬と／して, 『終焉』／へ) and a ragged edge that varies by 23-35% — src/styles-future-interface.css, src/styles-rexonance-finish.css, src/styles-rexonance-couture.css
- F42 [typography/med] Latin instrument labels are set in four faces, and the same product names appear in two different faces — src/styles-rexonance-forge.css, src/styles-rexonance-editorial.css
- F43 [typography/med] Two similar gothics (Zen Kaku and Noto Sans JP) alternate at 12-14px inside the same components, and neither gives the page a distinct display voice — src/styles-stage.css, src/lib/site-fonts.ts, src/styles-rexonance-forge.css
- F44 [typography/med] Font payload: about 95 font files and 1.3 MB on first load, for two overlapping Japanese gothics (Noto Sans JP 38 files / 805-825 KB, Zen Kaku 52 file — src/styles-rexonance-type-20261021.css, scripts/rexonance-type-copy.mjs, src/lib/site-fonts.ts
- F45 [typography/med] Font swaps reflow the header and hero copy during the arrival (Michroma loaded with display=swap) — src/lib/world-head.ts, src/routes/rexonance-saga.tsx, src/styles-rexonance-saga.css
- F46 [layout/med] In forced colours the active stage tab paints a dark fill with near-black text, so the selected form is unreadable — src/styles-showcase-elevation.css, src/styles-rexonance-saga.css, src/styles-stage-rexonance.css
- F47 [layout/med] The CUT 01/02 headline plates have 0 px inline padding, so labels, figures and captions sit on the plate edge and its chamfer — src/styles-stage-rexonance.css, src/styles-rexonance-armour.css
- F48 [layout/med] P14 generation table: each row sizes its own 'auto auto' value columns, so the P1（基準）100% column shifts by up to ~70 px (desktop) and 47 px (phone) fr — src/styles-stage-rexonance.css, src/styles-rexonance-layout-20261021.css
- F49 [layout/med] In forced colours the 'P14（換算）' labels in the generation table are cut off below their top half — src/styles-p14-calibration.css, src/styles-rexonance-armour.css, src/styles-stage-rexonance.css
- F50 [layout/med] Three unrelated CTA button styles on one page (hero, assembly/coda, footer) — src/components/rexonance-saga/rexonance-saga.tsx, src/components/rexonance-saga/rexonance-assembly-guide.tsx, src/styles-rexonance-instrument.css
- F51 [layout/med] The P14 comparator shows 'P1比' twice: a bordered <output> in the card header next to the real P1比/P2比 tab buttons — src/components/rexonance-saga/rexonance-saga.tsx, src/styles-rexonance-finish.css, src/styles-p14-calibration.css
- F52 [layout/med] On iPad landscape the form stage centres 369px of art between ~290px empty flanks and pushes the copy to a second screen — src/styles-stage-rexonance.css, src/styles-rexonance-zenith.css
- F53 [layout/med] On tablets the P14 core image is a 21:8 letterbox upscaled from a 1000px source, and its sizes hint claims a 40vw slot — src/styles-stage-rexonance.css, src/lib/rexonance-images.ts, src/components/rexonance-saga/rexonance-saga.tsx
- F54 [layout/med] On iPad portrait, FORM COMPARISON stacks the three forms vertically, so a 'side-by-side' comparison takes about 1.9 screens — src/styles-rexonance-editorial.css, src/components/rexonance-saga/rexonance-form-comparison.tsx
- F55 [layout/med] English labels have no lang='en' under html lang=ja (no [lang] attributes on the page, 44-75 Latin runs), so Japanese screen-reader voices read about — src/components/rexonance-saga/rexonance-saga.tsx, src/components/rexonance-saga/rexonance-editorial.tsx, src/components/rexonance-saga/rexonance-assembly-guide.tsx
- F56 [layout/med] Both comparison read-outs put key={baseline} on the aria-live element itself, so each change replaces the live region and the result is not reliably a — src/components/rexonance-saga/rexonance-saga.tsx
- F57 [layout/med] Choosing a form from the comparison drawer leaves the glass lens on the previously selected tab — src/components/rexonance-saga/rexonance-saga.tsx, src/components/rexonance-saga/rexonance-form-comparison.tsx
- F58 [layout/med] Rotating the phone keeps the raw scrollY, so the reader lands in a different chapter, and a pinned suit-up is thrown out into 04 STAGES — src/components/rexonance-saga/rexonance-saga.tsx, src/styles-rexonance-zenith.css, src/lib/local-nav-current.ts
- F59 [layout/med] On phones the side menu opens scrolled past the page's own chapter list (SECTIONS is hidden above SPECIAL) — src/components/world/world-chrome.tsx, src/lib/special-site-sections.ts
- F60 [layout/med] On touch, a vertical swipe that starts on the stage tab rail does not scroll the page: the rail is a 72px dead band 90% of the screen wide — src/styles-frosted-controls.css, src/components/rexonance-saga/rexonance-saga.tsx
- F61 [layout/med] Three chapter navigations disagree: suit-up is missing from the local nav, side menu and search, the menu numbers chapters 03/04 where the page says 0 — src/lib/special-site-sections.ts, src/components/rexonance-saga/rexonance-editorial.tsx, src/components/search/search-data.ts
- F62 [layout/med] P14 comparison on the P2 baseline: the 'same ether' row reads 650% / 6.5倍 / +550%, but its own data gives 500% / 5.0倍 / +400% — src/components/rexonance-saga/rexonance-saga.tsx
- F63 [layout/med] The Extreme comparison leaves out Extreme's own P14, which makes P14 look like a Rexonance-only advantage, contrary to the repo's data — src/components/rexonance-saga/rexonance-saga.tsx, src/components/extreme-saga/extreme-saga.tsx
- F64 [layout/med] The i-2 plate gives the manufacturing process the self-resonance system's job, and repeats plate 03 — src/components/rexonance-saga/rexonance-saga.tsx, src/lib/rexonance-profile.ts
- F65 [layout/med] The Vinculum comparison figures contradict the Form Archive that the footer links to — src/components/rexonance-saga/rexonance-saga.tsx, public/saga-form-archive-embedded.html, src/components/extreme-saga/extreme-saga.tsx
- F66 [layout/med] The hero's ghost 'REXONANCE' watermark collides with the scroll cue (8 px overlap at 1440x900), and on phones with the image seam and the figure's leg — src/styles-rexonance-forge.css, src/components/rexonance-saga/rexonance-saga.tsx
- F67 [layout/med] The desktop hero jumps 15 px after hydration, just as its entrance animation starts — src/styles-rexonance-saga.css, src/components/rexonance-saga/rexonance-saga.tsx
- F68 [layout/med] Load is dominated by rendering: TBT 1.7 s on desktop and 1.25 s on phone, with each full relayout costing 104-145 ms — src/lib/local-nav-current.ts, src/components/rexonance-saga/rexonance-saga.tsx
- F69 [layout/med] The hero image's sizes='64vw' makes desktops download the 960/1086 file for a 310-677 px box (114 KB extra, about 45%, on the LCP image) — src/lib/rexonance-images.ts, src/routes/rexonance-saga.tsx
- F70 [layout/med] The chapter emitter rings sit on the titles instead of the numerals — src/styles-rexonance-resonance.css
- F71 [layout/med] The stage callouts are printed over the busiest parts of the artwork — src/components/rexonance-saga/rexonance-saga.tsx, src/styles-rexonance-zenith.css
- F72 [layout/med] Pacing: the transformation starts 8,745px down the page, after about 7,200px of tables — src/components/rexonance-saga/rexonance-saga.tsx
- F73 [layout/med] The end card does not echo the hero: the title lockup never returns and the figure is reused — src/components/rexonance-saga/rexonance-saga.tsx, src/styles-rexonance-layout-20261021.css
- F74 [motion/med] P14 figures print twice while they lock: a small gold copy overlaps the 26px white figure — src/styles-rexonance-forge.css, src/styles-rexonance-resonance.css, src/lib/rexonance-resonance.js
- F75 [motion/med] Count-up figures show zero-padded '000%' or '000.0%' while already on screen — src/lib/rexonance-resonance.js, src/styles-rexonance-resonance.css
- F76 [motion/med] The side-panel card art unmounts at the tap, so the open panel flashes empty cards and slides out blank — src/components/world/world-chrome.tsx
- F77 [motion/med] The hero CTAs '変身を体験' and '三つの形態を見る', '形態を見る' and the FORM COMPARISON bar have no hover, press or transition — src/styles-rexonance-editorial.css, src/components/rexonance-saga/rexonance-editorial.tsx, src/components/rexonance-saga/rexonance-assembly-guide.tsx
- F78 [motion/med] The FORM COMPARISON drawer snaps open with no motion, pushing the page down 745 px in one frame — src/components/rexonance-saga/rexonance-form-comparison.tsx, src/styles-rexonance-editorial.css
- F79 [motion/med] LCP is the animated hero lede text (2.4-6.5 s on localhost); the 256 KB high-priority hero image never counts as LCP — src/styles-rexonance-premiere.css, src/styles-rexonance-resonance.css, src/routes/rexonance-saga.tsx
- F80 [motion/med] The hero title sequence is rushed and unstaged: every beat finishes within about 1.4 s — src/styles-rexonance-premiere.css, src/lib/rexonance-choreography.js
- F94 [typography/low] The hero kicker breaks as 'THE NEXT GENERATION / OF SA-GA', and the second line hangs back under the gold rule at the left margin — src/styles-saga-showcase.css, src/styles-rexonance-forge.css, src/components/rexonance-saga/rexonance-saga.tsx
- F95 [typography/low] At 320 the stage tab 'ULTRA 60s' wraps to two lines while the other two tabs stay on one — src/styles-rexonance-editorial.css, src/styles-stage-rexonance.css
- F96 [typography/low] Counters and step numbers use five faces (Forge, Michroma, Oxanium, Zen, Noto), and figures inside headlines use the display font's digits — src/styles-rexonance-forge.css, src/styles-rexonance-editorial.css
- F97 [typography/low] Symbols fall back out of their font stacks: arrows, the em dash, fullwidth ！, ∞ and 〜 render in Noto, Oxanium or Zen — src/lib/world-head.ts, src/styles-rexonance-forge.css
- F98 [typography/low] The 'DW' monogram fills its frame edge to edge — src/styles-rexonance-saga.css, src/styles-rexonance-type-20261021.css
- F99 [layout/low] System cards 01/02/03 wrap their kickers and titles unevenly, so the body copy starts at three different heights — src/components/rexonance-saga/rexonance-saga.tsx, src/styles-rexonance-instrument.css, src/styles-rexonance-forge.css
- F100 [layout/low] Chapter index: the fifth entry, 05, stretches across both columns, leaving its arrow about 1,000 px from the label — src/styles-rexonance-editorial.css
- F101 [layout/low] Stages section: the right column ends 125 px above the left, and the FORM COMPARISON bar floats in an empty band of about 450 px — src/components/rexonance-saga/rexonance-saga.tsx, src/components/rexonance-saga/rexonance-form-comparison.tsx, src/styles-rexonance-editorial.css
- F102 [layout/low] The footer figure stands on the very last pixel row of the page, with no floor beneath it — src/styles-rexonance-instrument.css, src/components/rexonance-saga/rexonance-saga.tsx
- F103 [layout/low] Decorative pink streaks still show in forced-colours mode, where ornaments should be removed — src/styles-rexonance-armour.css, src/styles-rexonance-couture.css, src/styles-rexonance-resonance.css
- F104 [layout/low] Touch targets under the page's own minimum: P1比/P2比 at 42-44 px, the assembly and coda links and the scroll cue at 44 px — src/styles-p14-calibration.css, src/styles-rexonance-editorial.css, DESIGN.md
- F105 [layout/low] At 320 the two hero CTAs stack at different widths (139px and 181px) — src/styles-rexonance-editorial.css, src/styles-saga-showcase.css
- F106 [layout/low] Phone hints tell touch users to use 矢印キー (arrow keys) — src/components/rexonance-saga/rexonance-saga.tsx, src/components/rexonance-saga/rexonance-editorial.tsx
- F107 [layout/low] The stage tabpanel is itself aria-live while its children re-key, so every tab change re-reads the whole panel after the tab announcement — src/components/rexonance-saga/rexonance-saga.tsx
- F108 [layout/low] The P1比 / P2比 focus ring is cut off on two sides by overflow:hidden on the range control — src/styles-p14-calibration.css
- F109 [layout/low] aria-label on elements without a role is ignored, so the bar-chart summaries and group names never reach assistive technology — src/components/rexonance-saga/rexonance-saga.tsx
- F110 [layout/low] Form-comparison buttons lose the form name when selected (「表示中の形態」) and use aria-pressed for a single-choice set — src/components/rexonance-saga/rexonance-form-comparison.tsx
- F111 [layout/low] Page chrome (brand, in-page nav, menu button) and the closing CTAs sit inside <main>, and the page has no banner or contentinfo landmark — src/components/rexonance-saga/rexonance-saga.tsx
- F112 [layout/low] Choosing a form in the FORM COMPARISON drawer changes a stage panel that is fully above the viewport, so the call, the panel change and the morph all — src/components/rexonance-saga/rexonance-form-comparison.tsx, src/components/rexonance-saga/rexonance-saga.tsx
- F113 [layout/low] #assembly lands 7px below the sticky nav, against 24px for every other chapter — src/styles-rexonance-editorial.css, src/styles-rexonance-polish.css
- F114 [layout/low] The System plates mix plain form (常体, plate 02) and polite form (敬体, plates 01 and 03) — src/components/rexonance-saga/rexonance-saga.tsx
- F115 [layout/low] In reduced-motion or economy mode, the replay bar still offers to replay by scrolling an animation the page has just said it skips — src/components/rexonance-saga/rexonance-assembly-guide.tsx
- F116 [layout/low] The P14 baseline control is labelled 比較対象 on the range input but 比較基準 on the iOS select, and what it actually sets is the 100% baseline — src/components/rexonance-saga/rexonance-saga.tsx
- F117 [layout/low] Digit grouping is inconsistent within the same comparison rows — src/components/rexonance-saga/rexonance-saga.tsx
- F118 [layout/low] The new hero slate names the base form 'STANDARD / HIGH', an internal key, while the page calls it レクソナンス / HIGH — src/components/rexonance-saga/rexonance-saga.tsx
- F119 [layout/low] Hard seams between chapters: the stage ends in a flat cut straight into a solid band — src/styles-rexonance-layout-20261021.css, src/styles-stage-rexonance.css
- F120 [layout/low] The form panel's art ends in a hard edge across the shins — src/components/rexonance-saga/rexonance-saga.tsx, src/styles-rexonance-layout-20261021.css
- F121 [art/low] The stage artwork is cropped at the crest tips, so the framed figure's helmet touches the frame edge — public/rider-rexonance-saga-pickup-20260923-delivery-1086.webp, src/lib/rexonance-images.ts
- F122 [motion/low] Pressing the already-active P14 pill flips it to solid white for the duration of the press (leftover :active rule from an earlier sheet) — src/styles-rexonance-finish.css, src/styles-p14-calibration.css
- F123 [motion/low] The footer CTA's hover lift, border fade and press scale snap instantly, because one sheet's transition list replaces the others — src/styles-rexonance-armour.css, src/styles-rexonance-saga.css, src/styles-rexonance-finish.css
- F124 [motion/low] In-page jumps smooth-scroll about 8,400 px through every scroll-driven scene — src/styles-world/01.css, src/components/rexonance-saga/rexonance-editorial.tsx, src/styles-rexonance-saga.css
- F125 [motion/low] The handover from the call to the page has no matching cut, and the hero then waits about 0.4-1.3 s for its own title — src/styles-rexonance-forge.css, src/components/rexonance-saga/rexonance-call-sequence.tsx, src/components/load-gate.tsx
- F126 [motion/low] Motion timing and easing are not systematised: 54 duration values, 16 curves, and different hover and press behaviour on sibling controls — src/styles-rexonance-saga.css, src/styles-rexonance-finish.css, src/styles-rexonance-premiere.css
- F127 [motion/low] The P14 slider animates layout properties: the thumb's left and the fill's width — src/styles-p14-calibration.css, src/styles-rexonance-saga.css
