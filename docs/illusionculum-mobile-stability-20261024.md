# Illusionculum mobile loading repair

The reported environment is iPhone Safari. The browser's process-level reload
was not reproduced on a physical iPhone; the checks below cover the identified
resource and preparation paths in mobile WebKit and Chrome.

## Route-specific findings and changes

Rexonance and Far From use dedicated entrance engines and prepare their drawing
plans before entrance. Illusionculum instead mounted the entire scroll assembly
engine in its entrance and drove it with a six-viewport scroll container and
global synthetic scroll events. Its `fire: false` scene also prepared unused
flame resources.

The entrance now supplies its progress directly to the engine and sends a local
frame notification. It has one viewport, with no nested scrolling or global
scroll notification. The phone entrance generates gold with each armour plate,
avoiding the additional gold/conduit surfaces and two optional field contexts.
The page's scroll transformation retains its original gold and field rendering.
Unused flame preparation is skipped only for configurations that disable fire.

On phones, the page engine waits for the entrance cover to finish so both scenes
do not prepare simultaneously. It starts immediately afterwards, preserves its
resources across offscreen scrolling, and releases them on hidden/pagehide and
unmount. Its original warmup remains active, with preparation before the
first scroll. Reduced-motion and saving tiers keep their existing static paths.
Phone preparation uses the existing bounded yielding queue rather than separate
idle windows, while the desktop scroll scene keeps its previous scheduling.

Navigation intent and direct phone entry warm the engine module and six
compressed resources in the HTTP cache. Streams are drained without image decode,
bitmap creation or retained bodies. This warmup runs concurrently with normal
navigation, has an eight-second abort deadline and can retry failures.

## Verification

- Nine injected lifecycle cases: immediate early preparation, cover ownership,
  hidden/pagehide recovery, retained offscreen resources, pending import races,
  error recovery, reduced motion and unchanged desktop idle startup.
- Four preloader cases: exact resources and cache policy, duplicate attempts,
  stalled requests/code and abort, retryable errors and motion/data gates.
- Existing Illusionculum record/artwork/registration checks.
- Mobile WebKit and Chrome: eight document loads each, an immediate chapter jump,
  subsequent preparation at the top without scrolling, chapter return and replay.
  No unexpected document reload, pageerror or browser crash; prepared state is
  retained on chapter return. On loopback development builds, top-of-page
  preparation completed in about 2.2–2.4 seconds in WebKit and 0.7 seconds in
  Chrome; subsequent chapter click/check took 42–96 ms. These are local desktop
  browser measurements, not iPhone timing guarantees.
- Final phone queue adjustment, production build: another eight WebKit loads
  pass with preparation at the top in 1.0–1.1 seconds and prepared chapter
  clicks in 52–79 ms. A cold Chrome run with 4x CPU throttling, 120 ms latency
  and 1.6 Mbit/s download still completes preparation at the top and retains it
  for the chapter jump, with no document reload or pageerror. Its roughly
  eleven-second preparation wait shows that slow-network acquisition is not
  eliminated by queue scheduling.
- WebKit entrance sampling: 47 samples, 43 ready frames, phases from preparation
  through assembly/seal/ignition/completion, scrollHeight equals clientHeight.
  Early and assembled frames visually reviewed. The measured tracked canvas pixel
  backing peak was 31.8 MiB; this excludes other process/GPU/CSS memory.

Local diagnostic scripts and images are in the ignored `output/playwright/`
directory. Source tests are committed under `scripts/illusionculum-*.test.mjs`.

## Follow-up: bounded direct bitmap decode

After the owner reported occasional remaining loading pressure, the scope was
explicitly limited to Illusionculum. Its compact entrance and scroll scene now
decode compressed responses directly into ImageBitmaps, with at most two active
requests/decodes. They no longer keep a separate Image preload/decode alongside
each bitmap. Original source resolution, nanite assembly, gold and the page's
field remain unchanged. Other sites use the original decoder.

The scene-owned loader deduplicates pending URLs, bounds queued/stalled work to
eight seconds, supports Image fallback, aborts on scene disposal, and closes
bitmaps that finish after cancellation. Six behavioral tests cover concurrency,
retry, timeout, fallback and disposal. Five production-preview mobile WebKit
loads all reached ready in about 1.1 seconds, without document reloads or page
errors; instrumentation confirmed seven direct Blob decodes, a peak concurrency
of two, and no Image.decode calls on that preparation path. These local timings
are not physical-iPhone or slow-network guarantees.
