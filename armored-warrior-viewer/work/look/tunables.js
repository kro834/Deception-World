// Every knob of the look lives here. The picture is the painted base-colour texture, shown unlit;
// each numbered block below is one layer on top of it, and setting its strength to 0 removes it.
// Colours are display-referred sRGB hex strings; directions are in view space (x right, y up,
// z towards the viewer).
//
// Quick tries without editing this file:
//   ?set=path:value,path:value   e.g. ?set=shadow.band:0.7,sheen.gold:0,armor.lit:%23222633
//   ?plain=1                     every layer off: the unlit painting on the backdrop
//   ?plain=1&keep=grade,shadow   … except the named layers (see LAYERS at the end of this file)
//   ?debug=N                     one buffer of the material (9 = the shadow mask, 10 = its three parts)
export const LOOK = {
  // Optional helpers. Each may be missing; set to null not to load it at all.
  mapsManifest: '../model-v15/manifest.json', // per material and mode: paint (+ paintForce), toonNormal, style; on request paintRepaired, conf
  matcapDir: './matcaps/', // gold.webp, armor.webp: rendered in Blender, used for the sheen only
  lightRig: './lightrig.json', // key light direction designed in Blender (replaces shadow.key)
  // The helper maps (smoothed normal, AO) exist at 1024² and 2048². 0 = the 1024² set in both modes;
  // 1 = detail mode on desktop loads the 2048² set: ten textures, roughly 170 MB more GPU memory.
  detailHelpers: 0,

  stage: {
    edge: '#0b0d14', // must equal --stage-edge in viewer.css
    center: '#232a40', // must equal --stage-center in viewer.css
    // The page paints radial-gradient(ellipse 62% 56% at 50% 46%, center, edge); the canvas repeats it.
    poolRadius: [0.62, 0.56],
    poolCenter: [0.5, 0.54], // uv, y up (= 46% from the top)
    floor: '#39436a', // soft pool of light on the ground under the figure
    floorStrength: 0.34,
    contactShadow: 0.5,
  },

  // 1. The painting, graded towards the character sheets: levels on luminance (hues are kept) and one
  //    saturation factor. The projected painting is flatter than the sheet it came from. Medians of
  //    each colour class, unlit front view against refs/front.png: armour black #202127 for the sheet's
  //    #121218, gold value 0.54 for 0.62, blue saturation 0.58 for 0.76, pink value 0.81 for 0.96.
  grade: {
    blackPoint: 0.1, // this painted luminance becomes black (0 = as painted)
    whitePoint: 0.84, // this painted luminance becomes white, with a soft shoulder above (1 = as painted)
    gamma: 1.0, // mid tones after the stretch: below 1 lifts them, above 1 lowers them (1 = none)
    saturation: 1.6, // 1 = as painted
  },

  // 2. Which painting. Manifest `paint` maps flagged "paintForce" are corrected paintings and always
  //    replace the embedded base colour (0 = ignore the flag). Unflagged ones are sharper copies and
  //    replace it only where the embedded texture is sparse on the surface: fewer than this many texels
  //    per world unit (the figure is about one unit tall; the body has 770, the other parts 2070–3340).
  paintLarge: 0, // 1 = the larger (2560²) paint in standard mode and on phones too
  paintUnflattened: 0, // look-dev: 1 = the painting before it was flattened (manifest key paintBeforeCel), where there is one
  paintFixes: 1,
  sharpPaintBelow: 1500,
  // Unsharp mask in texture space. It acts on real edges only: where the local contrast is below
  // edge[0] (grain, soft gradients) it does nothing, above edge[1] it is at full strength.
  sharpen: {
    amount: 0.45, // 0 = off (near 1 the edges get halos)
    radius: 1.2, // in mip levels of the texture (1.2 is about 2.3 texels)
    edge: [0.05, 0.14],
    crystal: 0.0, // share of it that glowing crystal gets (its fine streaks only harden)
  },
  // Share of the manifest's `paintRepaired` map mixed into the painting (0 = not loaded at all).
  // Tried at 0.5 and 1: it trades the painted streaks on the sides for flat patches with dark holes.
  repair: 0,

  // 3. Shadow: one cel shadow from one light, with hard edges. The light is fixed to the camera, at
  //    the upper left in front (the same side as the light painted into the texture).
  shadow: {
    amount: 1.0, // 0 = the whole layer off (the armour planes below included)
    key: [-0.46, 0.6, 0.66],
    smoothNormal: 1.0, // 0 = the mesh's own lumpy normals, 1 = the baked smoothed normal
    // Band: the side of every form that turns away from the light.
    figure: 1.0, // the figure as a whole: per world unit to the right of its axis the light term drops this much, so one boundary runs down the figure (0 = each part by itself)
    figureFlat: 0.5, // 0 = each part turns away from the light by its own normal, 1 = only the position across the figure counts
    swirlSplit: 1, // the boundary runs straight through the chest orb's swirl (0 = the swirl follows its own bulge and stays lit)
    swirl: [0, 0.689, 0.07], // the swirl in world units: centre x, centre height, radius
    swirlLine: 0.008, // where the line crosses it, to the right of the figure's axis (world units)
    band: 0.78, // where it starts, on the half-lambert scale: 0.74 puts about a third of a limb in shadow; higher = wider
    creasePull: 0.08, // baked AO pulls the band into creases (more than ~0.15 draws a crescent in every crease and the shapes get busy)
    creaseCut: 0, // baked AO below this is in shadow by itself: only the deepest creases (0 = off)
    // Cast: what one part of the figure hides from the light (helmet on neck, pauldrons on arms, belt on tabard …).
    cast: 1.0, // 0 = off (the depth map is then not drawn at all)
    mapSize: 2048, // pixels of the light's depth map across the figure (about 1 mm of the figure per pixel) …
    mapSizeMobile: 1024, // … and on touch devices
    castOffset: 0.004, // the test point is moved this far off the surface (world units; the figure is about 1 tall) …
    castBias: 0.005, // … and this far towards the light: together they keep bumps from shadowing themselves
    // The mask is then tidied in screen space: where the surroundings clearly agree they overrule it.
    clean: 1, // 0 = the raw mask
    cleanRadius: 0.014, // world units (the figure is about 1 tall): islands smaller than about this vanish
    cleanLo: 0.33, // less than this share of shadow around = lit …
    cleanHi: 0.67, // … more than this = in shadow; in between the raw mask stands
    castGrid: 1, // cast shadows are read on a grid this many map texels wide (more = small shapes merge)
    castCut: 0.5, // share of the taps that must be hidden (lower = shadows grow and swallow small lit islands)
    castReach: 0.1, // an occluder further than this (world units) casts nothing: keeps far parts such as the tail from sinking whole areas
    movingTriangles: 1.2e6, // on touch devices, models with more triangles get cast shadows only on the settled frame
    // How each paint answers the shadow. Armour swaps planes (see `armor`); these are multiplied in:
    goldLit: 1.3, // gold on the lit side is this much brighter (1 = as painted)
    gold: '#d0a890', // gold in shadow: bronze brown, about L* 30 (darker merges with the black armour and the shape is lost)
    crystal: '#7456cc', // crystal in shadow: dark violet, still saturated
    other: '#5e5e90', // steel and everything else
    crystalCast: 0.8, // crystal takes the band, and this share of the cast shadows
    crystalSpare: [0.55, 0.85], // emissive level from which glowing cores are spared, and where they are fully spared
  },

  // Near-black armour cannot show a shadow, so it is drawn as two planes with a hard border:
  // lifted to navy-grey on the lit side, sunk to blue-black in shadow.
  armor: {
    lit: '#1e2230', // L* about 13: near-black ground; depth comes from the shadow being darker, not from this being grey
    shadow: '#06070c', // L* about 2
    // What survives of the painted light on these planes is local contrast only:
    lines: 0.7, // paint darker than the paint just around it (drawn lines, thin gaps) stays this much darker than the plane (0 = lines vanish)
    torsoPlane: 0, // the torso's lit armour is one flat plane (0 = like the rest of the armour)
    torsoColor: '#1f2434', // about L* 14: torso only; elsewhere lit armour stays at 12 or below
    torso: [0.59, 0.78, 0.11], // where the torso is, in world units: from height, to height, half width (the figure is about 1 tall)
    sideBlue: 0, // sideways-facing, non-glowing saturated blue is treated as armour (0 = off)
    step: 1, // second, lighter step on lit armour where the form faces the light most (0 = off)
    stepCut: 0.94,
    stepColor: '#2a3046',
    plane: 0.75, // lit armour: 0 = the painting as it is (black, painted gloss), 1 = one flat plane of `lit`
    lineCut: [0.3, 0.7], // how much darker than its surroundings (relative) paint must be to count as a drawn line: faint variation is not a line
    gloss: 0.25, // paint lighter than the paint just around it (small highlights) gets this much lighter (0 = none)
  },

  // 4. Metal that lives: small, sharp glints from the Blender matcaps, added on the lit side where the
  //    paint is gold or dark enamel. They move with the camera; the painted bands stay put.
  // Thin rim just inside the outline on the light side.
  rim: { amount: 0, widthPx: 2.0, color: '#5a6282' },

  sheen: {
    gold: 0.12, // 0 = off
    goldColor: '#ffe0aa',
    goldCut: 0.76, // matcap brightness above which gold glints (its rim and hot spot)
    armor: 0.7, // 0 = off
    armorColor: '#8fa0de',
    armorCut: 0.6, // matcap brightness above which enamel glints (only its small hot spot)
  },

  // 5. Crystals: the authored emissive maps, at a modest level (the original site used 2.2 to 3.45).
  emissive: {
    strength: 0.05, // how much the painting brightens, in its own hue, where the emissive map is at full (0 = the painting alone)
    glow: 0.4, // fed to the bloom (0 = no glow)
    whiteCore: 0.25, // painted star centres and orb cores go to white where the crystal glows
  },
  bloom: { strength: 0.2, radius: 1.0 },
  sparkle: {
    strength: 0.55, // cross-stars drawn by the final pass (0 = off)
    hot: 0.35, // seeds on painted star centres and orb cores …
    hotCut: 0.8, // … where all three channels of the paint are above this (nearly white)
    probability: 0.012, // extra seeds sprinkled on glowing crystal (share of surface cells; 0 = none)
    density: 44.0, // those cells per world unit
    sizePx: 1.9,
    length: 16.0, // ray length in CSS pixels
    falloff: 0.8,
    color: '#f3ecff',
    divisor: 4, // the crosses are drawn at 1/divisor of the frame each way and magnified (2 = finer rays, eight times the work)
  },

  // 6. Line. The outline (figure against stage) is clearly heavier than the inner ink, which marks real
  //    depth breaks inside the figure. The painting carries its own finer lines.
  ink: {
    color: '#05050d',
    tint: 0.2, // share of the underlying colour that stays in the ink
    outline: 1.0, // 0 = no outline
    outlineCss: 2.2, // its width in CSS pixels (half inside the figure, half outside)
    inner: 0.75, // 0 = no inner ink
    innerCss: 1.1, // its width in CSS pixels
    depthThreshold: 0.011, // relative depth break that draws inner ink
  },

  // 7. Finish: an edge-preserving flattening pass on the settled frame. The manifest's `paintcel` maps
  //    are already flattened along the surface, so with them the pass has one job left: the thin
  //    scratch-like streaks inside glowing crystal (most visible on the rear drapes). Its other targets
  //    (smeared sideways paint, flat noisy paint) are kept as knobs for paint that is not flattened.
  paint: {
    // What counts as smeared: surfaces that face neither character sheet (geometry) …
    sideways: 1.0, // 0 = ignore
    // … and / or the manifest's baked `conf` map (five more 1024² textures; it marks nearly the same places).
    confidenceMap: 0, // 1 = load and use it
    confidence: [0.3, 0.7], // conf below the first value = smeared, above the second = reliable
    smearBlur: 0.0, // soften smeared paint in the texture by this many mip levels (0 = off; no gain left on the flattened paint)
    // The flattening pass (a Kuwahara filter on the settled frame): calm, even colour areas with crisp
    // borders. Where it acts, and how strongly:
    amount: 0, // 0 = off (pass skipped), 1 = fully flattened where it applies
    smeared: 0.0, // on smeared paint (no gain left on the flattened paint)
    crystal: 0.8, // inside glowing crystal (fine streak texture), never on painted star centres and orb cores
    flat: 0.0, // on flat or merely noisy paint (no gain left on the flattened paint) …
    protect: [0.035, 0.11], // … which is where the local edge strength is below the first value; above the second it is crisp painted detail and stays as it is
    radiusCss: 3.0, // filter radius in CSS pixels: streaks narrower than this are flattened
    maxRadiusPx: 5.0, // … but never more than this many pixels of its target (cost grows with its square)
    sharpness: 8.0,
    hardness: 8.0,
    anisotropy: 0.0, // 0 = round kernel (flattens); towards 1 the kernel follows the local structure and draws brush strokes
    scale: 1.0, // size of the flattened picture relative to the frame, on desktop
    mobile: 1, // 1 = touch devices run the pass too (0 = they skip it) …
    mobileScale: 0.5, // … at this size: a quarter of the pixels and a quarter of the taps per pixel
    settleMs: 170, // camera rest time before the pass runs
    fadeMs: 240, // cross-fade from the raw frame after an interaction
  },
  grain: 0.012, // paper grain (0 = off)

  // 8. Parts the painting does not cover: the four untextured waist pieces are given these paint
  //    colours (the painting's own median black and gold, before the grade: dark for the strap and
  //    mounts, gold for the edge trim) and then go through the same layers as everything else.
  untextured: { use: 1, dark: '#2b2d38', gold: '#8b674a' }, // use: 0 = keep the model's own flat colours

  // Pixel budget for the drawing buffer. Desktop supersamples a little for antialiasing.
  pixels: { desktop: 3.2e6, mobile: 2.1e6, desktopMinRatio: 1.5, maxRatio: 3 }, // mobile: about DPR 2.25 on a phone stage (was 2.1e6, the full DPR 3)
};

// ?plain=1 switches every layer off: the unlit painting on the backdrop, nothing else. Each entry is one
// layer and the values that switch it off; ?plain=1&keep=grade,shadow leaves the named layers on.
export const LAYERS = {
  grade: { 'grade.blackPoint': 0, 'grade.whitePoint': 1, 'grade.gamma': 1, 'grade.saturation': 1 },
  sharp: { sharpPaintBelow: 0, paintFixes: 0, 'sharpen.amount': 0, repair: 0 },
  shadow: { 'shadow.amount': 0 },
  sheen: { 'sheen.gold': 0, 'sheen.armor': 0 },
  glow: { 'emissive.strength': 0, 'emissive.glow': 0, 'emissive.whiteCore': 0, 'bloom.strength': 0, 'sparkle.strength': 0 },
  ink: { 'ink.outline': 0, 'ink.inner': 0 },
  finish: { 'paint.amount': 0, 'paint.smearBlur': 0, grain: 0 },
  parts: { 'untextured.use': 0 },
};
