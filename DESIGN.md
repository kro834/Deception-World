# Deception World — Interface Direction

## Anime film edition — 2026-09-05

This edition supersedes the archive-first styling below while preserving the story, approved illustrations, comparison data and established interactions. The main site should read as an anime film website: lead with key art and the actual film title, give Japanese headlines a clear hierarchy, and use quiet chapter divisions instead of nested HUD frames. Ice blue remains the primary identity; muted rose is a small editorial accent, not another navigation state.

On iPhone, show the poster before the introduction, keep controls in a two-row group and place episode titles below their images. On landscape iPad, balance the poster and introduction in two columns without fixed-height clipping. Controls are at least 48px where practical, primary poster controls are 52px, secondary labels are 12px and reading text is generally 16px. Individual rider and manager accents, along with the distinct special-site identities, remain intact.

Dream Chapter is the first film and a Touhou Project collaboration. Use its approved bamboo-grove artwork, vermilion, night violet, ivory, Mincho typography and a vertical Japanese catchphrase to distinguish it from the blue main site. State the collaboration explicitly without adding unconfirmed plot, characters or claims of endorsement. Character names and descriptions sit below portraits, not on top of faces.

Reuse existing art and installed/system fonts; do not add background video or perpetual full-screen effects. Decoration must not capture touch input. Keep keyboard focus visible, preserve reduced-motion/transparency alternatives and test short taps, deliberate taps, partial-distance slides, menu focus and dialog closing after scroll. `npm run verify:ui` runs the interaction regression checks against a running development/preview server (Chrome by default, configurable with `BASE_URL` and `PW_BROWSER_CHANNEL`). Browser emulation does not replace an iOS Safari device check.

## Thesis

The site is a cinematic official archive: spectacular at story-defining moments and quiet everywhere a visitor must read, compare, or choose. The visual identity remains black, ice blue, and gold; familiar product-design rhythm keeps it usable.

## Refero-informed rules

- Use a restrained sticky header with a hairline divider and one clear active state.
- Group related controls inside calm surfaces instead of giving every control an individual glow.
- Keep content grids regular, with consistent gaps and generous internal padding.
- Let imagery carry color; interface surfaces remain dark-neutral and translucent.
- Use short 150–200ms hover transitions for ordinary controls. Reserve cinematic motion for hero, poster, and major reveal moments.
- Meaningful interface text must not rely on decorative microtype: 11px is the minimum for secondary UI labels, 13px for navigation, and 14px for body copy on mobile.
- Use 46–48px minimum control height for touch targets.
- Corners follow three roles: 12px controls, 18px cards, 26px large editorial panels.
- Borders are hairlines, shadows are low contrast, and active color appears once per component group.

## Preserve

- Original poster aspect ratios and the distinct 前編／後編 presentation.
- The cinematic opening and the futuristic Kamen Rider Saga language.
- Blue-gold as the primary identity, with rider colors limited to active or local states.
- Existing keyboard, reduced-motion, reduced-transparency, and touch accommodations.

## Avoid

- Glows, animated scans, or backdrop blur on every surface.
- Text below 11px when it communicates navigation, metadata, status, or instructions.
- New gesture-only interactions without a normal tap or click path.
- Adding another accent color to shared navigation or general content surfaces.

## Future archive material — 2026-09-05

- Use dark blue metal-like panels, cyan-to-gold edge lighting, circuit-line backgrounds and framed section labels to connect the world archive, dossiers and special sites.
- Inherit the character's existing accent in individual dossiers; Rexonance and Extreme retain their own product colors. Keep portraits and content above decoration.
- Express depth through static gradients and inset edges. Reserve extra light response for fine-pointer hover; do not add continuous full-screen animation, blur layers or gesture-catching overlays.
- Preserve the readability and touch dimensions from the design audit. Reduced-transparency mode uses solid navigation surfaces, and reduced-motion mode disables the new button transition.

## Neo interface — 2026-09-21

`src/styles-world-neo.css` is the final layer on the World route, loaded after the programme sheets. It replaces the paper-and-red programme look with a near-future archive: ink black with a faint 72px grid, ice-cyan hairlines and gold corner brackets, chamfered controls (clip-path only; hit areas and rail geometry are unchanged), outlined chapter numerals, Oxanium readouts for labels and metadata, and one cyan plate for the primary entry. The story insert becomes a dark holographic record instead of a light sheet.

The layer only recolours and decorates. It adds no keyframes, images, blur or touch-action rules, keeps focus rings inside the chamfer with inset shadows, and falls back to solid panels under reduced transparency or increased contrast. Dream Chapter, Rexonance and Extreme keep their own identities; dossier pages already share the cyan-gold archive language.

## Final Stage — 2026-09-22

`/final-stage` is listed under STORIES in the side menu, beside Dream Chapter, and follows the main site's order: STORY (the supplied synopsis), CHARACTERS (eight people on a two-row liquid rail, like the eight riders on the main site; characters with existing dossiers link to them; Nagi and the Archive use their supplied artwork), then the two rider records as hold-and-slide pickups whose dialogs hold the full record and stage rails; stage artwork is shown head to toe (contain, 3:4), never cropped. It reuses the shared special-site base (`styles-rexonance-saga.css`) with `src/styles-final-stage.css` as its skin: ink black with a cold blue-violet cast, ice cyan and gold accents, the supplied ファイナルステージ logo as the hero, then two rider records — 仮面ライダーファーフロムサーガ (five stages on a liquid rail) and 仮面ライダーレルムロイヤル (five crowns on a second rail, plus a four-image gallery). Transformation audio renders as chips, specs as a three-column grid, theories and authorities as card grids. Reduced motion, reduced transparency and 320px phones keep the base contract. The Saga and Realm dossiers gain a `rider-special-site` card that links to the matching record; Extreme and Rexonance keep their own identities.

## Showcase edition (Rexonance / Extreme) — 2026-09-23

`src/styles-saga-showcase.css` restyles both special sites after Apple's product pages. Two neutrals only (`#000` page, `#1d1d1f` tiles), 28px tiles with no borders, glows or shadows, headlines at weight 600 with no tracking, gray `#86868b` body copy under white headlines, and gradient ink only in the hero headline. Stats are naked numbers over a hairline; the comparison, P14 comparator and system blocks become flat tiles with hairline rows; the hero drops its grid, blobs and orbit rings, and its art is masked into the black. On phones, portrait tablets and wide screens the hero stacks copy above the art.

The layer loads after each site's own skin and before the cinematic sheet, so every selector repeats `.rxs-page.rxs-page`. It never sets geometry on the local nav, liquid rail, selects or P14 slider, and leaves the 761–1440 landscape hero grid to the cinematic sheet, since the verify scripts measure those. No text falls below 12px; `scripts/saga-showcase.test.mjs` guards these rules.

## Motion edition — 2026-09-23

`src/styles-motion-edition.css` adds scroll-linked choreography to World, Rexonance, Extreme and Final Stage. Motion is driven by CSS view and scroll timelines, so it follows the reader's scroll, reverses when they scroll back, and never loops or runs on a still page: a reading-progress line under each navigation bar, the hero copy lifting away as the art recedes, chapter headlines and big numbers rising into place, accent hairlines drawing themselves, tiles and pickup cards lifting in reading order, and artwork settling from a slight zoom as it passes. Entry motion ends at `entry 100%`, so elements at the very bottom of a page still finish.

Keyframes touch only opacity, translate and scale. The layer is skipped without timeline support, under reduced motion, in economy rendering, and until a page grants motion (`data-motion-ready`, `.motion-on`). It leaves alone every element that already owns an animation or measured geometry — film reveals, stage panels, metric swaps, the iOS 27 hero and heading timelines, liquid rails, the local nav — and switches off the legacy infinite loops that still reached Final Stage and the World manager cards. `scripts/motion-edition.test.mjs` guards these rules.

## Taisho edition (Dream Chapter) — 2026-09-23

`src/styles-dream-taisho.css` restyles `/dream-chapter` as the official site of a grand Taisho-era film. The page is set as a four-act programme (第一幕 絵看板, 第二幕 登場人物, 第三幕 ドルミネンス, 第四幕 物語の記録). It opens with a one-sheet hero, then a 口上 intertitle and each act in turn, and closes on a credits roll ending in 終.

The palette is one token set on `.dream-page.dream-page`: night ink `#0d0912`, 海老茶, gold, 生成り paper and a vermilion seal. It replaces the navy, cyan and glass skins that had accumulated. Titles use Shippori Mincho B1 in real vertical setting (`writing-mode: vertical-rl`); body text uses Shippori Mincho. Both are loaded on this route only, with `display=swap`, because no system font gives the letterpress weight the look depends on. Ornament is pure CSS: 子持ち罫 rules, double gilt frames with corner brackets, a 七宝 field behind the Dolminence playbill, and a 青海波 band under the story. It sits beside or behind text, never over faces.

- Hero: the vertical gilt title and catch stay right of the face, and the logo and CTAs sit bottom-left above an 帯 band. On phones the catch, copy and band join a grid flow under the title. Every hero layer stays at `z-index: auto`, because isolating the copy block brings back the logo's black JPEG matte.
- Cast: arch portraits with vertical 幟 banners, billed right to left.
- Story: the cards read as intertitles on neri paper. `#cases` now shares the other acts' anchor margin, so its heading no longer lands under the act index.
- Chrome and dossiers: the header and act index are opaque (`#130c17` is restated under reduced transparency). The dossier close button is now vermilion instead of blue.

Motion is limited to a finite opening: the art settles and the title is brushed in. Optional view-timeline rises appear on the credits. All of it is gated by reduced motion and economy mode, and it pauses when the hero leaves view. The layer loads after the Dream sheets and before the cinematic sheet. It keeps the measured geometry of the poster console, dossier columns and story disclosures, and no text is smaller than 12px. `scripts/dream-taisho.test.mjs` guards these rules.

## Mirage edition (World) — 2026-09-23

`src/styles-world-mirage.css` is the last stylesheet on `/world`. It stages Deception World as a live holographic projection from the managers' observation deck:
- panels are built from light and lock on like HUD targets;
- one colour channel is always slightly off-register (the deception);
- signal red marks where the truth is hidden, as in the redaction bar over 欺瞞.

The palette is ice `#7ae8ff` on ink `#04080f`, with gold for the bottom brackets. A prism (ice → violet → magenta → gold) carries the title logo's light streaks into rules, rings and ghosts. Neo and programme tokens are remapped, so older rules recolour for free. HUD labels use a 3.5 KB Michroma subset loaded on the route only (capitals, digits, separators, `display=swap`). Titles stay in Oxanium and Zen Kaku Gothic New, and every label is at least 12px, including the former 6–9px finale, footer, index and dialog labels.

What changed on the page:
- **Hero.** Key art at .5 behind a left-weighted scrim, and a chrome-ink wordmark with a static misregistered ghost. The CRT scanlines and the perpetual scan sweep over the poster are gone. The poster sits in a projection frame, with scroll-turned tick dials (≥1200px, fine pointer), a perspective grid floor, a LIVE indicator, and the 欺瞞 redaction.
- **Tickers.** Scroll-driven signal bands after the hero and before the footer. They repeat only existing copy and are aria-hidden.
- **Chapters and panels.** Chapters draw their prism rule, pass a faint light curtain, and step their outlined numerals into place. Panels lock on with brackets.
- **Manager cards.** The name and OPEN DOSSIER sit together at the bottom, so no text crosses a face.
- **Rider art.** A cool projection grade and an edge fade. The stray divider through the copy and the giant watermark letter over the art are removed.
- **Finale.** Unblurred key art, and an iris of rings that opens through the pinned scroll.
- **Footer.** END OF RECORD / 終端.
- **Layout fix.** The landscape-phone hero grid, which had collapsed to a 120px column, is fixed.

Motion comes in three families, and none of them loops:
- **Boot.** A finite boot from the first paint (frame lock, scan pass, beam sweep, title wipe, ghost pop, projector slit, charged CTA border, telemetry, redaction retract). It runs once per session. An inline head gate (`src/lib/mirage-boot-gate.js`) decides before that paint: lightweight renderers (the `prefersLightweightRendering` rules, checked against each other in the test), same-session reloads, hash landings and rider returns get `html[data-mirage-quiet]`, so no boot starts and nothing snaps at hydration. The boot holds while a load cover or the opening handoff is up. An arrival through the handoff plays only the HUD parts. The boot ends on a sentinel on `.mr-hero-hud`, which is never hidden, via `use-mirage-boot.ts`. That hook also closes a boot that finished before hydration.
- **Scroll.** Scroll-linked choreography on **named** view timelines. An `overflow:hidden` panel would capture an anonymous `view()`. The page's `body` did the same through `overflow-x: hidden`, which had silently frozen every view timeline on World, including the Motion edition's. The layer switches `body` to `overflow-x: clip` on `/world` only. Scroll locks (side menu, rail drag, loading cover, open dialogs) keep their own `overflow: hidden`. While one is active, the choreography is switched off rather than left to rebind to the locked body.
- **Hover.** Fine-pointer holography (foil sweeps, chroma edges, a charge replay on the CTA).

Every family is gated by reduced motion and economy rendering, and keyframes animate only opacity, individual transforms, clip-path and two registered properties. Time-based keyframes stay at or under two opacity reversals a second, which is below the WCAG 2.3.1 flash threshold. Ornaments are aria-hidden and `pointer-events: none`. Rail geometry, slide controls, pinned control colours and the handoff targets are untouched.

Guards: `scripts/world-mirage.test.mjs` pins these rules, and `scripts/verify-world-mirage.mjs` checks the boot, the timeline sources, the rest state, the landscape hero and the handoff arrival in a browser.

## Rising the World — 2026-09-23

After END OF RECORD, the World page continues into a dark ember gate (`src/components/world/rising-world.tsx`, `src/styles-world-rising.css`). As the reader keeps scrolling, an ember horizon climbs and the RISING THE WORLD button rises into place on a named view timeline. The rise reverses when they scroll back, never loops, and is not gated on economy rendering: it is one opacity/translate/scale on a single control, and it is how the button is discovered. Keyboard focus shows the button at rest. It is centred in the gate, and the Zeus button steps off it.

Pressing it opens a modal sequence of 8.8 s:
- a round window onto the key visual bursts out of the button (a compositor-only scale, so it stays smooth while the page restyles for the dialog);
- a dive into the key visual: zoom blur, speed lines, an amber breakthrough;
- the world consumed by red flames climbing from below, with heat haze, char and embers;
- mid-burn, at 4.5 s, one hard cut to EP7 REXONANCE, while the Rexonance art emerges from the ash;
- a static end still with CLOSE and もう一度. SKIP jumps straight to it; Esc and the Android back gesture close.

One WebGL fragment shader (`rising.frag.glsl`, high precision where the GPU has it) draws the dive and the fire at about three quarters of CSS resolution within a pixel budget. It draws every frame on 60 and 90 Hz panels and every second frame on 120 and 144 Hz panels, and steps down a resolution-first quality ladder only when frames run late. The engine is loaded with `import()` when the gate nears the viewport. Its images are prepared as resized ImageBitmaps, and the GL context and shader compile start at pointerdown (for touch, once the contact is clearly a tap rather than a scroll). Until the engine has loaded, the dialog stays dark. The context exists only while the sequence plays and is released at the end, on close and on pagehide.

The tier is chosen by capability, never by device model. Capable devices, Galaxy, Pixel and iPhone included, get the full WebGL version. Save-Data, 2G, low-memory, two-core, software-GL and no-WebGL devices, or GL that is not ready in 700 ms, get a calm CSS version. Reduced motion gets a cross-fade to the still.

The sequence stays at one flash a second, general or red (WCAG 2.3.1, measured frame by frame at 60 fps):
- colour temperature only rises;
- the bloom is amber;
- nothing pulses;
- the shockwave is a gentle refraction;
- the title is one cut and only the title shakes.

The dialog is named RISING THE WORLD, the title is announced when it appears, and only the supplied words appear. Guards: `scripts/rising-world.test.mjs`, and `scripts/verify-rising-world.mjs` for the gate, the sequence, the tiers, performance and the flash audit in a browser.
