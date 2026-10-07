# Architectural top screens

The opening, Deception World home and Dream Chapter home use original architectural environments rendered in Blender 5.2.0 LTS with Cycles. The World atrium combines charcoal stone, brass and directional daylight; Dream uses timber, translucent shoji and paper lanterns. Geometry, material variation, indirect light and reflections are rendered together at 2560 × 1600 with 192 samples and AgX. No third-party models or textures are used.

## Artwork and runtime contract

Only the architecture is pre-rendered. Existing source illustrations, logos, captions and controls remain separate DOM elements. The featured illustrations retain their full aspect ratio with `object-fit: contain`, without color filters or image edits. CSS supplies the responsive mat, frame and contact shadow around each illustration. The top screens are not realtime path tracers or navigable 3D rooms; the separately implemented exhibition room remains the realtime 3D experience.

The two responsive WebP sizes load without WebGL and do not require Ultra Mode. Cached images are checked after hydration as well as through load events. A failed image leaves the existing content and a solid fallback visible; later successful loads clear the failure state. No animation loop is added. Reduced-motion users receive the same architecture without its entrance fade, and forced colors hide the decorative background. All styling is scoped to the marked hero sections, not the iPad chrome, root viewport or scroll restoration.

Existing opening timing, sound controls, skip and entry remain intact. World retains poster shuffle, lock and reset. Dream retains its existing navigation. Narrow layouts stack the original image with its copy; the final Dream information band wraps instead of clipping.

## Reproduction and provenance

The generator is `scripts/build-architectural-heroes.py`. Production `.blend` scenes and PNG masters are in `design/architectural-heroes-v1/production/`. The public manifest records generator, scene, master and WebP SHA-256 hashes. Exploratory output directories are not production inputs.

Run from the repository with an installed official Blender executable and new, nonexistent output directories. Keep the source output inside this repository so its relative provenance path can be recorded:

```sh
blender --background --python scripts/build-architectural-heroes.py -- --output design/architectural-heroes-v1/review-new --runtime-output /tmp/architectural-runtime-new --width 2560 --height 1600 --samples 192
```

Review the new renders before replacing production assets and updating the manifest. The generator refuses nonempty output directories. Tests verify source and master hashes, manifest agreement, decoded WebP dimensions and runtime recovery behavior. Release attestation includes all four served images and their manifest; a successful local build alone is not proof of public deployment or physical iPad Home Screen behavior.
