# Home Screen launch — 2026-11-01

The installed app reused the normal session-only opening completion flag. A fresh
Home Screen session therefore replayed the 7.2-second opening before enabling
ENTER. Browser emulation separated that intentional wait from HTML/first paint;
it does not measure iOS launching the Web App process.

Completed or skipped installed openings now persist a versioned completion flag.
Only an ordinary root navigation in standalone mode resumes the settled title.
First visits, explicit opening URLs, reloads and replay requests retain the full
sequence. Ordinary tabs retain session-only behaviour. Storage failures fall back
to the original opening; no server state or new setting is involved.

The initial title starts on the next animation frame instead of after a fixed
120ms timer. Its relative burn timing and 7.2-second playback are unchanged.
The root's 23 local blocking stylesheets are consolidated into six, with every
rule and its cascade order retained. Tailwind and filename-sensitive liquid-glass
transforms remain independent. Both same-path Home layouts keep their styles.

The opening's font declarations are a build-owned snapshot of the existing Google
Fonts core and HUD stylesheets. Families, weights, ranges and swap behaviour are
retained; font files still come from fonts.gstatic.com. Other routes keep their
existing stylesheet links. Browser-specific binary URLs can differ from the live
Google API, so this is not a claim that every browser requests identical URLs.
The source checksum and face definitions are guarded by opening-font-delivery.
Opening no longer starts META UNITAS's unrelated idle image/engine warmup; link
intent and actual entry still prepare it.

Chrome/WebKit emulation checked initial playback, an installed fresh session with
persisted completion, reload, replay, ordinary tabs, World/menu/Home and the form
lab. The settled installed title enabled entry in roughly 79–170ms in first-round
local samples; later first-frame samples were FCP→playing 30.5ms (Chrome) and
80ms (WebKit). These are individual local samples, not device or network promises.
Opening requests to the Google CSS API were zero. The four font families had equal
text widths in all 64 sampled cases; 63 historical canvas hashes matched. A direct
same-UA Google/local CSS comparison of the remaining Oxanium sample had zero
changed pixels. Original historical hash variability remains unexplained.

The older October 15 JavaScript-size budget is exceeded by both the baseline
(d2e27792: 896,454 decoded critical bytes) and this candidate (897,842). This
change removes waits and blocking requests; it does not claim to shrink that
JavaScript graph. The old budget was not relaxed.

Raw evidence is kept outside the tracked source under handoff/pwa-launch-20261101.
Physical iPhone/iPad Home Screen launch, OS splash time and process restoration
remain unverified. No service worker, stale-document cache or image-quality
reduction was introduced.
