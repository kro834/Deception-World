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
unmount. Its original warmup remains active, with idle preparation before the
first scroll. Reduced-motion and saving tiers keep their existing static paths.

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
- WebKit entrance sampling: 47 samples, 43 ready frames, phases from preparation
  through assembly/seal/ignition/completion, scrollHeight equals clientHeight.
  Early and assembled frames visually reviewed. The measured tracked canvas pixel
  backing peak was 31.8 MiB; this excludes other process/GPU/CSS memory.

Local diagnostic scripts and images are in the ignored `output/playwright/`
directory. Source tests are committed under `scripts/illusionculum-*.test.mjs`.
