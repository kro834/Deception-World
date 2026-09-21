# World film programme redesign — 2026-09-21

## Scope and direction

The Dream Chapter's six existing synopses were rewritten with anime episode-preview pacing: an immediate situation, the characters' choices, and a transition into the next chapter. Chapter names, chronology, relationships, and the unfinished Case 5 remain intact. No ending, victory, release date, or new alliance was invented. See `dream-story-source-review-20260921.md` for the original source evidence.

Deception World's visual hierarchy was redesigned around a monumental film masthead, a near-black/ivory/scarlet palette, the supplied key visual, a clearly distinguished entrance action, and programme-like chapter spreads. On phones, the introduction and entrance precede the artwork; tablets retain a separate text column and key visual. Native vertical document scrolling, all existing imagery, all 33 World posters, eight rider tabs, and the Liquid control interaction code remain unchanged.

Two contrasting image studies and one refinement were generated with the built-in **imagegen** skill/tool, then compared with real Chromium and WebKit screenshots. The images are design simulations, not runtime screenshots or replacement production art. In particular, generated extra taglines, changed poster artwork, arrow controls, and shortened navigation were not copied into the implementation. Production copy, artwork, controls, and accessibility semantics are authoritative.

The route loads `styles-world-programme.css` and `styles-world-programme-sections.css` after the shared cinematic skin. Other routes do not load these two files. No new runtime dependency, font download, raster asset, event handler, continuous animation, blur layer, or scroll interception was added. The only important background override is the World entrance action, to supersede the shared frosted-glass rule while retaining opaque paint and white text.

## Image study artifacts

The built-in generator returned these preview-only local artifacts. Production code does not reference this directory.

- A — dark cinematic editorial: `/Users/hosicommon/.codex/generated_images/01a0463f-e2a3-7632-b7db-5956de2edc64/exec-a85e9cc8-c578-44c5-9994-29519c58c9a1.png`
- B — ivory film programme: `/Users/hosicommon/.codex/generated_images/01a0463f-e2a3-7632-b7db-5956de2edc64/exec-abdf4b04-0e44-4ca2-b5f8-cad687468de8.png`
- Refined direction — dark masthead / ivory chapter spread: `/Users/hosicommon/.codex/generated_images/01a0463f-e2a3-7632-b7db-5956de2edc64/exec-6b3ad320-a020-4948-8e69-06c8c9929d5f.png`

All source references were visually inspected first. Study A and B used the current landscape browser screenshot `/tmp/cinematic-chromium/world-1194.png` and the repository's `public/deception-world-poster-delivery.webp`. The refinement used Study A and that same original key visual. Existing supplied art and the title logo were not regenerated or overwritten in production.

### Prompt A

```text
Use case: ui-mockup. Asset type: responsive website design simulation, not production artwork. Primary request: dramatically redesign the existing Japanese anime film website DECEPTION WORLD shown in reference 1. Reference 2 is the existing key visual; preserve its characters and composition. Produce a meticulous flat design board with a landscape iPad website viewport on the left and a tall iPhone website viewport on the right, showing the same responsive design. Direction A: cinematic editorial, near-black ink, warm ivory oversized condensed geometric title typography, restrained scarlet-red vertical index accents, crisp cyan micro-rules. The title reads DECEPTION WORLD; Japanese tagline exactly 世界は、欺瞞でできている。 Elegant monumental two-line English masthead in a solid uncluttered text column, separate large portrait key visual on tablet, control strip below image. Clear CTA ENTER THE WORLD with high contrast red background and white text. Top navigation STORY RIDERS RECORDS and menu, compact but touch sized. Phone has compact title then headline/CTA then tall artwork, no side-by-side tiny columns. Below hero show a glimpse of an ivory story chapter with red numbered section line. Mature anime film direction, rich negative space, not corporate SaaS, not crowded HUD dashboard. No invented plot, dates, slogans, people, trailers, or purchase buttons. Avoid tiny unreadable text, blue gradient rounded cards, glass blur, boxed title, cropping character faces. Interface only, no tablet hardware or perspective.
```

### Prompt B

```text
Use case: ui-mockup. Create a distinct alternative responsive art direction for DECEPTION WORLD Japanese anime film website. Reference 1 shows current content, reference 2 is actual existing film key visual to preserve unchanged inside its frame. Flat design board: landscape iPad and narrow iPhone side by side. Direction B: avant-garde film programme, warm ivory page canvas, oversized black typographic DECEPTION WORLD masthead across top, a narrow scarlet rule and numbered chapter signposts, sharp black artwork frame, elegant asymmetric blocks, very minimal cyan, no blue dashboard cards. Desktop title and Japanese copy occupy left column, original portrait key visual occupies right; phone vertically stacked. Include exact Japanese tagline 世界は、欺瞞でできている。 and short copy 救うべきものは、夢の向こうにはない。 Top nav STORY RIDERS RECORDS plus hamburger. Prominent black-and-scarlet ENTER THE WORLD button. Under visual preserve three distinct controls SHUFFLE POSTER, RESET, AUTO; all large finger touch targets. Clear spacing, readable typography; text never overlaps characters. Existing content and media only: do not invent slogans, release dates, awards, tickets, videos, or story statements. Show beginning of darker character archive below hero for dramatic tonal pacing. No devices, no perspective, no gradients, no glow, no illegible microtype.
```

### Refinement prompt

```text
Use case: ui-mockup. Refine reference 1 into an implementable final responsive anime film site design simulation. Keep black/ivory/scarlet editorial direction and dramatic oversized typography. Correct only these layout/content issues: preserve the original portrait key visual from reference 2 UNCHANGED as a separate rectangular poster image, no cutout redraw. No invented vertical slogan and no invented story sentence anywhere. Make DECEPTION WORLD a huge two-word masthead ABOVE the two-column tablet copy/poster composition. Tablet copy exactly 世界は、欺瞞でできている。 then 救うべきものは、夢の向こうにはない。 then scarlet ENTER THE WORLD button. Under the poster include three plainly legible actual controls SHUFFLE POSTER / RESET / AUTO and a 01 / 33 counter. Phone layout: compact nav with STORY RIDERS RECORDS plus menu, two-line English masthead, Japanese tagline, CTA, then portrait poster and controls (naturally scrolling; don't cram whole page into one viewport). Beginning of next ivory story section uses 01 WORLD / STORY and exact heading 救うべき世界は、現実にある。 Preserve high contrast readable text and clear touch targets, no translucent text overlays or tiny labels, no extra claims. Flat iPad and phone side-by-side board, no device hardware. This is a design study, not replacement artwork.
```

## Verification

The initial comparison caught the shared frosted background overriding the red entrance action, and a legacy spanning rule moving the third metadata field onto a second row. Both were corrected in the route-scoped visual layer. Small accent text uses a lighter red than borders, for 7.95:1 or better contrast on the selected dark panels. Story text/heading has more than 11:1 contrast on ivory.

Final checks against a fresh production preview at `http://127.0.0.1:8082`:

- `npm run release:build`: lint, 393/393 tests, TypeScript, and production build passed. Lint has 11 pre-existing warnings and no errors. The database migration script skipped because DATABASE_URL was intentionally unset; no external database was changed.
- `node scripts/sync-source-parts.mjs --check`: all 15 source groups matched. Only the existing WorldHome markup and its corresponding source parts changed structurally.
- `node scripts/verify-world-programme.mjs`, Chromium and WebKit: 390×844, 375×667, 1024×768, 1194×834; header/title/CTA non-overlap, metadata layout, touch-sized controls, story contrast, visible manager tab labels, six Dream chapters' Enter/Space operation and wheel scrolling. Phone text at 200% was checked too.
- `node scripts/verify-hero-touch.mjs`: native Chromium touch input on 390×844, 1024×768 and 1280×960; 44 named scroll surfaces plus gutters, slider contact lock/release, all eight riders' stable geometry, 20×16px long-hold growth, 80ms lens transitions, and 100ms portrait changes passed.
- `node scripts/verify-scroll-surfaces.mjs`: 67/67 surface checks passed across World, dossiers, and feature pages.
- `node scripts/verify-dream-story.mjs`: full six-chapter reader, native touch/keyboard, anchor position and enlarged-text checks passed.
- `npm run verify:ui`: 35/35 interaction checks passed on the final preview, covering menu focus, episode snapping, pickup drags/taps/cancel, route-reveal scrolling, dialogs and Dream poster responsiveness.

Final screenshots: `/tmp/world-programme-audit/chromium/` and `/tmp/world-programme-audit/webkit/`; production build output remains regenerable. The screenshot harness waits for fonts and image decode, materializes content-visibility sections, then repositions using measured geometry; this avoids mistaking an estimated-layout frame for a final UI. Browser viewport emulation is not a claim of physical iPhone/iPad device testing.
