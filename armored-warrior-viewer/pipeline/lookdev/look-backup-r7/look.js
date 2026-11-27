// The look: painted-texture-first materials + the frame pipeline, behind a small interface for viewer.js.
//
//   const look = createLook({ renderer, camera });
//   await look.ready;                         // matcaps, light rig, maps manifest (never rejects)
//   await look.prepareModel(root, { mode });  // swap the glTF materials for the painted materials
//   look.setBounds(box); look.setSize(w, h, pixelRatio);
//   look.render(scene, { full, paint });      // full = run the brush pass; paint = 0..1 mix
//   look.composite(paint);                    // re-run only the final pass (cross-fade)
//
// Tiers, picked at runtime and lowered automatically when something fails:
//   full     everything                      lite     no brush pass
//   forward  materials straight to the canvas (no outline, no bloom)
import * as THREE from '../vendor/three/build/three.module.min.js';
import { LOOK, LAYERS } from './tunables.js';
import { createSharedUniforms, createMaterialFactory } from './material.js';
import { createPipeline } from './post.js';
import { createShadowMap } from './shadow.js';

const TIERS = ['forward', 'lite', 'full'];

export function createLook({ renderer, camera }) {
  const params = new URLSearchParams(location.search);
  // Look-dev aids. ?plain=1 switches every layer off (the unlit painting on the backdrop), except
  // those named in ?keep=; ?set=shadow.band:0.7,ink.color:%23101020 overrides tunables for one page
  // load. Only existing numbers and #rrggbb colours can be replaced, by a value of the same kind.
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const plain = params.get('plain') === '1';
  const keep = (params.get('keep') || '').split(',');
  const overrides = [];
  if (plain) {
    for (const [layer, off] of Object.entries(LAYERS)) {
      if (!keep.includes(layer)) for (const [path, value] of Object.entries(off)) overrides.push([path, String(value)]);
    }
  }
  // A ?debug= view shows one buffer of the material: the layers that would draw over it are off.
  const debug = Number(params.get('debug') || 0);
  if (debug > 0) for (const name of ['glow', 'finish']) for (const [path, value] of Object.entries(LAYERS[name])) overrides.push([path, String(value)]);
  for (const pair of (params.get('set') || '').split(',')) overrides.push(pair.split(':'));
  for (const [path, raw] of overrides) {
    if (!path || raw === undefined) continue;
    const keys = path.split('.');
    let node = LOOK;
    for (const key of keys.slice(0, -1)) node = node && own(node, key) && typeof node[key] === 'object' ? node[key] : null;
    const last = keys[keys.length - 1];
    if (!node || !own(node, last)) continue;
    if (typeof node[last] === 'number' && raw !== '' && Number.isFinite(Number(raw))) node[last] = Number(raw);
    else if (/^#[0-9a-f]{6}$/i.test(String(node[last])) && /^#[0-9a-f]{6}$/i.test(raw)) node[last] = raw;
  }
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const shared = createSharedUniforms(LOOK);
  const factory = createMaterialFactory(shared);
  const pipeline = createPipeline({ renderer, LOOK, brushEnabled: () => paintOn(), brushScale: () => (coarse ? LOOK.paint.mobileScale : LOOK.paint.scale) });
  const shadowMap = createShadowMap({ renderer, size: coarse ? LOOK.shadow.mapSizeMobile : LOOK.shadow.mapSize });
  const loader = new THREE.TextureLoader();
  const ground = new THREE.Vector4(0, 0, 0, 1);
  const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const scratch = new THREE.Vector3();
  const initialTier = TIERS.includes(params.get('tier')) ? params.get('tier') : 'full';
  let tier = initialTier;
  // Materials whose program failed to compile or link: sticky, because three reports a broken program
  // only on its first use and a later attempt would otherwise "succeed" with it.
  const broken = new Set();
  let fatal = ''; // set when the figure itself (painted material, final pass) cannot be drawn
  let lastShaderError = '';
  let manifest = null;
  let maps = null;
  let lastFullMs = 0;
  let triangles = 0;
  let castFailed = false;
  const notes = [];

  shared.uDebug.value = debug;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    const log = gl.getShaderInfoLog(fragmentShader) || gl.getShaderInfoLog(vertexShader) || gl.getProgramInfoLog(program) || '';
    lastShaderError = log.slice(0, 300);
    console.error('Look shader failed to compile:', log.slice(0, 600));
  };

  function lower(reason) {
    const index = TIERS.indexOf(tier);
    if (index <= 0) return false;
    tier = TIERS[index - 1];
    notes.push(`${reason} -> ${tier}`);
    console.warn(`Look: ${reason}; falling back to the "${tier}" tier.`);
    return true;
  }

  async function loadTexture(url, { colorSpace = THREE.NoColorSpace, flipY = true } = {}) {
    const texture = await loader.loadAsync(url);
    texture.colorSpace = colorSpace;
    texture.flipY = flipY;
    texture.needsUpdate = true;
    return texture;
  }

  async function loadMatcaps() {
    // The matcaps only place the sheen. Without one, a black stand-in means "no glint anywhere".
    await Promise.all([['matcapGold', 'gold'], ['matcapArmor', 'armor']].map(async ([uniform, name]) => {
      try {
        if (!LOOK.matcapDir || !needs.matcaps) throw new Error('off');
        const url = new URL(`${LOOK.matcapDir}${name}.webp`, import.meta.url).href;
        shared[uniform].value = await loadTexture(url, { colorSpace: THREE.SRGBColorSpace });
      } catch (error) {
        const none = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
        none.colorSpace = THREE.SRGBColorSpace;
        none.needsUpdate = true;
        shared[uniform].value = none;
        if (LOOK.matcapDir && needs.matcaps) notes.push(`matcap ${name} missing`);
      }
    }));
  }

  async function loadRig() {
    if (!LOOK.lightRig) return;
    try {
      const rig = await (await fetch(new URL(LOOK.lightRig, import.meta.url))).json();
      if (rig.key?.dir) shared.uKeyDir.value.set(...rig.key.dir).normalize();
    } catch (error) {
      notes.push('light rig missing');
    }
  }

  // The manifest lists optional maps per material and mode: maps[material][mode][key] = file.
  // Keys read here: paint (replaces the base colour) with its flag paintForce, toonNormal, style;
  // on request paintRepaired and conf. Others are ignored.
  async function loadManifest() {
    if (!LOOK.mapsManifest) return;
    try {
      const url = new URL(LOOK.mapsManifest, import.meta.url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(String(response.status));
      const maps = (await response.json()).maps || {};
      manifest = {};
      for (const [name, modes] of Object.entries(maps)) {
        for (const [mode, entry] of Object.entries(modes || {})) {
          const target = ((manifest[name] ||= {})[mode] ||= {});
          for (const [key, value] of Object.entries(entry || {})) {
            if (typeof value === 'string') target[key] = new URL(value, url).href;
            else if (typeof value === 'boolean') target[key] = value;
          }
        }
      }
    } catch (error) {
      manifest = null;
      notes.push('maps manifest missing');
    }
  }

  // Which helpers the current settings actually sample. What is not sampled is not loaded, and the
  // model's own copy is released before it reaches the GPU.
  const { shadow, sheen, emissive, sparkle, paint } = LOOK;
  const sheenOn = sheen.gold > 0 || sheen.armor > 0;
  const glowOn = emissive.strength > 0 || emissive.glow > 0 || emissive.whiteCore > 0 || sparkle.strength > 0;
  const shadowOn = shadow.amount > 0;
  const needs = {
    matcaps: sheenOn,
    emissive: glowOn || shadowOn || sheenOn || debug > 0, // glowing crystal answers shadow and sheen differently
    style: (shadowOn && (shadow.creasePull > 0 || shadow.creaseCut > 0)) || debug > 0,
    toonNormal: shadow.smoothNormal > 0 && (shadowOn || sheenOn || debug > 0 || (paint.sideways > 0 && (paint.amount > 0 || paint.smearBlur > 0))),
    cast: (shadowOn || debug > 0) && shadow.cast > 0,
  };

  const ready = Promise.all([loadMatcaps(), loadRig(), loadManifest()]).then(() => undefined);

  // The standard helper maps do not depend on the model, so they are fetched while the model downloads
  // instead of after it is parsed. prepareModel takes each one once (same key, same URL); paint maps
  // still wait for the model, because whether they are used depends on its geometry.
  const prefetched = new Map();
  function prefetchHelpers() {
    const keys = [needs.toonNormal && 'toonNormal', needs.style && 'style', LOOK.paint.confidenceMap > 0 && ((paintOn() && LOOK.paint.smeared > 0) || LOOK.paint.smearBlur > 0) && 'conf'].filter(Boolean);
    for (const modes of Object.values(manifest || {})) {
      const entry = (LOOK.detailHelpers > 0 && !coarse ? null : modes.standard) ?? null;
      for (const key of keys) {
        if (!entry?.[key] || prefetched.has(`${key} ${entry[key]}`)) continue;
        const job = loadTexture(entry[key], { flipY: false });
        job.catch(() => {});
        prefetched.set(`${key} ${entry[key]}`, job);
      }
    }
  }
  ready.then(prefetchHelpers);
  function takeTexture(key, url, options) {
    const job = prefetched.get(`${key} ${url}`);
    if (!job) return loadTexture(url, options);
    prefetched.delete(`${key} ${url}`);
    return job;
  }

  // Release a glTF texture before it ever reaches the GPU.
  function drop(source, key) {
    const texture = source[key];
    if (!texture) return;
    if (typeof ImageBitmap !== 'undefined' && texture.source?.data instanceof ImageBitmap) texture.source.data.close();
    texture.dispose();
    source[key] = null;
  }

  // Resolves true once every job has settled, or false as soon as none has settled for stallMs.
  function settleUnlessStalled(jobs, stallMs) {
    return new Promise((resolve) => {
      let left = jobs.length;
      let timer = 0;
      const arm = () => { clearTimeout(timer); timer = setTimeout(() => resolve(false), stallMs); };
      if (!left) { resolve(true); return; }
      arm();
      for (const job of jobs) job.finally(() => { if (--left === 0) { clearTimeout(timer); resolve(true); } else arm(); });
    });
  }

  // Swap every mesh's glTF material for a painted material.
  async function prepareModel(root, { mode = 'standard', stallMs = 45_000 } = {}) {
    // Matcaps, light rig and manifest are optional too: a stalled one does not hold the model back.
    await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, stallMs))]);
    const cache = new Map();
    const jobs = [];
    let waiting = true;
    let count3 = 0;
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    root.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      if (!object.geometry.attributes.normal) object.geometry.computeVertexNormals();
      count3 += (object.geometry.index ? object.geometry.index.count : object.geometry.attributes.position.count) / 3;
      const source = Array.isArray(object.material) ? object.material[0] : object.material;
      let material = cache.get(source);
      if (!material) {
        material = factory.create(source);
        cache.set(source, material);
        const uniforms = material.uniforms;
        // Sparkle seeds are laid out in UV space; scale the grid so their density on the surface is
        // the same for every atlas (the helmet's atlas is far denser than the body's).
        // The belt hardware keeps its own colours: the buckle and the clasp are painted steel, and the
        // untextured strap pieces are flat (their ribs would turn the armour planes into stripes).
        if (!source.map || /buckle|clasp/i.test(object.name)) uniforms.uDevice.value = 1;
        const density = uvPerWorldUnit(object);
        uniforms.uSparkleCells.value = LOOK.sparkle.density / density;
        const texelsPerUnit = density * (source.map?.image?.width || 0);
        // The shader reads only the painting and its glow: drop the PBR maps before they reach the GPU.
        for (const key of ['metalnessMap', 'roughnessMap', 'aoMap', 'normalMap']) drop(source, key);
        if (!needs.emissive && source.emissiveMap) { drop(source, 'emissiveMap'); uniforms.emissiveMap.value = factory.black; }
        for (const texture of [source.map, source.emissiveMap]) {
          if (texture && texture.anisotropy !== anisotropy) { texture.anisotropy = anisotropy; texture.needsUpdate = true; }
        }
        // Parts the painting does not cover get a paint colour from tunables: gold for warm,
        // saturated base-colour factors (the edge trim), dark for everything else.
        if (!source.map && LOOK.untextured.use > 0) {
          const hsl = source.color.getHSL({});
          const key = hsl.s > 0.3 && hsl.h > 0.02 && hsl.h < 0.17 ? 'gold' : 'dark';
          // THREE.Color converts the hex to linear, which is what the shader expects of a base colour.
          const linear = new THREE.Color(LOOK.untextured[key]);
          uniforms.uBaseColor.value.set(linear.r, linear.g, linear.b);
        }
        // Paint maps follow the model's mode (phones always take the standard ones: the detail model is
        // heavy enough on its own). The helper maps (smoothed normal, AO, confidence) are low-frequency
        // data: the standard 1024² set serves both modes unless tunables ask for the larger one.
        const byMode = manifest?.[source.name] || {};
        const paintEntry = byMode[coarse ? 'standard' : mode] ?? byMode[mode];
        const helperEntry = (LOOK.detailHelpers > 0 && !coarse ? byMode[mode] : byMode.standard) ?? byMode[mode];
        const owned = [];
        const load = (key, options, apply) => {
          const entry = key.startsWith('paint') ? paintEntry : helperEntry;
          if (!entry?.[key]) return;
          jobs.push(takeTexture(key, entry[key], { flipY: false, ...options }).then((texture) => {
            if (!waiting) { texture.dispose(); return; } // arrived after prepareModel stopped waiting
            texture.anisotropy = anisotropy;
            owned.push(texture);
            material.userData.owned = owned;
            apply(texture);
          }).catch(() => notes.push(`map failed: ${key} of ${source.name}`)));
        };
        // `paint` replaces the embedded base colour: always when its entry says paintForce (a corrected
        // painting), otherwise only where the embedded texture is sparse on the surface (a sharper copy).
        // The embedded texture is released as soon as the replacement is in.
        const forced = LOOK.paintFixes > 0 && paintEntry?.paintForce === true;
        if (source.map && (forced || texelsPerUnit < LOOK.sharpPaintBelow)) load('paint', { colorSpace: THREE.SRGBColorSpace }, (texture) => { drop(source, 'map'); uniforms.map.value = texture; material.userData.paint = true; });
        // `paintRepaired` is mixed into it, only when asked for.
        if (LOOK.repair > 0) load('paintRepaired', { colorSpace: THREE.SRGBColorSpace }, (texture) => { uniforms.repairMap.value = texture; uniforms.uRepair.value = Math.min(1, LOOK.repair); });
        // `conf` can tell the brush pass and the texture blur where the painting is smeared (off by default:
        // the geometric test in the shader finds nearly the same places without five more textures).
        if (LOOK.paint.confidenceMap > 0 && ((paintOn() && LOOK.paint.smeared > 0) || LOOK.paint.smearBlur > 0)) load('conf', {}, (texture) => { uniforms.confMap.value = texture; uniforms.uHasConf.value = 1; });
        if (needs.toonNormal) load('toonNormal', {}, (texture) => { uniforms.toonNormalMap.value = texture; uniforms.uHasToonNormal.value = 1; });
        if (needs.style) load('style', {}, (texture) => { uniforms.styleMap.value = texture; uniforms.uHasStyle.value = 1; });
      }
      object.userData.lookSource = object.material;
      object.material = material;
    });
    // The helper maps are optional: one that has stopped arriving does not hold the model back.
    if (!(await settleUnlessStalled(jobs, stallMs))) notes.push('helper maps stalled: shown without the missing ones');
    waiting = false;
    triangles = Math.round(count3);
    root.userData.lookMaterials = [...cache.values()];
    const count = (test) => root.userData.lookMaterials.filter(test).length;
    maps = {
      materials: cache.size,
      paint: count((material) => material.userData.paint),
      repaired: count((material) => material.uniforms.uRepair.value > 0),
      conf: count((material) => material.uniforms.uHasConf.value > 0),
      toonNormal: count((material) => material.uniforms.uHasToonNormal.value > 0),
      style: count((material) => material.uniforms.uHasStyle.value > 0),
      emissive: count((material) => material.userData.source.emissiveMap),
    };
  }

  // Free everything a model holds: geometry, the glTF materials and their textures, the painted materials.
  function disposeModel(root) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const bitmaps = new Set();
    root.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const item of [].concat(object.userData.lookSource || [], object.material || [])) materials.add(item);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      if (material.isShaderMaterial) {
        for (const texture of material.userData.owned || []) textures.add(texture);
      } else {
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
      material.dispose();
    }
    for (const texture of textures) {
      if (typeof ImageBitmap !== 'undefined' && texture.source?.data instanceof ImageBitmap) bitmaps.add(texture.source.data);
      texture.dispose();
    }
    for (const bitmap of bitmaps) bitmap.close();
  }

  // Square root of (UV area / world area) over a sample of triangles: UV units per world unit.
  function uvPerWorldUnit(mesh) {
    const { position, uv } = mesh.geometry.attributes;
    const index = mesh.geometry.index;
    if (!position || !uv || !index) return 1;
    mesh.updateWorldMatrix(true, false);
    const scale = mesh.matrixWorld.getMaxScaleOnAxis();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const triangles = index.count / 3;
    const step = Math.max(1, Math.floor(triangles / 20000));
    let areaUv = 0;
    let areaWorld = 0;
    for (let t = 0; t < triangles; t += step) {
      const i0 = index.getX(t * 3), i1 = index.getX(t * 3 + 1), i2 = index.getX(t * 3 + 2);
      a.fromBufferAttribute(position, i0); b.fromBufferAttribute(position, i1); c.fromBufferAttribute(position, i2);
      areaWorld += b.sub(a).cross(c.sub(a)).length() * 0.5 * scale * scale;
      const u0 = uv.getX(i0), v0 = uv.getY(i0);
      areaUv += Math.abs((uv.getX(i1) - u0) * (uv.getY(i2) - v0) - (uv.getX(i2) - u0) * (uv.getY(i1) - v0)) * 0.5;
    }
    return areaWorld > 0 && areaUv > 0 ? Math.sqrt(areaUv / areaWorld) : 1;
  }

  // The flattening pass runs on the settled frame only. Touch devices run it at reduced size.
  const paintOn = () => tier === 'full' && LOOK.paint.amount > 0 && (!coarse || LOOK.paint.mobile > 0);

  function setBounds(box) {
    box.getBoundingSphere(sphere);
    ground.set(sphere.center.x, box.min.y, sphere.center.z, sphere.radius);
  }

  function setSize(width, height, pixelRatio) {
    pipeline.setSize(width, height, pixelRatio);
  }

  // The part of the stage the figure is framed in ({ x, y, width, height } in CSS px of a stage of
  // stageWidth x stageHeight), or null for the whole stage. The backdrop's centre follows it, at the
  // same relative point (stage.poolCenter, y up); its radii stay relative to the whole stage.
  function setFit(rect, stageWidth, stageHeight) {
    if (!rect) { pipeline.setPoolCenter(null); return; }
    const [u, v] = LOOK.stage.poolCenter;
    pipeline.setPoolCenter((rect.x + u * rect.width) / stageWidth, 1 - (rect.y + (1 - v) * rect.height) / stageHeight);
  }

  // Tight near/far around the figure: far more depth precision for the outline.
  function fitDepthRange() {
    const distance = camera.getWorldPosition(scratch).distanceTo(sphere.center);
    camera.near = Math.max(distance - sphere.radius * 1.05, sphere.radius * 0.004);
    camera.far = distance + sphere.radius * 1.6;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function renderForward(scene) {
    // Straight to the canvas. The material normally keeps its glow amount in alpha; the canvas
    // has an alpha channel, so here it must write 1 or the page would shine through the picture.
    shared.uOpaque.value = 1;
    pipeline.setOpaqueBackdrop(true);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    pipeline.drawBackdrop(camera, ground);
    renderer.render(scene, camera);
  }

  // Cast shadows: redraw the light's depth map for this camera. On touch devices a heavy model gets
  // it only for the settled frame; while such a model moves it shows the band and crease shadows.
  function castShadows(scene, full) {
    const cast = shared.uCast.value;
    cast.x = 0;
    if (!needs.cast || castFailed) return;
    if (!full && coarse && triangles > LOOK.shadow.movingTriangles) return;
    try {
      if (!shadowMap.render(scene, camera, sphere, shared.uKeyDir.value)) throw new Error('shadow target incomplete');
      shared.shadowMap.value = shadowMap.texture;
      shared.uShadowMatrix.value.copy(shadowMap.matrix);
      cast.set(LOOK.shadow.cast, LOOK.shadow.castOffset, shadowMap.depthOf(LOOK.shadow.castBias), 1 / shadowMap.size);
    } catch (error) {
      // Without the map the figure still has its band and crease shadows.
      castFailed = true;
      shared.shadowMap.value = factory.noShadow;
      notes.push(`${error.message || error} -> no cast shadows`);
      renderer.setRenderTarget(null);
    }
  }

  // After a frame: which programs failed for the first time? A painted material or the final pass is
  // fatal; a failed backdrop, bloom or star pass is switched off; a failed brush pass lowers the tier.
  function checkPrograms(scene) {
    const test = (material) => {
      if (broken.has(material)) return false;
      const program = renderer.properties.get(material).currentProgram;
      if (program?.diagnostics?.runnable !== false) return false;
      broken.add(material);
      return true;
    };
    scene.traverse((object) => {
      if (object.isMesh && object.material?.isShaderMaterial && test(object.material)) fatal ||= `shader of ${object.material.name} failed`;
    });
    const failed = pipeline.checkPrograms(test);
    if (failed.includes('final')) fatal ||= 'final pass shader failed';
    for (const kind of failed) notes.push(`${kind} shader failed`);
    if (fatal) console.error(`Look: ${fatal}; 3D cannot be shown.`);
    return failed;
  }

  // Draw one frame. `full` runs the brush pass; `paint` (0..1) is how much of it shows.
  function render(scene, { full = false, paint = 1 } = {}) {
    // A lost context makes every check fail (incomplete framebuffer): never lower the tier for that.
    if (fatal || renderer.getContext().isContextLost()) return;
    fitDepthRange();
    castShadows(scene, full);
    const started = performance.now();
    while (tier !== 'forward') {
      try {
        if (!pipeline.renderGeometry(scene, camera, ground)) throw new Error('geometry target incomplete');
        pipeline.renderLight();
        if (full && paintOn()) pipeline.renderPaint();
        pipeline.renderFinal(camera, paint);
        renderer.setRenderTarget(null);
        const failed = checkPrograms(scene);
        if (fatal) return;
        if (failed.includes('paint')) { lower('brush shader failed'); continue; }
        if (failed.length) continue; // draw this frame again without the passes just switched off
        if (full) lastFullMs = performance.now() - started;
        return;
      } catch (error) {
        renderer.setRenderTarget(null);
        if (tier === 'full' && full) lower(String(error.message || error));
        else { pipeline.reset(); tier = 'forward'; notes.push(`${error.message || error} -> forward`); }
      }
    }
    renderForward(scene);
    if (checkPrograms(scene).length && !fatal) renderForward(scene);
  }

  // Re-run only the final pass with a different paint mix (used for the settle cross-fade).
  function composite(paint) {
    if (tier === 'forward' || fatal || renderer.getContext().isContextLost()) return;
    try {
      pipeline.renderFinal(camera, paint);
      renderer.setRenderTarget(null);
    } catch (error) {
      renderer.setRenderTarget(null);
    }
  }

  return {
    ready,
    prepareModel,
    disposeModel,
    setBounds,
    setSize,
    setFit,
    render,
    composite,
    get tier() { return tier; },
    get paintable() { return paintOn(); },
    get failed() { return fatal; },
    // For ?diag=1: tier history, passes switched off, failure records, render-target estimate (the
    // shadow map counted as R8 colour + 4-byte depth).
    diagnostics() {
      const shadow = shadowMap.texture ? shadowMap.size * shadowMap.size * 5 : 0;
      return { tier, initialTier, fatal, off: pipeline.off, failures: notes.filter((note) => / -> |failed|stalled|missing/.test(note)), shaderError: lastShaderError, targets: pipeline.targetCount + (shadow ? 1 : 0), targetBytes: pipeline.targetBytes() + shadow };
    },
    // True when the frame drawn at rest differs from the last frame drawn while moving (the flattening
    // pass, or cast shadows that a heavy model on a touch device only gets at rest).
    get settledFrameDiffers() { return paintOn() || (needs.cast && !castFailed && coarse && triangles > LOOK.shadow.movingTriangles); },
    settings: LOOK,
    state() {
      return { tier, triangles, cast: needs.cast && !castFailed, plain: plain ? `plain, kept: ${keep.filter((name) => own(LAYERS, name)).join(' ') || 'nothing'}` : false, size: { ...pipeline.size }, lastFullMs: Math.round(lastFullMs), manifest: !!manifest, maps, brush: paintOn() ? (coarse ? LOOK.paint.mobileScale : LOOK.paint.scale) : false, notes: notes.slice(-6) };
    },
    // Everything is recompiled and reallocated on the new context: start again from the first tier.
    onContextRestored() {
      pipeline.reset();
      shadowMap.reset();
      pipeline.resetPrograms();
      broken.clear();
      castFailed = false;
      if (tier !== initialTier) notes.push(`context restored -> ${initialTier}`);
      tier = initialTier;
    },
    dispose() {
      pipeline.dispose();
      shadowMap.dispose();
      factory.dispose();
      for (const key of ['matcapGold', 'matcapArmor']) shared[key].value?.dispose();
    },
  };
}
