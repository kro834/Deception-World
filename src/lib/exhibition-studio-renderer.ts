import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RectAreaLight,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Texture,
  Vector2,
  WebGLRenderer,
  type BufferGeometry,
  type WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import {
  createCottonMatGeometry,
  createMiteredFrameGeometry,
  getExhibitionCamera,
  getExhibitionDimensions,
  type ExhibitionDimensions,
} from "./exhibition-studio-geometry";

export type ExhibitionStudioStatus = "loading" | "ready" | "paused" | "context-lost" | "error";
export type ExhibitionStudioView = "front" | "oblique" | "room";
export interface ExhibitionStudioOptions {
  artworkUrl: string;
  artworkWidth: number;
  artworkHeight: number;
  quality: "high" | "cinema";
  signal?: AbortSignal;
  onStatus?: (status: ExhibitionStudioStatus) => void;
}
export interface ExhibitionStudio {
  dispose(): void;
  pause(): void;
  resume(): void;
  resize(): void;
  setView(view: ExhibitionStudioView): void;
  getDiagnostics(): {
    renderer: "three-webgl-physical-exhibition";
    quality: "high" | "cinema";
    artworkUrl: string;
    artworkAspect: number;
    decodedArtworkSize: readonly [number, number];
    frame: ExhibitionDimensions;
    view: ExhibitionStudioView;
    width: number;
    height: number;
    pixelRatio: number;
    renderCount: number;
    ready: boolean;
    paused: boolean;
    disposed: boolean;
    contextLost: boolean;
    environment: "blender-studio-hdr" | "room-fallback";
    geometries: number;
    textures: number;
  };
}

/** Deterministic material microstructure; never applied to or composited into the original image. */
function surfaceGrain(size: number, variation: number, seed: number) {
  const pixels = new Uint8Array(size * size * 4);
  let random = seed;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const fine = random / 4294967296 - 0.5;
      const broad = Math.sin(x / 43 + Math.sin(y / 53)) * Math.cos(y / 37) * 0.17;
      const value = Math.round(128 + (fine + broad) * variation);
      const offset = (y * size + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function abortError() {
  return new DOMException("Exhibition loading was cancelled.", "AbortError");
}

/**
 * Opaque, metre-scaled exhibition. There is no idle animation loop: a draw is scheduled only
 * for a changed camera/size or restored context. Every asynchronous load is abortable.
 */
export async function createExhibitionStudio(
  canvas: HTMLCanvasElement,
  options: ExhibitionStudioOptions,
): Promise<ExhibitionStudio> {
  const requestedDimensions = getExhibitionDimensions(options.artworkWidth, options.artworkHeight);
  const controller = new AbortController();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const bitmaps = new Set<ImageBitmap>();
  let renderer: WebGLRenderer | null = null;
  let environmentTarget: WebGLRenderTarget | null = null;
  let environmentInput: Texture | null = null;
  let disposed = false;
  let paused = false;
  let contextLost = false;
  let ready = false;
  let frameId = 0;
  let renderCount = 0;
  let view: ExhibitionStudioView = "front";
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let dimensions = requestedDimensions;
  let decodedSize: readonly [number, number] = [options.artworkWidth, options.artworkHeight];
  let environmentSource: "blender-studio-hdr" | "room-fallback" = "room-fallback";
  const scene = new Scene();
  scene.background = new Color(0xe3ded3);
  const camera = new PerspectiveCamera(39, 1, 0.025, 40);
  const notify = (status: ExhibitionStudioStatus) => {
    if (!disposed) options.onStatus?.(status);
  };
  const ownGeometry = <T extends BufferGeometry>(geometry: T) => {
    geometries.add(geometry);
    return geometry;
  };
  const ownMaterial = <T extends Material>(material: T) => {
    materials.add(material);
    return material;
  };
  const ownTexture = <T extends Texture>(texture: T) => {
    textures.add(texture);
    return texture;
  };
  const mesh = (geometry: BufferGeometry, material: Material, name: string) => {
    const object = new Mesh(ownGeometry(geometry), material);
    object.name = name;
    object.castShadow = object.receiveShadow = true;
    return object;
  };
  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    controller.abort();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    options.signal?.removeEventListener("abort", onExternalAbort);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
    scene.traverse((object) => {
      if (object instanceof DirectionalLight || object instanceof SpotLight)
        object.shadow.dispose();
    });
    scene.clear();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    bitmaps.forEach((bitmap) => bitmap.close());
    geometries.clear();
    materials.clear();
    textures.clear();
    bitmaps.clear();
    environmentTarget?.dispose();
    environmentTarget = null;
    renderer?.dispose();
    // Release the context as well as GPU objects on repeated route/image changes.
    renderer?.forceContextLoss();
    renderer = null;
  }
  function onExternalAbort() {
    dispose();
  }
  function onContextLost(event: Event) {
    event.preventDefault();
    contextLost = true;
    ready = false;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    notify("context-lost");
  }
  function onContextRestored() {
    contextLost = false;
    if (disposed || !renderer) return;
    try {
      // PMREM is a GPU-generated target; its pixels must be regenerated after context loss.
      rebuildEnvironment();
      scheduleRender();
    } catch (error) {
      notify("error");
      dispose();
      console.error("The exhibition lighting context could not be restored.", error);
    }
  }
  function rebuildEnvironment() {
    if (!renderer || disposed) return;
    const pmrem = new PMREMGenerator(renderer);
    let nextTarget: WebGLRenderTarget;
    try {
      if (environmentInput) {
        nextTarget = pmrem.fromEquirectangular(environmentInput);
        environmentSource = "blender-studio-hdr";
      } else {
        const room = new RoomEnvironment();
        try {
          nextTarget = pmrem.fromScene(room, 0.04);
        } finally {
          room.dispose();
        }
      }
      const previous = environmentTarget;
      environmentTarget = nextTarget;
      scene.environment = nextTarget.texture;
      previous?.dispose();
    } finally {
      pmrem.dispose();
    }
  }
  function draw() {
    frameId = 0;
    if (disposed || paused || contextLost || !renderer) return;
    try {
      renderer.render(scene, camera);
      renderCount++;
      ready = true;
      notify("ready");
    } catch (error) {
      ready = false;
      notify("error");
      dispose();
      console.error("The physical exhibition could not be rendered.", error);
    }
  }
  function scheduleRender() {
    if (!disposed && !paused && !contextLost && !frameId) frameId = requestAnimationFrame(draw);
  }
  function updateCamera() {
    const fit = getExhibitionCamera(dimensions, width, height, view);
    camera.aspect = fit.aspect;
    camera.fov = fit.fov;
    camera.position.set(...fit.position);
    camera.lookAt(...fit.target);
    camera.updateProjectionMatrix();
  }
  function resize() {
    if (disposed || !renderer) return;
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 1));
    height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 1));
    // Transmission samples a screen-space buffer. Supersample even a 1x display so
    // the extra glass sampling does not soften fine linework in the original.
    const requestedDpr = options.quality === "cinema" ? 3 : 2;
    // This is a GPU allocation safety bound, not a lower-quality fallback for mobile devices.
    pixelRatio = Math.min(
      requestedDpr,
      Math.sqrt((options.quality === "cinema" ? 16_000_000 : 8_000_000) / (width * height)),
    );
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    updateCamera();
    scheduleRender();
  }
  async function imageTexture(url: string, colour: boolean) {
    const response = await fetch(url, {
      signal: controller.signal,
      mode: "cors",
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(`Exhibition texture request failed (${response.status}).`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob, {
      imageOrientation: "flipY",
      premultiplyAlpha: "none",
    });
    if (disposed || controller.signal.aborted) {
      bitmap.close();
      throw abortError();
    }
    bitmaps.add(bitmap);
    const texture = ownTexture(new Texture(bitmap));
    texture.flipY = false;
    if (colour) texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(16, renderer?.capabilities.getMaxAnisotropy() ?? 1);
    texture.needsUpdate = true;
    return { texture, bitmap };
  }
  async function studioEnvironment() {
    const response = await fetch("/exhibition-studio/studio-light.hdr", {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Exhibition lighting request failed (${response.status}).`);
    const buffer = await response.arrayBuffer();
    if (disposed || controller.signal.aborted) throw abortError();
    return ownTexture(new HDRLoader().createDataTexture(buffer));
  }
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  if (options.signal?.aborted) {
    dispose();
    throw abortError();
  }
  notify("loading");
  try {
    renderer = new WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    const artwork = await imageTexture(options.artworkUrl, true);
    decodedSize = [artwork.bitmap.width, artwork.bitmap.height];
    dimensions = getExhibitionDimensions(...decodedSize);
    const optionalMaps = await Promise.allSettled([
      imageTexture("/ultra-materials/brushed-alloy-normal.png", false),
      imageTexture("/ultra-materials/brushed-alloy-roughness.png", false),
      studioEnvironment(),
      imageTexture("/exhibition-studio/plaster-normal.png", false),
      imageTexture("/exhibition-studio/plaster-roughness.png", false),
    ]);
    if (disposed || controller.signal.aborted) throw abortError();
    const normalMap = optionalMaps[0].status === "fulfilled" ? optionalMaps[0].value.texture : null;
    const roughnessMap =
      optionalMaps[1].status === "fulfilled" ? optionalMaps[1].value.texture : null;
    const plasterNormal =
      optionalMaps[3].status === "fulfilled" ? optionalMaps[3].value.texture : null;
    const plasterRoughness =
      optionalMaps[4].status === "fulfilled" ? optionalMaps[4].value.texture : null;
    for (const texture of [plasterNormal, plasterRoughness]) {
      if (!texture) continue;
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(4.8 / 0.25, 3 / 0.25);
    }
    RectAreaLightUniformsLib.init();
    environmentInput = optionalMaps[2].status === "fulfilled" ? optionalMaps[2].value : null;
    rebuildEnvironment();
    scene.environmentIntensity = 0.36;

    const plasterGrain = ownTexture(surfaceGrain(512, 90, 4871));
    plasterGrain.repeat.set(10, 6);
    const plaster = ownMaterial(
      new MeshStandardMaterial({
        color: 0xc9c3b6,
        roughness: 0.94,
        normalMap: plasterNormal,
        normalScale: new Vector2(0.15, 0.15),
        roughnessMap: plasterRoughness,
        bumpMap: plasterNormal ? null : plasterGrain,
        bumpScale: 0.004,
      }),
    );
    const wall = mesh(new BoxGeometry(4.8, 3, 0.1), plaster, "lime-plaster-wall");
    wall.position.set(0, 1.5, -0.05);
    scene.add(wall);
    // Return walls and ceiling keep wide/oblique views inside an actual room,
    // rather than exposing the edge of a single display plane.
    for (const x of [-2.45, 2.45]) {
      const side = mesh(new BoxGeometry(0.1, 3, 6), plaster, "plaster-side-wall");
      side.position.set(x, 1.5, 3);
      scene.add(side);
    }
    const ceiling = mesh(new BoxGeometry(4.8, 0.1, 6), plaster, "plaster-ceiling");
    ceiling.position.set(0, 3.05, 3);
    scene.add(ceiling);
    const stoneGrain = ownTexture(surfaceGrain(512, 100, 3872));
    stoneGrain.repeat.set(12, 12);
    const stone = ownMaterial(
      new MeshStandardMaterial({
        color: 0x9c978a,
        roughness: 0.58,
        bumpMap: stoneGrain,
        bumpScale: 0.0016,
        envMapIntensity: 0.6,
      }),
    );
    const floor = mesh(new BoxGeometry(4.8, 0.06, 6), stone, "honed-stone-floor");
    floor.position.set(0, -0.03, 3);
    scene.add(floor);
    const skirting = mesh(
      new BoxGeometry(4.8, 0.07, 0.018),
      plaster,
      "seventy-millimetre-skirting",
    );
    skirting.position.set(0, 0.035, 0.009);
    scene.add(skirting);
    const seamMaterial = ownMaterial(new MeshStandardMaterial({ color: 0x777368, roughness: 1 }));
    for (let x = -2; x <= 2; x++) {
      const seam = mesh(new BoxGeometry(0.0015, 0.0004, 6), seamMaterial, "stone-joint");
      seam.position.set(x, 0.0002, 3);
      scene.add(seam);
    }
    for (let z = 1; z < 6; z++) {
      const seam = mesh(new BoxGeometry(4.8, 0.0004, 0.0015), seamMaterial, "stone-joint");
      seam.position.set(0, 0.0002, z);
      scene.add(seam);
    }

    const mount = new Group();
    mount.name = "physical-framed-original";
    mount.position.y = dimensions.centreHeight;
    scene.add(mount);
    const aluminium = ownMaterial(
      new MeshStandardMaterial({
        color: 0x626967,
        metalness: 0.92,
        roughness: 0.42,
        normalMap,
        normalScale: new Vector2(0.035, 0.035),
        roughnessMap,
      }),
    );
    for (const geometry of createMiteredFrameGeometry(dimensions)) {
      const rail = mesh(geometry, aluminium, "bevelled-mitered-aluminium-rail");
      rail.position.z = dimensions.wallGap + dimensions.frameBevel;
      mount.add(rail);
    }
    const backingMaterial = ownMaterial(
      new MeshStandardMaterial({ color: 0x242521, roughness: 1 }),
    );
    const backing = mesh(
      new BoxGeometry(dimensions.innerWidth, dimensions.innerHeight, 0.008),
      backingMaterial,
      "archival-backing-board",
    );
    backing.position.z = dimensions.wallGap + 0.005;
    mount.add(backing);
    for (const x of [-dimensions.innerWidth * 0.4, dimensions.innerWidth * 0.4]) {
      for (const y of [-dimensions.innerHeight * 0.4, dimensions.innerHeight * 0.4]) {
        const spacer = mesh(
          new BoxGeometry(0.025, 0.025, dimensions.wallGap),
          backingMaterial,
          "hidden-wall-spacer",
        );
        spacer.position.set(x, y, dimensions.wallGap / 2);
        mount.add(spacer);
      }
    }
    const cottonGrain = ownTexture(surfaceGrain(256, 150, 1763));
    cottonGrain.repeat.set(28, 28);
    const cotton = ownMaterial(
      new MeshStandardMaterial({
        color: 0xf3eee3,
        roughness: 1,
        bumpMap: cottonGrain,
        bumpScale: 0.00065,
      }),
    );
    const mat = mesh(createCottonMatGeometry(dimensions), cotton, "bevel-cut-cotton-rag-mat");
    mat.position.z = 0.055;
    mount.add(mat);
    const print = mesh(
      new PlaneGeometry(dimensions.printWidth, dimensions.printHeight),
      ownMaterial(
        new MeshBasicMaterial({
          map: artwork.texture,
          color: 0xffffff,
          toneMapped: false,
        }),
      ),
      "uncropped-original-artwork-print",
    );
    print.position.z = 0.053;
    print.castShadow = print.receiveShadow = false;
    mount.add(print);
    const glass = mesh(
      new BoxGeometry(
        dimensions.innerWidth - 0.002,
        dimensions.innerHeight - 0.002,
        dimensions.glassThickness,
      ),
      ownMaterial(
        new MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0,
          roughness: 0,
          transmission: 1,
          // Low specular intensity approximates the anti-reflective coating, not a false glass IOR.
          thickness: dimensions.glassThickness,
          ior: 1.52,
          specularIntensity: 0.035,
          envMapIntensity: 0.16,
          attenuationColor: new Color(0xffffff),
          attenuationDistance: Infinity,
        }),
      ),
      "separate-low-reflection-museum-glass",
    );
    glass.position.z = 0.066;
    glass.castShadow = glass.receiveShadow = false;
    mount.add(glass);

    scene.add(new HemisphereLight(0xf4f6ff, 0x8b806e, 0.65));
    const windowLight = new RectAreaLight(0xf5f5ff, 4.0, 1.7, 2.4);
    windowLight.position.set(-2.3, 2.4, 2.0);
    windowLight.lookAt(0, 1.3, 0);
    scene.add(windowLight);
    const daylight = new SpotLight(0xf4f5ff, 35, 8, 1.15, 0.75, 2);
    daylight.name = "window-daylight-shadow";
    // This finite shadow-casting fill sits inside the window. An infinite
    // directional source would let the enclosing walls occlude the whole room.
    daylight.position.copy(windowLight.position);
    daylight.target.position.set(0, 1.3, 0);
    daylight.castShadow = true;
    daylight.shadow.mapSize.setScalar(options.quality === "cinema" ? 4096 : 2048);
    daylight.shadow.camera.near = 0.1;
    daylight.shadow.camera.far = 8;
    daylight.shadow.bias = -0.00008;
    daylight.shadow.normalBias = 0.001;
    daylight.shadow.radius = 3;
    scene.add(daylight, daylight.target);
    const fixtureMaterial = ownMaterial(
      new MeshStandardMaterial({ color: 0x2a2b29, metalness: 0.6, roughness: 0.38 }),
    );
    const track = mesh(
      new BoxGeometry(2.4, 0.035, 0.032),
      fixtureMaterial,
      "ceiling-lighting-track",
    );
    track.position.set(0, 2.91, 0.3);
    scene.add(track);
    for (const x of [-0.65, 0.65]) {
      const fixture = mesh(
        new CylinderGeometry(0.04, 0.04, 0.115, 32),
        fixtureMaterial,
        "aimed-gallery-spot-fixture",
      );
      fixture.position.set(x, 2.82, 0.3);
      fixture.rotation.x = -0.4;
      scene.add(fixture);
      const spotlight = new SpotLight(0xffedd5, 14, 5, 0.6, 0.75, 2);
      spotlight.position.set(x, 2.75, 0.25);
      spotlight.target.position.set(x * 0.35, dimensions.centreHeight, 0);
      scene.add(spotlight, spotlight.target);
    }
    resize();
    // A completed first draw, not merely a loaded image, is the readiness boundary.
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    draw();
    if (!ready) throw new Error("The first exhibition frame could not be rendered.");
    return {
      dispose,
      pause() {
        if (disposed || paused) return;
        paused = true;
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        notify("paused");
      },
      resume() {
        if (disposed) return;
        paused = false;
        scheduleRender();
      },
      resize,
      setView(nextView) {
        if (disposed || !["front", "oblique", "room"].includes(nextView) || view === nextView)
          return;
        view = nextView;
        updateCamera();
        scheduleRender();
      },
      getDiagnostics() {
        return {
          renderer: "three-webgl-physical-exhibition",
          quality: options.quality,
          artworkUrl: options.artworkUrl,
          artworkAspect: dimensions.aspect,
          decodedArtworkSize: decodedSize,
          frame: { ...dimensions },
          view,
          width,
          height,
          pixelRatio,
          renderCount,
          ready,
          paused,
          disposed,
          contextLost,
          environment: environmentSource,
          geometries: renderer?.info.memory.geometries ?? 0,
          textures: renderer?.info.memory.textures ?? 0,
        };
      },
    };
  } catch (error) {
    const wasAborted = disposed || controller.signal.aborted;
    if (!wasAborted) notify("error");
    dispose();
    throw wasAborted ? abortError() : error;
  }
}
