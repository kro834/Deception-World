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
- **Boot.** A finite boot from the first paint (frame lock, scan pass, beam sweep, title wipe, ghost pop, projector slit, charged CTA border, telemetry, redaction retract). It runs once per session. An inline head gate (`src/lib/mirage-boot-gate.js`) decides before that paint: lightweight renderers (the `prefersLightweightRendering` rules — iOS 18, Save-Data, 2G, 2 GB or less, 2 cores or fewer, and Android reporting 4 cores or fewer — checked against each other in the test), same-session reloads, hash landings and rider returns get `html[data-mirage-quiet]`, so no boot starts and nothing snaps at hydration. The boot holds while a load cover or the opening handoff is up. An arrival through the handoff plays only the HUD parts. The boot ends on a sentinel on `.mr-hero-hud`, which is never hidden, via `use-mirage-boot.ts`. That hook also closes a boot that finished before hydration.
- **Scroll.** Scroll-linked choreography on **named** view timelines. An `overflow:hidden` panel would capture an anonymous `view()`. The page's `body` did the same through `overflow-x: hidden`, which had silently frozen every view timeline on World, including the Motion edition's. The layer switches `body` to `overflow-x: clip` on `/world` only. Scroll locks (side menu, loading cover, open dialogs) keep their own `overflow: hidden`. A rail drag keeps `overflow: hidden` on `<html>`, but on `/world` its `<body>` is clipped instead (`styles-world-reveal.css`). While the side menu, a loading cover or a dialog is up, the Mirage choreography is switched off rather than left to rebind to the locked body. Open dialogs are read from `html[data-dialog-open]`, which `src/lib/dialog-open-flag.js` keeps in step with `dialog[open]` from the root layout: a `:has(dialog[open])` gate on `<html>` restyled the whole document on every DOM insertion. The flag goes up before `showModal()` or `show()` runs, so the gate change lands in the same style update as the dialog's focusing steps. Under a rail lock the choreography and the scroll-lit type simply hold still, because `<body>` is clipped and the timelines stay on the document; switching them off restarted every scroll animation at each tap. `scripts/scroll-paint-budget.test.mjs` pins both gates, and bars `background-color`, `color` (outside the typing ink) and new `clip-path` keyframes from scroll timelines.
- **Hover.** Fine-pointer holography (foil sweeps, chroma edges, a charge replay on the CTA).

Every family is gated by reduced motion and economy rendering, and keyframes animate only opacity, individual transforms, clip-path and two registered properties. Time-based keyframes stay at or under two opacity reversals a second, which is below the WCAG 2.3.1 flash threshold. Ornaments are aria-hidden and `pointer-events: none`. Rail geometry, slide controls, pinned control colours and the handoff targets are untouched.

Android (2026-09-23): a capable Android phone (Pixel, Galaxy, Samsung Internet) is not economy. It plays the boot, the Motion and Mirage scroll choreography and film motion as iOS does, with the hero and finale key art shown. The choice comes from capability hints, never from the model; Android reporting 4 cores or fewer, and every other lightweight hint, still gets economy, and only economy freezes the decoration loops. What stays specific to Android (`src/styles-android-performance.css`, `src/styles-world/18.css`): no backdrop-filter, with opaque surfaces; no grain, blurred orbs or pointer glows; compositor-driven reading progress, drawn as one line (the Motion prism, as on iOS; the hairline only where Motion is off); the root keeps the edge stretch but not pull-to-refresh (`overscroll-behavior-y: contain`); in-flow min-heights use `svh`, dialogs keep `dvh`. Liquid glass stays on the CSS lens (frosted controls). Android's "Remove animations" setting reports `prefers-reduced-motion: reduce`, so the site is then static by design.

Guards: `scripts/world-mirage.test.mjs` pins these rules, and `scripts/verify-world-mirage.mjs` checks the boot, the timeline sources, the rest state, the landscape hero and the handoff arrival in a browser.

### Scroll-lit type

As the reader scrolls, the story, riders, records and finale headings and the story and riders lead paragraphs are typed out one character at a time in reading order, like a terminal. An ice block cursor sits on the next cell, and each character appears at once at its own colour when it is typed; untyped characters are invisible but keep their place, so nothing reflows. The cursor only moves while the reader scrolls, and nothing blinks on a still page. Headings and copy are fully typed when their top reaches 74% of the viewport, so after a nav jump or a restored scroll only text still entering at the bottom is untyped. On short landscape screens (520px tall or less), where a nav jump lands a heading at 83-86% of the viewport, headings are lit by about 89%. The finale headline is typed the same way as it rises into view, so it is whole before its stage pins (`.finale-sticky` clips with `overflow: clip`, which is not a scroll container, so the headline's own view timeline stays on the document).
- **How.** `src/components/world/reveal-text.tsx` (with `reveal-label.ts`) splits the text into inline `span.tr-c` (Array.from, so server and client always match). The component is memoised, and the heading fragments are module constants in `world-home.tsx`. `src/styles-world-reveal.css` animates only `color` (and the cursor cell's `background-image`: a `background-color` animation repaints the page every scroll frame in Chromium 142+, including Samsung Internet 30) on one named view timeline per block (`--tr`). Each character fills its own slice of that timeline through `animation-duration: auto`: the production CSS minifier rewrites the shorthand with `0s`, which made every character a zero-length step, so the cursor never appeared in production builds. It loads before Mirage. This adds no layers and keeps line breaking.
- **Replaces.** Mirage's heading wipe and the copy rise on those blocks. The archive title, column summary and rider description stay whole text, because a rail changes them in place.
- **Always readable.** Text above the reveal line is lit after hash jumps and restored scrolls. Reduced motion, economy rendering, increased contrast, forced colours, reduced transparency, the side menu, loading covers and dialogs all show full ink. Headings keep their visible text for hit tests and get an `aria-label`. Copy is read once from a visually hidden sentence.
- **Rail locks.** On `/world`, `<body>` is clipped rather than hidden during a rail drag, so the view timelines stay on the document and the text holds still under the lock instead of flipping.
- **Cost.** About +0.5 to 1 ms of style work per frame at 4× CPU throttling on the JS progress path (the verify allows +1.5 ms). This relies on `--page-progress` being written only on the header hosts (`use-world-mode.ts`), never on `<html>`. A per-frame custom property on the root restyles every character.

Guards: `scripts/world-reveal.test.mjs` and `scripts/verify-world-reveal.mjs`.

### Rider grid on touch

The eight-rider grid (`.rider-tabs`) fills most of a phone's width in the middle of `/world`, so on touch it is a page-scroll surface first and a rail second. It is long-press-to-select:
- **Swipe.** A vertical swipe that starts on the grid scrolls the page natively (`touch-action: pan-y pinch-zoom`, `styles-frosted-controls.css`). The rail measures, locks and draws nothing until a hold engages, so a scroll that begins there costs the page nothing and never freezes it.
- **Tap.** A quick tap selects the tapped rider, without a page lock.
- **Hold, then drag.** After a 350 ms hold with less than 11px of movement, the held lens appears on the pressed rider and the rail takes the page lock. Dragging across the grid then selects as before, and a non-passive `touchmove` listener on the grid keeps the page still. A move before the hold engages is a swipe and never selects.
- **Unchanged.** Mouse and pen keep the immediate press-and-drag, and every other rail (manager archive, columns, the form-archive switcher, the special sites) keeps its touch handling: it owns a touch from contact.
- **Guards.** `src/lib/liquid/boot.js` (`holdToDrag`), `scripts/liquid-rail-grid.test.mjs`, `scripts/archive-switcher-gesture.test.mjs`, and, in the browser, `scripts/verify-liquid-grid.mjs` (a swipe from the grid scrolls at least 90% of the finger's distance; a tap selects; a held drag selects without scrolling), `verify-rail-work.mjs` and `verify-hero-touch.mjs`.

## Rising the World — 2026-09-23

After END OF RECORD, the World page continues into a dark ember gate (`src/components/world/rising-world.tsx`, `src/styles-world-rising.css`). As the reader keeps scrolling, an ember horizon climbs and the RISING THE WORLD button rises into place on a named view timeline. The rise reverses when they scroll back, never loops, and is not gated on economy rendering: it is one opacity/translate/scale on a single control, and it is how the button is discovered. Keyboard focus shows the button at rest. It is centred in the gate, and the Zeus button steps off it.

Pressing it opens a modal sequence of about 10 s: a 0.42 s portal, then a 9.6 s sequence clock that starts when the portal has covered the screen and the renderer is ready (7.7 s on the CSS tier):
- a round window onto the burning image bursts out of the button and opens like an iris over the still image (the circle is scaled and the image counter-scaled: compositor-only, so it stays smooth while the page restyles for the dialog);
- a dive into the image: zoom blur, speed lines, closing in on the rider's chest core, then an amber breakthrough that tears open from the core onto the whole print;
- the image burned away from below like a photographic print held over a fire (see The burn, below);
- mid-burn, 4.5 s into the sequence (about 4.9 s after the press), one hard cut to EP7 REXONANCE, while the Rexonance art emerges from the ash;
- a static end still with CLOSE and もう一度. SKIP jumps straight to it, also while the engine is still loading; Esc and the Android back gesture close. If the engine cannot load, the dialog shows the end still with the title and CLOSE only.

WebGL draws the dive and the burn in two full-screen passes (GLSL ES 1.00, high precision where the GPU has it): the flames and the smoke at half resolution into a texture (`rising-flames.frag.glsl`), then the main pass (`rising.frag.glsl`), which draws the print, the scorch, the char, the ash and the sparks and composites that texture. The dive is one pass. Both stay within a pixel budget: phones fit it at one pixel per CSS pixel (412 × 915 is 377k of 420k CSS px), so the print is as sharp as the portal it takes over from, and a 1440 × 900 window renders 1145 × 716, more pixels across than the 1024 px texture holds. Every run starts there. While the portal still covers the screen, the renderer times one burn frame on the GPU (a synchronous `readPixels`, less its round trip, each step in its own task). If the frame takes over 8 ms, the run starts on the first lower-resolution rung that fits, before the first frame shows, so a slow GPU never starts with a resolution pop mid-burn. A context lost while the probe yields goes to the calm tier, like one that is not ready in time. It draws every frame on 60 and 90 Hz panels and every second frame on 120 and 144 Hz panels, and steps down a resolution-first quality ladder only when frames run late; its last two rungs drop whole layers (the smoke's detail, the ash, the haze, the second spark layer and the embers, then the smoke, the sparks and the crack breaks), so they buy GPU time on weak devices. On an Apple GPU at 1800 × 4000 a burn frame costs about 0.65-0.75 ns per pixel for both passes (the dive about 0.3), less per pixel than the single-pass shader of 2026-09-23 (about 0.8-0.87 at its 8 blur taps). Runs used to start at three quarters of the budget's width and height, so a phone now draws about 1.8 times the pixels (412 × 915 instead of 309 × 686): about 0.26 ms of GPU a burn frame there instead of 0.17, which the probe guards on slower GPUs. SwiftShader runs every branch of every pixel, so it overstates the cost of the branch-skipping layers (sparks, ash, char) and is not a guide to Mali or Adreno; the probe measures the real GPU. The engine is loaded with `import()` when the gate nears the viewport. Its images are prepared as resized ImageBitmaps, and the GL context and shader compile start at pointerdown (for touch, 60 ms into the contact or at pointerup: a flick the browser takes over before then (pointercancel) creates none; a finger that rests on the button before scrolling can still prime one, which is released after 1 s unless the click adopts it). Until the engine has loaded, the dialog stays dark. The context exists only while the sequence plays and is released at the end, on close and on pagehide. The prepared bitmaps are closed when the gate unmounts and prepared again on the next approach.

The tier is chosen by capability, never by device model. Capable devices, Galaxy, Pixel and iPhone included, get the full WebGL version. Save-Data, 2G, low-memory, two-core, software-GL and no-WebGL devices, or GL that is not ready in 700 ms, get a calm CSS version. Reduced motion gets a cross-fade to the still.

The sequence stays at one flash a second, general or red (WCAG 2.3.1, measured frame by frame at 60 fps; the flash audit fails above one):
- colour temperature only rises;
- the bloom is amber;
- nothing pulses as a whole: the fire flickers only locally and gently (each tongue, each ember speck, the firelight along the front, each on its own slow beat);
- the shockwave is a gentle refraction;
- the title is one cut and only the title shakes;
- SKIP and もう一度 swap the picture between the void and the end still, so a held Enter or Space clicks once and a press within 600 ms of a swap is ignored (the audit holds Enter and clicks every 100 ms on a real clock).

The dialog is named RISING THE WORLD, the title is announced when it appears, and only the supplied words appear. Guards: `scripts/rising-world.test.mjs`, and `scripts/verify-rising-world.mjs` for the gate, the sequence, the tiers, performance and the flash audit in a browser.

### The burn — 2026-09-24

The image that burns is the supplied armoured rider on the night highway (`public/rising-burn-rider-20260924.webp`, kept byte for byte). Its 683 × 1024 cut is loaded only where it is sharp enough: by the device pixels a cover fit needs (a small, low-density window), or under Save-Data and 2G; phones, tablets and touch laptops get the full file. The shader caps its texture at 1024 px either way. `rising-art.ts` picks the file once at the press, so the portal, the calm tier and the shader share one download, and all three frame it like `object-fit: cover` at `object-position: 50% 10%`: phones see the whole figure, landscape screens keep the crest and chest.

The shader burns it the way a print burns:
- ahead of the front the emulsion yellows, browns and blisters (raised bubbles catch the firelight; ahead of the front they are the same cells that become the char's plates behind it), then blackens at the lip;
- the front is torn into tongues and islands and frays into fibres, with a thin incandescent lip that glows unevenly along its length (bright runs and stretches that have dulled, so it never reads as an outline), and an ember bed behind it;
- behind it the char shrinks into plates, in patches of large and of small ones, keeping a ghost of the print in the carbon under a faint sheen. Most fissures stay shut as dark hairlines. A minority gape: their edges curl up grey-white, and they glow orange at the front and cool to dull red over a couple of seconds (cooling is counted in seconds since the front passed, not in distance), each patch breathing on its own slow beat. The char greys to ash where it has burned longest. The net fades out as the Rexonance art emerges, and on the ladder's coarse rungs, where it would stair-step;
- curled sheets of charred paper lift off the front, turning as they rise: a fibrous, blotched face no lighter than about 0.15 grey, a shadowed back and a thin, broken burning rim; small flakes tumble higher up;
- the flames rise straight up from the front. Their height is measured down to the nearest crossing of the front below (the coarse burn field at three depths, interpolated), never across the field, so nothing hangs under an overhang, hugs the side of a hole or rings an island. They reach about 0.1-0.3 screen heights (a fifth lower on portrait screens), and nothing burns past 1.3 times a tongue's height, so no stray puffs appear above the fire. Print below a burnt hole burns downwards with short flames, and a thin island of print smoulders along its lips instead of filling its outline with a blaze. The body is domain-warped turbulence advected upwards, stretched upright and more so as the gas rises and speeds up; the small eddies warp the large ones, so the tongues lick, fork and pinch off, each swelling and sinking on its own beat. Opacity comes from optical depth (1 - e^(-6 × density)), so thin edges and tips are dim and see-through and only the thick roots saturate. Colour is a blackbody ramp: yellow-white only in the roots, orange in the body; a dying flamelet stays orange, and only its thin rim runs dull red. Some stretches of the front burn low, with no sheet of flame at the lip, so the scorch and the blisters show there;
- smoke is a lit medium, not a darkener: a few defined plumes rise off the tallest stretches of the fire, faster than the front climbs, widening as they go and merging only near the top. They are denser towards each core, cool blue-grey away from the fire and warm only on the undersides the flames light, self-shadowed on top. The veil stays about 0.3 outside the cores (at most 0.62 in them), so the wet road's reflections survive. Heat haze is a narrow, mostly vertical shimmer over and just above the flames;
- sparks crowd over the flames and go out one by one as they climb: yellow-white points with short trails bent by a wind that changes with height, cooling to orange; a few larger embers drift up slower and cool to dull red;
- the fire lights what is left of the print with a warm light that follows the flames just below it, each tongue on its own beat, never all at once;
- as the fire dies down, the art in the ash settles into the end still's grade, so the canvas cross-fades into a picture of the same colour.

Turbulence comes from a 256 × 256 tileable noise tile (`rising-noise.frag.glsl`: two fbm fields, cells and fine fbm) baked on the GPU once per run and mipmapped, so the burn costs texture fetches instead of per-pixel value noise; a ladder recompile keeps the tile. Every scrolling noise offset wraps with `fract`, so FP16 texture coordinates on Mali and Adreno never lose it, and no `smoothstep` runs with reversed edges (the `fall()` helper included). Where a GPU has no high precision in fragment shaders, the passes run at FP16 without NaNs: no `exp()` of an argument that can overflow (mix() evaluates both sides, and inf × 0 is NaN), and no division by a squared width that is subnormal at FP16. The flame pass's target is RGBA / UNSIGNED_BYTE (the one colour attachment WebGL 1 guarantees), stores opacity and premultiplied temperature (so it filters right when upscaled), and samples only the noise, never itself.

The dive's zoom blur takes 12 taps, jittered per pixel and per frame by white noise and stratified per tap, so it grains finely instead of ghosting or weaving; the burn is off while it runs, so the taps cost the burn nothing. The breakthrough bloom first leans the picture towards amber (the rider's pinks and blues would otherwise bloom pastel), then multiplies what is lit, so the blacks stay black.

The calm CSS tier burns the same image with raster sprites that only move by transform and opacity, rendered offline from the same fire model by `scripts/render-rising-calm-sprites.mjs` (`public/rising-calm-*-20260924*.webp`, about 180 KB: prepared on approach when the device will get this tier, loaded lazily when a WebGL run falls back to it, and never fetched by a WebGL or reduced-motion run): a burn-edge strip on a fixed fractal profile (`rising-calm.ts`, low-passed so it tears into tongues and bays instead of zig-zagging) whose incandescent lip varies in width and brightness along it, fresh char behind it with cracks that glow and cool, and a tiled char texture below; under the flames, a scorch strip on the same profile, where the print yellows, browns and blisters ahead of the lip; three flame frames seated along the lip at irregular sizes and gaps, behind the strip so the char cuts their roots, two frames per seat taking turns while rising a little (fake advection, each seat on its own beat); lit grey-brown smoke billows that swell, drift and thin; and embers whose streaks lean along their wandering paths. Halfway up, the front re-forms, so it is never recognised as one stamped silhouette climbing the print: a second strip and scorch fade in over the first, drawn wherever either of two differently shaped profiles has burned further. It only ever burns forward, and each flame seat slides up onto the new lip. Landscape screens deepen the edge's tears. Reduced motion keeps only the cross-fade to the still: the burn layer and the embers are hidden, so none of the sprites loads.

### RE DIVE…? — 2026-09-24

At the end still, RE DIVE…? appears above もう一度, in its own spot, so SKIP and もう一度 keep theirs, and the same 600 ms guard applies. It takes the reader into the World after it burned: a section right after the gate (`src/components/world/re-dive-section.tsx`, `src/styles-world-re-dive.css`). The section is rendered only once it has been reached in the session, or when a link opens `#re-dive`, and never by the server.

- **The transition** (`re-dive-sequence.ts`, `re-dive.frag.glsl`, `re-dive-timing.ts`; 2.55 s). Frame 0 is the end still itself. The camera plunges into the Rexonance art's core (zoom blur, ember speed lines, a darkening tunnel) and passes one amber swell. It lands on the section's ground, framed exactly as the page shows it: the burning lip just under the header, char below, ember light. Only then is the page moved to the section, under that still frame. The dialog fades out over it in 0.6 s while the six signals rise from the ground once. Esc on the way lands on the section at once.
- **Tiers**, by capability as everywhere:
  - WebGL: one full-screen pass on the opening's ShaderPass kit, loaded with `import()` when the end still settles. The context is released on landing.
  - CSS (Save-Data, 2G, low memory, two cores, no WebGL, or GL not ready in 450 ms): the end still's own art zooms into the core under speed lines and a glow, with transform and opacity only.
  - Reduced motion: the ground fades in over 0.7 s.
- **The ground.** The calm tier's burn-edge strip runs across the section's top, stretched to the width as in the calm tier (it does not tile seamlessly). The calm tier's char tile starts 0.8 of the strip's height down. The shader reads its textures y-down with `texture2D()`, as uploaded; `sampleTop()` takes y-up coordinates.
- **The 六詠 box** is the Deception World archive's box, with the same markup and words.
  - I is シエル (月城悠真). His card uses an upper-body crop of his illustration in the managers' card slot (`CIEL_THUMBNAIL`); the illustration is kept as supplied in `public/ciel-illustration-20260924.webp`. The card opens his own page (below).
  - II レックス・ロワ, IV レジャス and V オパス are the archive's cards.
  - III and VI are 欠番: burned-out slots that are not links.
- **Returning.** A card opened from the section gives the World's history entry the `#re-dive` hash. Browser back is then not reset to the top and lands on the section. Any other return keeps the position the router restores.

Photosensitivity follows RISING THE WORLD: one amber swell, and nothing pulses. The flash audit (60 fps, frame-exact, Pixel, Galaxy and desktop, every tier) measures at most one flash a second on WebGL (the swell) and none on the CSS and reduced tiers. Guards:
- `scripts/re-dive.test.mjs`;
- the `redive` section of `scripts/verify-rising-world.mjs`: the landing, focus, the six signals, the end still left as it was, and the flash audit.

### シエル's page — 2026-09-24

`/characters/ciel` (`src/components/world/ciel-page.tsx`, `src/routes/characters/ciel.tsx`, `src/styles-ciel.css`) is his own dossier. For now its record is the one the eight riders keep for 月城悠真: it reads the Saga entry of `RIDER_DOSSIERS`, so the profile, quotes, facts, chapters, Kamen Rider forms and special site stay in step with it. The nightmare pickup (マキャベル) is left out. It is headed by CIEL / シエル and his illustration (`CIEL_PORTRAIT`: 640 and 960 px, from the file as supplied).
- **Colours.** Emerald green (`#1ccf9d`, the accent) and light blue (`#86d9ff`, the soft accent). The sheet tints the ground and carries both into the name (a gradient from emerald into light blue), the labels, the quotes, the facts and the portrait's frame. It adds no motion, and every rule is scoped to the page.
- **Navigation.** The top bar and the index link return to RE DIVE's 六詠 (`#re-dive`). The pagination follows that box (`RE_DIVE_RIKUEI_NAV`): I シエル, II レックス・ロワ, IV レジャス, V オパス; III and VI are 欠番 and have no page.
- **Guard:** `scripts/ciel-page.test.mjs`.

## Opening: the burn and the dive — 2026-09-24

The title (`/`) now tells one story in 7.2 s: the ice logo arrives, is consumed by red flames climbing from its lower left, and the prism logo emerges from the ash, ember-hot, cooling to its own colours; it stays for ENTER THE WORLD and もう一度. SKIP (Esc, Enter, Space, S) lands on the prism logo in one change. Reduced motion shows the prism logo directly.

- **Logos without a box.** Both supplied logos (glow on black, kept as supplied in `public/logo-title-{ice,prism}-20260924.webp`) are alpha-keyed by `scripts/build-opening-logos.mjs` (headless Chrome): alpha from the brightest channel, colour divided by it, so the artwork sits on the scene as light, with no matte, halo or clipped trail (trails that leave the supplied frame taper out). Delivery files are 640/960/1280/1536 wide, shared as one srcset by the route preload, every `<img>` layer, the handoff and the WebGL textures (`src/lib/opening-logo.ts`). The shine is masked by the prism logo's own alpha.
- **Burn tiers** (by capability, never device model; `src/components/cinematic/opening-burn.ts`). WebGL: one shader on a premultiplied canvas that extends above the logo (`opening-burn.frag.glsl`: heat haze, scorch, a ragged front, flame tongues that rise off the glyphs, ash with cooling veins, sparks, faint smoke), plus one soft warm light on the scene. The engine, both logos as ImageBitmaps, the context and the parallel compile are prepared in idle time seconds before the burn; the canvas swaps with the DOM ice logo in one frame and back to the DOM prism logo in one frame, and the context is released right after. CSS (Save-Data, 2G, low memory, two cores, no or software WebGL, GL not compiled by the burn start): the ice logo is wiped off from below and the prism logo on under a flame band, transform and opacity only.
- **ENTER THE WORLD** (`opening-dive.ts`, `opening-dive.frag.glsl`, in the provider-owned handoff layer). The GL context and the compile start at pointerdown (touch: 60 ms into the contact or at pointerup). Frame 0 is the title's own framing; the camera plunges into the dark dial inside the logo's ring (zoom blur, speed lines, a darkening tunnel), one amber swell, and breaks through into the world key visual, which settles in Mirage ice at the World page's framing. Only then is the route changed, under that still frame, so the route's work never drops a frame of the dive; the arrival fades it into the page. Constrained devices, or GL not ready within 450 ms, get the same storyboard on DOM layers (transform and opacity only); reduced motion keeps the short cross-fade. The route contract is unchanged: `beginOpeningHandoff`, `go({ transitionCovered: true })`, the cancellation, timeout, visibility and pageshow restores, and two painted frames before route work.

Photosensitivity follows RISING THE WORLD: colour temperature only rises, the bloom is amber, nothing pulses, and the flash audit (60 fps, frame-exact, 412×915 and 1440×900, every tier) fails above one flash a second. Guards: `scripts/opening-burn-dive.test.mjs`, `scripts/image-delivery.test.mjs`, and `scripts/verify-opening-cinematic.mjs` (logos in the scene, burn and dive tiers, context release, 4× CPU performance, the flash audit).
