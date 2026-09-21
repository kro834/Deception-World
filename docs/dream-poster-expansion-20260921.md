# Dream Chapter — seven additional shuffle images

The seven user attachments were appended as posters 09–15, retaining all eight existing images. The supplied full JPEGs are copied byte-for-byte; the upside-down composition of photo 1 is intentional and preserved. All seven use centered `object-fit: contain`, not cropping or generated replacements.

| Attachment | Poster | Dimensions | Full bytes | Thumbnail bytes |
| --- | --- | --- | --- | --- |
| 写真1 | 09 | 1024×1280 | 532788 | 52506 |
| 写真2 | 10 | 1280×720 | 410550 | 35793 |
| 写真4 | 11 | 1280×960 | 472700 | 39478 |
| 写真5 | 12 | 1254×1254 | 589793 | 49310 |
| 写真6 | 13 | 1280×853 | 320259 | 29664 |
| 写真7 | 14 | 1280×723 | 259328 | 23788 |
| 写真8 | 15 | 1280×720 | 193769 | 20190 |

Dedicated thumbnails are derived with macOS `sips -Z 320 -s format jpeg -s formatOptions 70` from each immutable full JPEG. Their aggregate size is 250,729 bytes versus 2,779,187 bytes for the full set. The existing lazy image loading and adjacent-only prefetch remain unchanged, and the header count now derives from `DREAM_POSTERS.length`.

Landscape iPad retains a two-column thumbnail strip beside the poster, with 80–92px rows and native vertical scrolling within the poster's height. Focused offscreen tabs scroll into view. No new page scroll lock or scroll-chain containment is introduced; the existing horizontal phone strip is preserved.

## Validation

- All seven destination full JPEGs compare equal to their respective attachments. Tests verify all 15 assets/thumbnails, the seven declared dimensions, fit mode and thumbnail aspect ratios.
- `npm test` 390/390; typecheck, lint and build pass. Lint has the same 11 existing warnings, no errors. All 15 source-parts groups remain synchronized.
- `verify-dream-poster-expansion.mjs` passes in Chrome and WebKit at 375×812, 390×844, 1024×768 and 1194×834: 09–15 selection and decoding, contain layout, caption bounds, 44px minimum targets, iPad thumbnail reachability, Home/End/wrap keys, shuffle, lock, reset and released page scrolling. Real hit targets are required; no forced clicks are used.
- `verify-cinematic-edition.mjs` passes all 12 route/viewport combinations, including the new 15-thumbnail geometry and focus checks.
- `verify-anime-ui.mjs` passes all 35 interaction regressions, including all 15 thumbnails at phone and landscape-tablet sizes.
- A native Chrome touch swipe starting on the 1024×768 thumbnail grid scrolled the rail by 217px. Phone and tablet screenshots of poster 09 were visually inspected; its original orientation and entire composition are retained.

These are local browser checks, not physical-device or Grok deployment checks. The requested publication route is a normal GitHub main push.
