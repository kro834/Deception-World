# Ultra artwork-mount material assets

`scripts/build-ultra-materials.py` uses Blender Cycles to bake surface maps for dark brushed-metal artwork mounts. It never reads the artwork images. The maps belong on the mount's rails and bevels, with the image rectangle left unobstructed. Glass transmission, edge highlights, and reflections remain runtime lighting effects, so they can respond to the mount's location and viewing direction.

Run from the repository root with an actual Blender 4.5 LTS or newer executable:

```sh
/path/to/blender --background --factory-startup --python scripts/build-ultra-materials.py -- --resolution 1024
```

The output directories must be absent or empty, preventing accidental replacement of a reviewed bake. To reproduce a result separately, pass `--output /private/tmp/ultra-assets-review/maps --provenance /private/tmp/ultra-assets-review/source`. Resolution is limited to power-of-two values from 128 to 1024; use 512 or 1024 for the full machining frequencies. The procedural input and Cycles seed are fixed. Byte-identical output across different Blender releases or CPU implementations is not promised; the manifest records the runtime and file hashes.

The runtime assets are `public/ultra-materials/brushed-alloy-normal.png` and `brushed-alloy-roughness.png`, both linear, repeatable PNG maps. The normal map uses tangent-space OpenGL +Y. A Three.js consumer should use `NoColorSpace` for both maps and `RepeatWrapping`, pass the normal map to `normalMap`, and pass the roughness map to `roughnessMap` with material roughness set to `1` so that the map is not multiplied by a second roughness factor. Metallic is `1`; base color is linear RGB `(0.018, 0.026, 0.037)`. Start normal scale near `0.5` for narrow screen-space rails, and derive the repeat count from the rail's physical dimensions. The brushing follows the U axis; vertical rails should rotate their UV basis consistently with their tangent frame.

Integer UV harmonics describe shallow parallel machining grooves and smaller crossing grain. Because every frequency is an integer and bake margin is zero, the analytic surface repeats across UV boundaries; the boundary pixels are samples on either side of the join, and need not be numerically identical. A Bump node feeds Cycles' tangent normal bake. Roughness is baked from an emission shader to avoid baking lighting into a data map. Both bake targets are explicitly Non-Color images.

`design/ultra-materials/ultra-brushed-alloy.blend` retains the procedural material and packed baked maps in a compressed Blender file. The studio preview in that directory renders a small beveled material sample under three area lights for visual QA; this sample is not website geometry. `manifest.json` appears in both output directories and records Blender version, material settings, shader-source hash, and asset hashes. These provenance files should be tracked with the generation source; only the runtime PNGs and their compact manifest need to be served by the website.

The script also models an actual display frame from four trapezoid metal prisms joined at 45-degree miters and renders `public/ultra-materials/frame-rim.png`. The 2m-square frame has a 1.786m-square opening, 107mm-wide rails, 36mm depth, and 3mm bevels. The existing Cycles area lights illuminate the material, while a frontal orthographic camera produces an RGBA image with an open transparent center. The `.blend` retains these four rails, their UV coordinates, modifiers, lights, and camera. Pass `--skip-frame-rim` to omit this optional asset.

For a 1024px render use `border-image-source: url('/ultra-materials/frame-rim.png'); border-image-slice: 64; border-image-repeat: stretch` on a border positioned around the artwork. Do not add `fill`: the center must stay unpainted. Each corner remains an independent square; horizontal and vertical rail regions stretch along their lengths so the modeled miters and bevel profile remain intact for portrait and landscape mounts. At other supported resolutions use `resolution / 16` for the slice value. The PNG is an sRGB rendered lighting fallback, unlike the linear normal and roughness maps. Runtime geometry can add moving reflection highlights over the same border region.

After rendering the frame, the script reloads the saved PNG and checks RGBA dimensions, the alpha of every pixel inside a slightly inset center region, and an opaque sample on each of the four rails. These observations are stored under `frame.alphaChecks` in the manifest. A failed alpha check stops generation before the manifest is written. The frame contains no artwork plane or user images.

Generation is verified only after Blender exits successfully, the PNGs and `.blend` exist, the preview has been inspected, and the material has been checked on the actual artwork mounts. A Python syntax check alone does not establish that Blender generated the assets or that browser rendering is correct.
