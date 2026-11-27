// Every knob of the look lives here. The picture is the painted base-colour texture, shown unlit;
// each numbered block below is one light-handed layer on top of it, and setting its strength to 0
// removes it. Colours are display-referred sRGB hex strings; directions are in view space (x right,
// y up, z towards the viewer).
//
// Quick tries without editing this file:
//   ?set=path:value,path:value   e.g. ?set=form.shade:0.3,sheen.gold:0,ink.color:%23101020
//   ?plain=1                     every layer off: the unlit painting on the backdrop
//   ?plain=1&keep=grade,form     … except the named layers (see LAYERS at the end of this file)
export const LOOK = {
  // Optional helpers. Each may be missing; set to null not to load it at all.
  mapsManifest: '../model-v15/manifest.json', // per material and mode: paint, toonNormal, style; on request paintRepaired, conf
  matcapDir: './matcaps/', // gold.webp, armor.webp: rendered in Blender, used for the sheen only
  lightRig: './lightrig.json', // key / rim directions designed in Blender (replace form.key / form.rimDirection)
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

  // 2. Sharper paint. The manifest's `paint` map (a sharper copy of the same painting) replaces a
  //    material's embedded base colour where that one is sparse on the surface: fewer than this many
  //    texels per world unit (the figure is about one unit tall). Measured: body 770, clasp 2070,
  //    buckle 3210, helmet 3340, and only the body gains visibly from the 2048 map. 0 = never.
  sharpPaintBelow: 1500,
  // Unsharp mask in texture space, to bring the soft projected painting closer to the inked sheet.
  sharpen: { amount: 0.6, radius: 1.2 }, // amount 0 = off (near 1 the edges get halos); radius in mip levels (1.2 is about 2.3 texels)
  // Share of the manifest's `paintRepaired` map mixed into the painting (0 = not loaded at all).
  // Tried at 0.5 and 1: it trades the painted streaks on the sides for flat patches with dark holes.
  repair: 0,

  // 3. Form, so the figure stays 3D while orbiting. The lights are fixed to the camera and come from
  //    the same side as the light painted into the texture (upper left, in front).
  form: {
    key: [-0.46, 0.6, 0.66],
    smoothNormal: 0.9, // 0 = the mesh's own lumpy normals, 1 = the baked smoothed normal
    shade: 0.5, // strength of the cel shade on the side away from the key light (0 = off)
    shadeColor: '#6a66b4', // multiplied into shaded paint: a blue-violet dark
    shadeThreshold: 0.64, // where the shade starts on the half-lambert scale (higher = more of the figure shaded)
    shadeSoftness: 0.025, // edge of the shade: 0.01 = cel-hard, 0.2 = soft gradient
    aoShade: 0.25, // baked AO pulls creases into the shade
    ao: 0.2, // mild ambient occlusion multiplied into the paint (0 = off)
    rim: 0.5, // rim light that separates the black armour from the dark stage (0 = off)
    rimDirection: [0.72, 0.3, -0.62],
    rimColor: '#6f8cf5',
    rimThreshold: 0.62,
    rimSoftness: 0.06,
    rimSpareBright: 0.75, // how much gold and crystal are spared from the rim (it is meant for the black)
  },

  // 4. Metal that lives: highlights of the Blender matcaps, added on top of the painting where the
  //    paint is gold or dark enamel. They move with the camera; the painted bands stay put.
  sheen: {
    gold: 0.12, // 0 = off
    goldColor: '#ffe0aa',
    goldCut: 0.76, // matcap brightness above which gold glints (its rim and hot spot)
    armor: 0.2, // 0 = off
    armorColor: '#8fa0de',
    armorCut: 0.6, // matcap brightness above which enamel glints (only its small hot spot)
  },

  // 5. Crystals: the authored emissive maps, at a modest level (the original site used 2.2 to 3.45).
  emissive: {
    strength: 0.05, // how much the painting brightens, in its own hue, where the emissive map is at full (0 = the painting alone)
    glow: 0.4, // fed to the bloom (0 = no glow)
    spareShade: 0.8, // glowing crystal is self-lit: this much of the shade and AO is kept off it
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
  },

  // 6. Line: the silhouette and real depth breaks only. The painting carries its own inner lines.
  ink: {
    depth: 1.0, // 0 = no outline
    color: '#05050d',
    widthCss: 1.3, // line width in CSS pixels
    depthThreshold: 0.011, // relative depth break that draws a line
    tint: 0.2, // share of the underlying colour that stays in the ink
  },

  // 7. Finish. Smeared paint (where the two sheets' projections stretch over the sides of the figure)
  //    is calmed in two ways: softened in the texture itself, which every device gets, and brushed by
  //    an edge-preserving pass on the settled frame. Crisp painted detail is left alone.
  paint: {
    // What counts as smeared: surfaces that face neither character sheet (geometry) …
    sideways: 1.0, // 0 = ignore
    // … and / or the manifest's baked `conf` map (five more 1024² textures; it marks nearly the same places).
    confidenceMap: 0, // 1 = load and use it
    confidence: [0.3, 0.7], // conf below the first value = smeared, above the second = reliable
    smearBlur: 1.2, // soften smeared paint in the texture by this many mip levels (0 = off)
    // The brush pass.
    amount: 0.85, // 0 = off (pass skipped), 1 = fully brushed where it applies
    smeared: 1.0, // its strength on smeared paint
    flat: 1.0, // its strength on flat or merely noisy paint (JPEG noise) …
    protect: [0.035, 0.11], // … which is where the local edge strength is below the first value; above the second it is crisp detail and stays as painted
    radiusCss: 2.4, // brush radius in CSS pixels
    maxRadiusPx: 5.0, // … but never more than this many device pixels (cost grows with its square)
    sharpness: 8.0,
    hardness: 8.0,
    anisotropy: 1.0,
    mobile: false, // run it on touch devices too (its GPU cost on phones is unmeasured)
    settleMs: 170, // camera rest time before the brush pass runs
    fadeMs: 240, // cross-fade from raw to brushed after an interaction
  },
  grain: 0.012, // paper grain (0 = off)

  // 8. Parts the painting does not cover: the four untextured waist pieces are given these paint
  //    colours (the painting's own median black and gold, before the grade: dark for the strap and
  //    mounts, gold for the edge trim) and then go through the same layers as everything else.
  untextured: { use: 1, dark: '#2b2d38', gold: '#8b674a' }, // use: 0 = keep the model's own flat colours

  // Pixel budget for the drawing buffer. Desktop supersamples a little for antialiasing.
  pixels: { desktop: 3.2e6, mobile: 2.1e6, desktopMinRatio: 1.5, maxRatio: 3 },
};

// ?plain=1 switches every layer off: the unlit painting on the backdrop, nothing else. Each entry is one
// layer and the values that switch it off; ?plain=1&keep=grade,form leaves the named layers on.
export const LAYERS = {
  grade: { 'grade.blackPoint': 0, 'grade.whitePoint': 1, 'grade.gamma': 1, 'grade.saturation': 1 },
  sharp: { sharpPaintBelow: 0, 'sharpen.amount': 0, repair: 0 },
  form: { 'form.shade': 0, 'form.ao': 0, 'form.rim': 0 },
  sheen: { 'sheen.gold': 0, 'sheen.armor': 0 },
  glow: { 'emissive.strength': 0, 'emissive.glow': 0, 'emissive.whiteCore': 0, 'bloom.strength': 0, 'sparkle.strength': 0 },
  ink: { 'ink.depth': 0 },
  finish: { 'paint.amount': 0, 'paint.smearBlur': 0, grain: 0 },
  parts: { 'untextured.use': 0 },
};
