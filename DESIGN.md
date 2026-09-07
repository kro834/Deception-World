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
