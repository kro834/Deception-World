# Dream Chapter — midpoint story expansion

## Scope and provenance

The user-supplied LINE export received on 2026-09-21 is the source for the new summaries. SHA-256: `7c0afc5f440281053635add8affbf78d750cfd9444c265f034f90b85fc4849d5`; 57,207 lines. The raw conversation, participant handles, timestamps and attachment markers are not included in the site or repository. References below are one-based physical line ranges in that original file.

The existing six display labels (Case 0 交わる through Case 5 叛く), decorative English readings, three character dossiers and eight posters are preserved. The export starts before the first chapter rename; it does not independently establish the existing Case 0 label. English UI readings are existing display translations, not quotes of chat-room titles. This update adds synopsis prose, not new canonical chapter names.

## Source map and editorial limits

| Display record | Grounding in the supplied export | Summary boundary |
| --- | --- | --- |
| Case 0 / 交わる | 10–60; 1210–1384; 1457–1588; 1725–2044; 3515–3880; 6508–6572 | Nightmares in 碧栄, the need for connections, 慶弥's dream, 怪作 and the white door. |
| Case 1 / 開く | 6573–6822; 16290–16364 | 怪作's inner world; a different 幻想郷; マキャベル and the unopened final door. The source renames this chapter twice, ending at line 6625 with Safeguard the Nightmare. |
| Case 2 / 開ける | 16365; 16884–16970; 18278–18349; 18829–19035; 21017 onward; 23995–24110 | The newspaper, 霊夢's conditional involvement, reconstruction of 人里 and 慶弥's visit to 守矢神社. |
| Case 3 / 明ける | 34763–42080, especially 34854 and 35640–35645 | Parallel defense of 幻想郷; ディルクルム and 拒絶, without presenting the crisis as resolved. |
| Case 4 / 来たる | 42081–42160; the 旧地獄 battle through 54654 | ヴァルトマン's warning and the taking of 怪作 by ロードナイト's side. |
| Case 5 / 叛く | 54655–57207, especially 56800–56840 and the final ベルベットルーム scenes | Treatment, regrouping and preparation. 怪作 remains taken; シエル, 慶弥 and 夕夏 reach ベルベットルーム. No rescue outcome or ending is supplied. |

The introduction deliberately does not equate 怪作's inner-world 幻想郷 with every later setting. Case 1 says the three escaped pursuit, not that they escaped outside the dream. 霊夢 acts to protect 幻想郷's balance rather than unconditionally joining the protagonists. Enemy declarations, theories about the world, revivals and final victory are not generalized into new omniscient facts.

The three crossovers are grounded in 博麗神社's explanation/lodging/battle scenes, 慶弥's 守矢神社 visit and the closing dinner/rest scenes, and 永遠亭's treatment and regrouping scenes. Existing window/bamboo artwork is not claimed to depict any one of these locations.

## Implementation and review

- Six native `details` readers start closed; the spoiler and midpoint notice is visible first. Multiple chapters can stay open. Case 5 is explicitly 記録途中.
- The text-only reader has no new image requests, modal, scroll lock, backdrop blur or height animation. Native vertical panning and pinch zoom remain available from chapter headings.
- iPad gets two columns. On iPhone, chapters precede the location notes and use the full reading width. Paragraph spacing and wrapping expand naturally.
- The reader's actual height replaces the old offscreen size estimate so native anchor navigation does not depend on a stale six-card layout.
- World navigation and the six manager dossier cards receive explicit, consistent accessible names, retaining their existing visual labels and interactions.
- Image-generation simulation and its implementation corrections are documented in `dream-story-image-prompt-20260921.md`. It is a design study, not a web asset or runtime verification.

## Release verification

Validated before the main push:

- `npm test`: 389/389 passed. `npm run typecheck`, `npm run lint`, and `npm run build` passed. Lint retains 11 pre-existing warnings and no errors. No production database migration was run (`DATABASE_URL` unset).
- `sync-source-parts --check`: all 15 groups match their authoritative source. `git diff --check` passes.
- `verify-dream-story.mjs`: Chrome and WebKit both pass at 375×812, 390×844, 1024×768 and 1194×834. Covers six records, keyboard Enter/Space, independent open states, pointer opening, title/body scrolling, native chapter-anchor visibility, no horizontal overflow, 200% text and no runtime page errors. Chrome uses native CDP touch gestures; WebKit uses native wheel input because Playwright does not expose a equivalent touch-drag API there.
- `verify-anime-ui.mjs`: 35/35 existing interactions pass (iPhone, Android Chrome and landscape-iPad viewports), including pickup gestures, episode swipes, modal close, and the Dream poster gallery.
- `verify-cinematic-edition.mjs`: all 12 route/viewport combinations pass layout and text-zoom checks.
- Final screenshots were inspected for both the phone and landscape-tablet reading layouts. The lightweight story reader avoids the old offscreen-height estimate; chapter headings land below the fixed navigation.

Browser checks use local Chromium/Chrome and WebKit, not physical-device thermal or OS tests. Publication is the user-authorized GitHub main update; Grok's public-site rollout is separate.
