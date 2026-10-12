# Rain-city material bakes

These are actual Blender Cycles bakes for the opening's ruined city. No source artwork is edited and no third-party photographic texture is used. The Python generator authors two procedural surfaces: weathered concrete with fine pits and directional water staining, and granular asphalt with smoother, darker wet patches.

## Runtime contract

| Files under `/rain-city-materials/` | Resolution  | Interpretation        | Suggested repeat |
| ----------------------------------- | ----------- | --------------------- | ---------------- |
| `concrete-albedo.webp`              | 1024 × 1024 | sRGB color            | 3 m              |
| `concrete-normal.png`               | 512 × 512   | Non-Color, tangent +Y | 3 m              |
| `concrete-roughness.png`            | 512 × 512   | Non-Color scalar      | 3 m              |
| `asphalt-albedo.webp`               | 1024 × 1024 | sRGB color            | 4 m              |
| `asphalt-normal.png`                | 512 × 512   | Non-Color, tangent +Y | 4 m              |
| `asphalt-roughness.png`             | 512 × 512   | Non-Color scalar      | 4 m              |

The six served files total **1,927,950 bytes**. Every master was baked at 1024 × 1024; the data maps are Lanczos-downsampled to 512 for the short moving shot's delivery budget. The original all-1024 runtime variant was 6,405,503 bytes. Albedo uses WebP quality 90; data PNGs use lossless compression. All runtime and full-resolution bake hashes are in `design/rain-city-materials/manifest.json`.

Use repeating wrap modes and mipmaps. Mark only albedo as sRGB. Normal maps use OpenGL tangent-space +X/+Y/+Z and should not have their green channel flipped. The renderer must normalize the sampled tangent normal, including after filtering. Recommended starting normal strength is 0.6 for concrete and 0.45 for asphalt; tune with the existing night lights. A world-coordinate material should divide its projected UVs by 3 m or 4 m rather than repeat once over every differently scaled building block. Avoid metallic concrete/asphalt: the perceived wetness comes from roughness, not metalness.

## Reproduction

Run from this repository with its installed `sharp` dependency and Node available:

```sh
/path/to/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python scripts/build-rain-city-materials.py -- \
  --output /an/empty/path/runtime --provenance /another/empty/path/provenance
```

Outputs must be absent or empty; the generator refuses to overwrite existing results. Add `--keep-bakes` to retain all six full-resolution masters. Otherwise the script removes only its six freshly generated masters after rendering the preview, and keeps their hashes in the compact manifest. It does not touch source materials or other outputs.

The verified execution used **Blender 4.5.14 LTS**, build `62c1db4208e8`, Cycles CPU, seed `73017`, 16 samples, no denoising or adaptive sampling. Procedural fields embed the UV plane as a torus in 4D noise, so both axes are analytically periodic. Albedo and roughness use Cycles EMIT bakes; tangent normals use a Cycles NORMAL bake. Node/sharp only encodes and downsamples the baked pixels.

Blender was not installed into `/Applications`. A portable copy was obtained from the [official Blender 4.5 release index](https://download.blender.org/release/Blender4.5/) and run from task temporary storage. Its `blender-4.5.14-macos-arm64.dmg` SHA256 matched the official `blender-4.5.14.sha256`:

```text
65134d9b07b20e2fa8d3c9e44f6f44ffb5c9774dd521b95f50387310241ca170
```

## Verification and limits

Two independent 1024px Cycles runs produced identical SHA256 hashes for all six masters. The studio preview is an actual Cycles render using the baked master maps, with warm/cool area lighting: concrete on the left and wet asphalt on the right. It was visually inspected alongside the albedo and normal maps. It is a material preview, not a claim about the final Three.js scene or physical Safari.

For every served image, dimensions, runtime SHA256 and repeat-boundary differences were checked. Boundary-versus-interior adjacent-pixel mean-difference ratios range from 0.52 to 1.28; no boundary has an anomalous jump relative to its own surface detail. The diffuse concrete, rough aggregate and smooth wet patches remain distinct. See `design/rain-city-materials/verification.json` for measured values.

Browser decoding, Three.js texture ownership, draw performance, first-flight readiness, context loss and the actual rain-city framing belong to the renderer's integration checks; asset baking alone does not establish those results.
