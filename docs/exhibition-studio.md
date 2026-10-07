# Physical exhibition studio

`scripts/build-exhibition-studio.py` creates a real, meter-scaled gallery scene in Blender Cycles. Its subject is the display environment around the existing artwork: fine warm lime plaster, honed stone, 7 cm skirting, a wall-mounted blackened aluminium frame, a cotton-rag mat and separate 2 mm museum-glass geometry. The frame consists of four mitered prisms, with 25 mm front rails, 46 mm depth and 1.2 mm edge radii. Wall spacers leave a real air gap, so Cycles generates the contact and cast shadows rather than painting a dark halo.

The original `public/gallery/g19-1672.webp` is loaded as a full-UV print texture, without cropping, retouching, preprocessing or overwriting the source file. Blender uses ordinary linear texture sampling and packs the source image into the `.blend`; the packed bytes are checked against the original SHA-256. The source hash is also compared before and after generation and recorded in the manifest. Illumination and glass naturally affect a photographed/rendered study; this is not a new master artwork file, and the website's original image must remain the source of truth for an unobstructed enlarged view.

The large daylight source has window-sized physical dimensions and a real mullion. Two small warm gallery lights sit inside track fixtures. These sources create coherent surface highlights and shadows; there are no floating crystals, decorative screen-space light blobs, synthetic lens flares, or emission applied to the artwork. Deep focus keeps the print, frame profile and wall contact readable from the front and from an oblique camera.

Run with an actual Blender executable, from the repository root:

```sh
/Volumes/Blender/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build-exhibition-studio.py -- --output design/exhibition-studio-v3 --samples 64 --width 1200 --height 900
```

The output directory must be absent or empty. To revise the lighting or material design, choose a new version directory and retain reviewed results. The script does not overwrite old render batches. `--artwork` can point to a different existing source for a separate QA study; width/height are derived from its decoded aspect ratio.

Expected outputs are `exhibition-front.png`, `exhibition-oblique.png`, the packed `exhibition-studio.blend`, and `manifest.json`. The manifest records source hashes, physical dimensions, camera positions, Blender version, render settings, generator hash and output hashes. A successful Python syntax check is not sufficient: Blender must finish both renders successfully, and both views must be inspected at the intended display scale before claiming visual quality. The room study is a prototype for website integration, not proof that these materials or lighting are already running in the browser.

The draft uses 1,200 × 900 pixels, 64 samples, denoising, a fixed seed and AgX color management. Use more samples and output pixels for final rendering only after evaluating composition, light direction, the readability of the source image and the realism of the mount from both cameras. Increasing sample count cannot compensate for incorrect scale or incoherent lighting.

The first `exhibition-studio-v1` review showed coherent contact shadows but overly strong rectangular window reflections. A second review tried reducing the specular IOR level, which did not adequately reduce the transmitted glass's reflection. The current third revision uses Principled's physical thin-film layer: IOR 1.208, approximately the square root of the 1.46 glass substrate, and a 114 nm quarter-wave coating around 550 nm. This is a single-layer anti-reflection approximation, not a manufacturer-specific spectral model. The film acts on the transmission component as described by the [Blender Principled BSDF documentation](https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html). It does not remove reflection rays, lower the light's specular contribution, or repaint the original image.

Generate this revision into `design/exhibition-studio-v3` and retain the earlier batches for comparison. The front camera includes the wall/floor junction so the object can be judged as part of a room rather than a border floating on a neutral field.

## Runtime lighting and wall material

The gallery's selected top artwork now mounts the lazy Three.js renderer when Ultra Mode is enabled. Its original accessible image and enlargement link are retained as the fallback. The dedicated `/exhibition?work=g19` room opens the same display at a larger scale and permits choosing any of the 113 bundled originals. Entering that explicit 3D room does not change the user's saved Ultra Mode setting. Both views honour the existing accessibility preferences. Camera controls provide front, oblique and whole-room views, plus a native original-image view; no source image is edited or cropped.

The browser scene uses metre-scaled extruded mitred rails, a real cut mat aperture, a separate glass solid, wall spacers, plaster walls and ceiling, jointed stone flooring and light fixtures. HDR illumination is supplied by the actual Cycles probe below; PMREM and ordinary physically based WebGL rendering are used at runtime, not browser path tracing. The print bypasses scene tone mapping so the room's colour treatment does not re-grade the original. The normal and roughness maps affect only the surrounding physical materials. Rendering is on demand and is paused offscreen or behind route/modal/menu covers, then GPU resources are disposed on artwork/quality/route changes.

To preserve detail through the screen-space glass transmission pass, the renderer supersamples at 2x for high quality or 3x for cinema, including on 1x screens, bounded to 8 or 16 million framebuffer pixels respectively.

`scripts/exhibition-studio.test.mjs` checks actual Three geometry/ray intersections, camera projection, decoded-source UVs, cleanup/abort/context recovery, and the wrapper's SSR/fallback lifecycle. It also checks the current generator and produced file hashes. These tests do not certify a photographic appearance; screenshots must be reviewed independently on the intended display.

The optional runtime batch creates an actual Cycles panorama from the room at `(0, -0.35, 1.53)` meters. Before capturing the 2,048 × 1,024 equirectangular Radiance HDR, the frame, print, mat, glass, backing, spacers and caption are hidden from rendering. Consequently the illumination probe contains the room, window and lights, never the original artwork. The saved manifest enumerates the excluded objects and checks that decoded linear radiance exceeds 1. The source `.blend` retains the original full scene with the review camera restored.

```sh
/Volumes/Blender/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/build-exhibition-studio.py -- --output design/exhibition-studio-runtime-v1 --runtime-output public/exhibition-studio --runtime-only
```

Use `studio-light.hdr` with Three's `HDRLoader` and a PMREM generator. It is scene-linear illumination, not an sRGB picture or a page-wide background texture. The HDR probe uses 32 samples. Two additional 512 px PNGs are Cycles bakes of a 25 cm square of the same plaster shader: `plaster-normal.png` is tangent-space OpenGL +Y, while `plaster-roughness.png` stores the actual 0.86 roughness as linear data. Both should use `NoColorSpace`; begin with a restrained normal scale because the physical plaster relief is only 0.23 mm. The procedural noise sample is not guaranteed mathematically periodic, so evaluate any repeated seams at the intended display scale rather than assuming seamlessness. The runtime and source manifests contain the generated file hashes.
