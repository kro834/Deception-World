import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.mjs';

const stage = document.querySelector('#stage');
const poster = document.querySelector('#poster');
const status = document.querySelector('#status');
const quality = document.querySelector('#quality');
const reset = document.querySelector('#reset');
const viewButtons = [...document.querySelectorAll('[data-view]')];
const views = {
  front: { name: '正面', direction: [0, 0.09, 1] },
  rear: { name: '背面', direction: [0, 0.09, -1] },
  side: { name: '側面', direction: [1, 0.06, 0] },
  face: { name: '顔', direction: [0, 0, 1], focus: [0.875, 0.097, 0.107, 0.116] },
  chest: { name: '胸のリアクター', direction: [0, 0, 1], focus: [0.703, 0.126, 0.109, 0.102] },
  belt: { name: 'ベルト正面', direction: [0, 0, 1], focus: [0.568, 0.131, 0.113, 0.085] },
  'belt-rear': { name: 'ベルト背面', direction: [0, 0, -1], focus: [0.570, 0.004, 0.121, 0.082] },
};
let view = 'front';
let fitView = null;

function showStatus(message = '') {
  status.textContent = message;
  status.hidden = !message;
}

function setView(key) {
  view = key;
  for (const button of viewButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.view === key));
  }
  const previews = key === 'belt' || key === 'belt-rear' ? 'previews-v12' : 'previews-v14';
  poster.src = new URL(`./${previews}/${key}.webp`, import.meta.url);
  poster.alt = `装甲戦士の${views[key].name}プレビュー`;
  fitView?.();
}

for (const button of viewButtons) {
  button.addEventListener('click', () => setView(button.dataset.view));
}
reset.addEventListener('click', () => setView('front'));

try {
  startViewer();
} catch (error) {
  console.error(error);
  showStatus('このブラウザでは3Dを表示できません。画像で各方向を確認できます。');
}

function startViewer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '装甲戦士の3Dモデル');
  renderer.domElement.setAttribute('aria-describedby', 'hint');
  renderer.domElement.hidden = true;
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.environmentIntensity = 0.67;
  let environmentTarget;

  function rebuildEnvironment() {
    environmentTarget?.dispose();
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    environmentTarget = pmrem.fromScene(environment, 0.04);
    scene.environment = environmentTarget.texture;
    environment.dispose();
    pmrem.dispose();
  }

  rebuildEnvironment();

  for (const [color, intensity, position] of [
    [0xffeedc, 1.55, [-3, 4, 5]],
    [0xc3d9ff, 0.85, [3, 2, 2]],
    [0xdce9ff, 1.65, [2, 4, -4]],
  ]) {
    const light = new THREE.DirectionalLight(color, intensity);
    light.position.set(...position);
    scene.add(light);
  }

  const camera = new THREE.PerspectiveCamera(34, 1, 0.005, 50);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.zoomToCursor = true;
  controls.listenToKeyEvents(renderer.domElement);
  controls.addEventListener('change', requestRender);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let model = null;
  let bounds = null;
  let mode = 'standard';
  let loading = false;
  let contextLost = false;
  let renderId = 0;
  let glow = null;
  const drawingSize = new THREE.Vector2();

  function requestRender() {
    if (renderId || contextLost) return;
    renderId = requestAnimationFrame(renderNow);
  }

  function renderNow() {
    if (renderId) cancelAnimationFrame(renderId);
    renderId = 0;
    if (contextLost) return;
    renderer.render(scene, camera);
    if (glow) {
      try {
        glow.render(scene, camera, renderer.getDrawingBufferSize(drawingSize));
      } catch (error) {
        console.warn('Optical glow unavailable', error);
        glow.dispose();
        glow = null;
      }
    }
  }

  fitView = () => {
    if (!bounds) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const extent = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const focus = views[view].focus;
    if (focus) {
      const [targetY, targetZ, halfWidth, halfHeight] = focus;
      const height = extent.y * 2;
      center.y = bounds.min.y + height * targetY;
      center.z += height * targetZ;
      extent.set(height * halfWidth, height * halfHeight, height * 0.065);
    }
    const radius = extent.length();
    const direction = new THREE.Vector3(...views[view].direction).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const horizontal = vertical * camera.aspect;
    const corner = new THREE.Vector3();
    let distance = radius;
    for (const x of [-extent.x, extent.x]) {
      for (const y of [-extent.y, extent.y]) {
        for (const z of [-extent.z, extent.z]) {
          corner.set(x, y, z);
          const frame = Math.max(Math.abs(corner.dot(right)) / horizontal, Math.abs(corner.dot(up)) / vertical);
          distance = Math.max(distance, corner.dot(direction) + 1.12 * frame);
        }
      }
    }
    camera.near = radius / 500;
    camera.far = Math.max(distance * 12, radius * 30);
    controls.minDistance = radius * 0.2;
    controls.maxDistance = Math.max(distance * 6, radius * 8);
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.updateProjectionMatrix();
    controls.update();
    renderNow();
  };

  function resize() {
    const width = Math.max(stage.clientWidth, 1);
    const height = Math.max(stage.clientHeight, 1);
    const previous = camera.aspect;
    camera.aspect = width / height;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65, Math.sqrt(3e6 / (width * height))));
    renderer.setSize(width, height, false);
    camera.updateProjectionMatrix();
    if (bounds && Math.abs(previous - camera.aspect) > 0.01) fitView();
    requestRender();
  }

  function dispose(root) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    const bitmapSources = new Set();
    root.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const item of [].concat(node.material)) materials.add(item);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) {
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      material.dispose();
    }
    for (const texture of textures) {
      if (typeof ImageBitmap !== 'undefined' && texture.source.data instanceof ImageBitmap) bitmapSources.add(texture.source.data);
      texture.dispose();
    }
    for (const bitmap of bitmapSources) bitmap.close();
  }

  function revealModel(visible) {
    renderer.domElement.style.visibility = visible ? 'visible' : 'hidden';
    poster.hidden = visible;
    controls.enabled = visible;
    reset.disabled = !visible;
  }

  async function load(nextMode) {
    if (loading || contextLost) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    loading = true;
    quality.disabled = true;
    showStatus(nextMode === 'detail' ? '高精細モデルを読み込み中' : '3Dモデルを読み込み中');
    try {
      const modelName = nextMode === 'detail' ? 'detail-v14.gltf' : 'standard-v14.glb';
      const url = new URL(`./model-v10/${modelName}`, import.meta.url);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Model request failed (${response.status})`);
      const asset = await loader.parseAsync(await response.arrayBuffer(), new URL('./', url).href);
      const nextBounds = new THREE.Box3().setFromObject(asset.scene);
      if (!Number.isFinite(nextBounds.getSize(new THREE.Vector3()).length()) || nextBounds.isEmpty()) {
        dispose(asset.scene);
        throw new Error('Model geometry has no valid bounds');
      }
      if (model) {
        scene.remove(model);
        glow?.dispose();
        dispose(model);
      }
      model = asset.scene;
      bounds = nextBounds;
      mode = nextMode;
      glow = createEmissiveGlow(renderer, model);
      scene.add(model);
      fitView();
      if (!contextLost) {
        revealModel(true);
        showStatus();
        requestRender();
      }
    } catch (error) {
      console.error(error);
      if (!contextLost) {
        showStatus(model ? '切替に失敗しました。現在のモデルを表示しています。' : '3Dを読み込めませんでした。画像で確認するか、再試行できます。');
      }
    } finally {
      clearTimeout(timeout);
      loading = false;
      quality.disabled = contextLost;
      quality.textContent = model ? (mode === 'detail' ? '標準に切替' : '高精細に切替') : '3D表示を再試行';
      quality.setAttribute('aria-pressed', String(mode === 'detail'));
    }
  }

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    quality.disabled = true;
    revealModel(false);
    showStatus('3D表示を復旧中。各方向の画像を確認できます。');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    rebuildEnvironment();
    glow?.resetBuffers();
    quality.disabled = loading;
    revealModel(!!model);
    showStatus(model ? '' : '3D表示を再試行できます。');
    requestRender();
  });
  quality.addEventListener('click', () => void load(model && mode === 'standard' ? 'detail' : 'standard'));
  new ResizeObserver(resize).observe(stage);
  renderer.domElement.hidden = false;
  revealModel(false);
  resize();
  void load('standard');
}

function createEmissiveGlow(renderer, model) {
  const meshes = [];
  const sourceMaterials = new Set();
  model.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) sourceMaterials.add(material);
    meshes.push({ object, original: object.material, materials });
  });

  const isEmissive = (material) => material?.emissive
    && Math.max(material.emissive.r, material.emissive.g, material.emissive.b)
      * material.emissiveIntensity > 0.38;
  if (![...sourceMaterials].some(isEmissive)) return null;

  const maskMaterials = new Map();
  for (const source of sourceMaterials) {
    if (!source) continue;
    const emitting = isEmissive(source);
    // Preserve sidedness and alpha coverage for opaque surfaces in front of the emitters.
    const material = emitting ? source.clone() : new THREE.MeshBasicMaterial({
      color: 0x000000,
      map: source.alphaTest > 0 || source.transparent ? source.map ?? null : null,
      alphaMap: source.alphaMap ?? null,
      alphaTest: source.alphaTest,
      alphaHash: source.alphaHash,
      opacity: source.opacity,
      transparent: source.transparent,
      depthTest: source.depthTest,
      depthWrite: source.depthWrite,
      side: source.side,
      polygonOffset: source.polygonOffset,
      polygonOffsetFactor: source.polygonOffsetFactor,
      polygonOffsetUnits: source.polygonOffsetUnits,
    });
    material.toneMapped = false;
    if (emitting) {
      const anchor = '#include <emissivemap_fragment>';
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(anchor, `${anchor}
          // Use linear emissive radiance, before lighting and tone mapping.
          float peak = max(max(totalEmissiveRadiance.r, totalEmissiveRadiance.g), totalEmissiveRadiance.b);
          vec3 hue = pow(max(totalEmissiveRadiance, 0.0) / max(peak, 0.0001), vec3(0.66));
          gl_FragColor = vec4(hue * smoothstep(0.31, 2.02, peak), diffuseColor.a);
          return;
        `);
      };
    }
    maskMaterials.set(source, material);
  }
  for (const mesh of meshes) {
    const mapped = mesh.materials.map((material) => maskMaterials.get(material));
    mesh.mask = Array.isArray(mesh.original) ? mapped : mapped[0];
  }

  const screen = new THREE.Scene();
  const screenCamera = new THREE.Camera();
  const quad = new THREE.PlaneGeometry(2, 2);
  const blur = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { inputMap: { value: null }, stepUV: { value: new THREE.Vector2() } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D inputMap;
      uniform vec2 stepUV;
      varying vec2 vUv;
      void main() {
        vec3 glow = texture2D(inputMap, vUv).rgb * 0.227027;
        glow += (texture2D(inputMap, vUv + 1.384615 * stepUV).rgb
               + texture2D(inputMap, vUv - 1.384615 * stepUV).rgb) * 0.316216;
        glow += (texture2D(inputMap, vUv + 3.230769 * stepUV).rgb
               + texture2D(inputMap, vUv - 3.230769 * stepUV).rgb) * 0.070270;
        gl_FragColor = vec4(glow, 1.0);
      }
    `,
  });
  const composite = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: { inputMap: { value: null } },
    vertexShader: blur.vertexShader,
    fragmentShader: `
      uniform sampler2D inputMap;
      varying vec2 vUv;
      void main() {
        vec3 glow = texture2D(inputMap, vUv).rgb * 0.34;
        gl_FragColor = vec4(glow, max(max(glow.r, glow.g), glow.b));
      }
    `,
  });
  const screenMesh = new THREE.Mesh(quad, blur);
  screenMesh.frustumCulled = false;
  screen.add(screenMesh);
  let maskTarget;
  let blurTarget;

  function resetBuffers() {
    maskTarget?.dispose();
    blurTarget?.dispose();
    maskTarget = null;
    blurTarget = null;
  }

  function render(scene, camera, size) {
    const scale = Math.min(0.45, 576 / Math.max(size.x, size.y));
    const width = Math.max(1, Math.round(size.x * scale));
    const height = Math.max(1, Math.round(size.y * scale));
    if (!maskTarget) {
      maskTarget = new THREE.WebGLRenderTarget(width, height);
      blurTarget = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false });
    } else {
      maskTarget.setSize(width, height);
      blurTarget.setSize(width, height);
    }

    const autoClear = renderer.autoClear;
    try {
      for (const mesh of meshes) mesh.object.material = mesh.mask;
      renderer.setRenderTarget(maskTarget);
      renderer.render(scene, camera);
      for (const mesh of meshes) mesh.object.material = mesh.original;

      screenMesh.material = blur;
      blur.uniforms.inputMap.value = maskTarget.texture;
      blur.uniforms.stepUV.value.set(1 / width, 0);
      renderer.setRenderTarget(blurTarget);
      renderer.render(screen, screenCamera);

      blur.uniforms.inputMap.value = blurTarget.texture;
      blur.uniforms.stepUV.value.set(0, 1 / height);
      renderer.setRenderTarget(maskTarget);
      renderer.render(screen, screenCamera);

      screenMesh.material = composite;
      composite.uniforms.inputMap.value = maskTarget.texture;
      renderer.setRenderTarget(null);
      renderer.autoClear = false;
      renderer.render(screen, screenCamera);
    } finally {
      for (const mesh of meshes) mesh.object.material = mesh.original;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(null);
    }
  }

  return {
    render,
    resetBuffers,
    dispose() {
      resetBuffers();
      for (const material of maskMaterials.values()) material.dispose();
      quad.dispose();
      blur.dispose();
      composite.dispose();
    },
  };
}
