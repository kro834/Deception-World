# Exhibition metal surface assets

`scripts/build-exhibition-metal.py` uses Blender Cycles to bake surface maps for the independent exhibition room's dark brushed-metal artwork mounts. It never reads the artwork images. The maps belong on the mount's rails and bevels, with the image rectangle left unobstructed. Glass transmission, edge highlights, and reflections remain runtime lighting effects, so they can respond to the mount's location and viewing direction. This material pipeline has no site-wide graphics mode, preference store or decorative overlay.

Run from the repository root with an actual Blender 4.5 LTS or newer executable:

```sh
/path/to/blender --background --factory-startup --python scripts/build-exhibition-metal.py -- --resolution 1024
```

The output directories must be absent or empty, preventing accidental replacement of a reviewed bake. To reproduce a result separately, pass `--output /private/tmp/exhibition-metal-review/maps --provenance /private/tmp/exhibition-metal-review/source`. Resolution is limited to power-of-two values from 128 to 1024; use 512 or 1024 for the full machining frequencies. The procedural input and Cycles seed are fixed. Byte-identical output across different Blender releases or CPU implementations is not promised; the manifest records the runtime and file hashes.

The runtime assets are `public/exhibition-metal/brushed-alloy-normal.png` and `brushed-alloy-roughness.png`, both linear, repeatable PNG maps. The normal map uses tangent-space OpenGL +Y. A Three.js consumer should use `NoColorSpace` for both maps and `RepeatWrapping`, pass the normal map to `normalMap`, and pass the roughness map to `roughnessMap` with material roughness set to `1` so that the map is not multiplied by a second roughness factor. Metallic is `1`; base color is linear RGB `(0.018, 0.026, 0.037)`. Start normal scale near `0.5` for narrow screen-space rails, and derive the repeat count from the rail's physical dimensions. The brushing follows the U axis; vertical rails should rotate their UV basis consistently with their tangent frame.

Integer UV harmonics describe shallow parallel machining grooves and smaller crossing grain. Because every frequency is an integer and bake margin is zero, the analytic surface repeats across UV boundaries; the boundary pixels are samples on either side of the join, and need not be numerically identical. A Bump node feeds Cycles' tangent normal bake. Roughness is baked from an emission shader to avoid baking lighting into a data map. Both bake targets are explicitly Non-Color images.

`design/exhibition-metal/exhibition-metal.blend` retains the procedural material and packed baked maps in a compressed Blender file. The studio preview in that directory renders a small beveled material sample under three area lights for visual QA; this sample is not website geometry. `manifest.json` appears in both output directories and records Blender version, material settings and asset hashes. These provenance files are tracked with the reproduction source; only the runtime PNGs and their compact manifest are served by the website.

The existing two PNG maps, packed scene and studio preview were relocated without changing any bytes. The manifest's `generator` and `generatorSha256` identify the current material-only reproduction script, while `generatorRole` and `preservedBake.generatorSha256` explicitly retain the original bake's identity. The relocation was not a new Blender render. The packed scene remains the historical source evidence, including its original QA objects; it is never loaded by the website. Its unchanged hash can be checked independently of the new script's hash.

The independent room uses actual extruded frame geometry from `exhibition-studio-geometry.ts`, not a screen-space frame image. The material-only builder no longer creates such an image or stores a `frame` record. `scripts/exhibition-metal-assets.test.mjs` checks the PNG headers and fixed pre-relocation hashes, packed scene and preview hashes, the current script identity, matching manifests and the renderer's new URLs.

Generation is verified only after Blender exits successfully, the PNGs and `.blend` exist, the preview has been inspected, and the material has been checked on the actual artwork mounts. A Python syntax check alone does not establish that Blender generated the assets or that browser rendering is correct.
