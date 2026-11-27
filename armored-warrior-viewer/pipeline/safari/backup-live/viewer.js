import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.mjs';
import { createLook } from './look/look.js';

// Poster stills shown before / instead of the 3D canvas: `${folder}/${view}.webp`, framed exactly like
// the matching 3D view. Square stills by default; on a clearly portrait stage the portrait set is
// used (`ratio` = its width / height) so the figure does not change size when the canvas takes over.
const POSTERS = { folder: 'previews-v15', portrait: { folder: 'previews-v15p', ratio: 0.625, below: 0.85 } };
const MODELS = { folder: 'model-v10', standard: 'standard-v14.glb', detail: 'detail-v14.gltf' };

const root = document.documentElement;
const stage = document.querySelector('#stage');
const poster = document.querySelector('#poster');
const status = document.querySelector('#status');
const quality = document.querySelector('#quality');
const reset = document.querySelector('#reset');
const progress = document.querySelector('#progress');
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

// Page-facing state: html[data-viewer] = loading | ready | error | lost, html[data-mode], --load-progress.
function setState(state) {
  root.dataset.viewer = state;
}

// `--load-progress` runs 0 -> 1 during a download and stays at 1 once the model is in (it is removed
// if the download fails); the optional #progress element shows the percentage only while loading.
function setProgress(value) {
  if (value === null) {
    stage.style.removeProperty('--load-progress');
    if (progress) progress.textContent = '';
    return;
  }
  const clamped = Math.min(1, Math.max(0, value));
  stage.style.setProperty('--load-progress', clamped.toFixed(3));
  if (progress) progress.textContent = `${Math.round(clamped * 100)}%`;
}

// A preset button is pressed only while the camera sits on that preset. Once the user drags, zooms
// or pans (or a test moves the camera) no button is pressed, and the page can call it a free view.
let onPreset = true;
function showPreset(on) {
  onPreset = on;
  for (const button of viewButtons) {
    button.setAttribute('aria-pressed', String(on && button.dataset.view === view));
  }
}

function setView(key) {
  view = key;
  showPreset(true);
  updatePoster();
  fitView?.();
}

// Pick the square or the portrait still for the current stage shape. A missing portrait file turns
// the portrait set off for good, so the square still shows instead of a broken image.
let portraitPosters = !!POSTERS.portrait;
function updatePoster() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const portrait = portraitPosters && height > 0 && width / height < POSTERS.portrait.below;
  const folder = portrait ? POSTERS.portrait.folder : POSTERS.folder;
  const url = new URL(`./${folder}/${view}.webp`, import.meta.url).href;
  if (poster.src !== url) poster.src = url;
  poster.alt = `装甲戦士の${views[view].name}プレビュー`;
  poster.style.setProperty('--poster-ratio', String(portrait ? POSTERS.portrait.ratio : 1));
}
poster.addEventListener('error', () => {
  if (!portraitPosters || !poster.src.includes(`/${POSTERS.portrait.folder}/`)) return;
  portraitPosters = false;
  updatePoster();
});
if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (!poster.hidden) updatePoster(); }).observe(stage);
updatePoster();

for (const button of viewButtons) {
  button.addEventListener('click', () => setView(button.dataset.view));
}
reset.addEventListener('click', () => setView('front'));

// Poster capture: ?capture=720 (square) or ?capture=450x720 (width x height) pins the stage to that
// many CSS pixels in the top-left corner and hides everything in it but the canvas, so a screenshot
// of #stage is a clean, repeatable frame with exactly the 3D framing of that stage shape.
const capture = /^(\d{2,4})(?:x(\d{2,4}))?$/.exec(new URLSearchParams(location.search).get('capture') || '');
if (capture) {
  const style = document.createElement('style');
  style.textContent = `#stage{position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;`
    + `width:${capture[1]}px!important;height:${capture[2] || capture[1]}px!important;min-height:0!important;margin:0!important;border:0!important;`
    + `border-radius:0!important;z-index:2147483647!important;pointer-events:none!important}`
    + `#stage>:not(canvas){display:none!important}#stage canvas{animation:none!important;opacity:1!important}`;
  document.head.append(style);
}

setState('loading');
root.dataset.mode = 'standard';
try {
  startViewer();
} catch (error) {
  console.error(error);
  setState('error');
  showStatus('このブラウザでは3Dを表示できません。画像で各方向を確認できます。');
}

function startViewer() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute('aria-label', '装甲戦士の3Dモデル');
  renderer.domElement.setAttribute('aria-describedby', 'hint');
  renderer.domElement.hidden = true;
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.005, 50);
  const look = createLook({ renderer, camera });
  const settings = look.settings;
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.zoomToCursor = true;
  controls.listenToKeyEvents(renderer.domElement);

  const manager = new THREE.LoadingManager();
  const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let model = null;
  let bounds = null;
  let mode = 'standard';
  let loading = false;
  let contextLost = false;

  // ---- render on demand ----------------------------------------------------------------------
  // While the camera moves: the cheap frame (no brush pass). Once it rests: the full frame, with the
  // brush pass faded in. Programmatic jumps (view buttons, load, resize end) draw the full frame at once.
  let frameId = 0;
  let settleTimer = 0;
  let fade = null;
  let pendingFull = false;
  const waiters = [];

  const busy = () => frameId !== 0 || settleTimer !== 0 || fade !== null || loading || !model;
  function flushWaiters() {
    if (busy()) return;
    for (const resolve of waiters.splice(0)) resolve();
  }

  function cancelPending() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    clearTimeout(settleTimer);
    settleTimer = 0;
    fade = null;
  }

  function renderFull() {
    cancelPending();
    if (contextLost || !model) return;
    look.render(scene, { full: true, paint: 1 });
    flushWaiters();
  }

  function fadeStep(now) {
    frameId = 0;
    if (!fade || contextLost) { fade = null; flushWaiters(); return; }
    const t = Math.min(1, (now - fade.start) / fade.duration);
    look.composite(t * t * (3 - 2 * t));
    if (t < 1) frameId = requestAnimationFrame(fadeStep);
    else { fade = null; flushWaiters(); }
  }

  function settle() {
    settleTimer = 0;
    if (contextLost || !model) return;
    if (!look.paintable || matchMedia('(prefers-reduced-motion: reduce)').matches) { renderFull(); return; }
    look.render(scene, { full: true, paint: 0 });
    fade = { start: performance.now(), duration: settings.paint.fadeMs };
    frameId = requestAnimationFrame(fadeStep);
  }

  function renderFast() {
    frameId = 0;
    if (contextLost || !model) return;
    if (pendingFull) { pendingFull = false; renderFull(); return; }
    look.render(scene, { full: false, paint: 0 });
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, settings.paint.settleMs);
  }

  function requestRender(full = false) {
    if (contextLost) return;
    pendingFull = pendingFull || full;
    fade = null;
    clearTimeout(settleTimer);
    settleTimer = 0;
    if (!frameId) frameId = requestAnimationFrame(renderFast);
  }

  // `framing` is true while this code places the camera itself; any other change comes from the user.
  let framing = false;
  controls.addEventListener('change', () => {
    if (!framing && onPreset) showPreset(false);
    requestRender(false);
  });

  // ---- framing (unchanged maths) -------------------------------------------------------------
  function frame(directionArray, focus, immediate = true) {
    const center = bounds.getCenter(new THREE.Vector3());
    const extent = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    if (focus) {
      const [targetY, targetZ, halfWidth, halfHeight] = focus;
      const height = extent.y * 2;
      center.y = bounds.min.y + height * targetY;
      center.z += height * targetZ;
      extent.set(height * halfWidth, height * halfHeight, height * 0.065);
    }
    const radius = extent.length();
    const direction = new THREE.Vector3(...directionArray).normalize();
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
          const fit = Math.max(Math.abs(corner.dot(right)) / horizontal, Math.abs(corner.dot(up)) / vertical);
          distance = Math.max(distance, corner.dot(direction) + 1.12 * fit);
        }
      }
    }
    controls.minDistance = radius * 0.2;
    controls.maxDistance = Math.max(distance * 6, radius * 8);
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    framing = true;
    controls.update();
    framing = false;
    if (immediate) renderFull();
    else requestRender(false);
  }

  fitView = (immediate = true) => {
    if (!bounds) return;
    frame(views[view].direction, views[view].focus, immediate);
    showPreset(true);
  };

  function resize() {
    const width = Math.max(stage.clientWidth, 1);
    const height = Math.max(stage.clientHeight, 1);
    const previous = camera.aspect;
    camera.aspect = width / height;
    const budget = coarse ? settings.pixels.mobile : settings.pixels.desktop;
    const wanted = coarse ? (devicePixelRatio || 1) : Math.max(devicePixelRatio || 1, settings.pixels.desktopMinRatio);
    const pixelRatio = Math.min(wanted, settings.pixels.maxRatio, Math.sqrt(budget / (width * height)));
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    look.setSize(width, height, pixelRatio);
    camera.updateProjectionMatrix();
    // While the window is being resized: cheap frames, then one full frame when it rests.
    if (bounds && Math.abs(previous - camera.aspect) > 0.01) fitView(false);
    else requestRender(false);
  }

  function revealModel(visible) {
    renderer.domElement.style.visibility = visible ? 'visible' : 'hidden';
    poster.hidden = visible;
    if (!visible) updatePoster();
    controls.enabled = visible;
    reset.disabled = !visible;
  }

  // Download with real progress: bytes of the main file, then the files the glTF references.
  async function download(url, signal, share) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Model request failed (${response.status})`);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !total) return response.arrayBuffer();
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      setProgress(share * Math.min(1, received / total));
    }
    const data = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    return data.buffer;
  }

  async function load(nextMode) {
    if (loading || contextLost) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    let succeeded = false;
    loading = true;
    quality.disabled = true;
    setState('loading');
    setProgress(0);
    stage.setAttribute('aria-busy', 'true');
    showStatus(nextMode === 'detail' ? '高精細モデルを読み込み中' : '3Dモデルを読み込み中');
    try {
      const url = new URL(`./${MODELS.folder}/${MODELS[nextMode]}`, import.meta.url);
      // The .glb carries everything; the .gltf is small and pulls its buffer and textures afterwards.
      const share = nextMode === 'detail' ? 0.04 : 0.9;
      manager.onProgress = (item, loaded, total) => setProgress(share + (0.97 - share) * (loaded / Math.max(total, 1)));
      const data = await download(url, controller.signal, share);
      const asset = await loader.parseAsync(data, new URL('./', url).href);
      const nextBounds = new THREE.Box3().setFromObject(asset.scene);
      if (!Number.isFinite(nextBounds.getSize(new THREE.Vector3()).length()) || nextBounds.isEmpty()) {
        look.disposeModel(asset.scene);
        throw new Error('Model geometry has no valid bounds');
      }
      await look.prepareModel(asset.scene, { mode: nextMode });
      if (model) {
        scene.remove(model);
        look.disposeModel(model);
      }
      model = asset.scene;
      bounds = nextBounds;
      mode = nextMode;
      root.dataset.mode = mode;
      look.setBounds(bounds);
      scene.add(model);
      setProgress(1);
      succeeded = true;
      loading = false;
      if (!contextLost) {
        fitView();
        revealModel(true);
        showStatus();
        setState('ready');
      }
    } catch (error) {
      console.error(error);
      if (!contextLost) {
        showStatus(model ? '切替に失敗しました。現在のモデルを表示しています。' : '3Dを読み込めませんでした。画像で確認するか、再試行できます。');
        setState(model ? 'ready' : 'error');
      }
    } finally {
      clearTimeout(timeout);
      manager.onProgress = undefined;
      loading = false;
      if (!succeeded) setProgress(null);
      else if (progress) progress.textContent = '';
      stage.removeAttribute('aria-busy');
      quality.disabled = contextLost;
      quality.textContent = model ? (mode === 'detail' ? '標準に切替' : '高精細に切替') : '3D表示を再試行';
      quality.setAttribute('aria-pressed', String(mode === 'detail'));
      flushWaiters();
    }
  }

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    cancelPending();
    quality.disabled = true;
    revealModel(false);
    setState('lost');
    showStatus('3D表示を復旧中。各方向の画像を確認できます。');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    look.onContextRestored();
    quality.disabled = loading;
    revealModel(!!model);
    showStatus(model ? '' : '3D表示を再試行できます。');
    setState(model ? 'ready' : loading ? 'loading' : 'error');
    requestRender(true);
  });
  quality.addEventListener('click', () => void load(model && mode === 'standard' ? 'detail' : 'standard'));
  new ResizeObserver(resize).observe(stage);
  renderer.domElement.hidden = false;
  revealModel(false);
  resize();
  void load('standard');

  // ---- test hooks (used by the screenshot harness and for poster capture) -------------------
  window.__viewer = {
    // Resolves once the full-quality frame for the current camera is on screen and CSS has stopped
    // animating the canvas.
    async whenSettled() {
      if (busy()) await new Promise((resolve) => waiters.push(resolve));
      await Promise.allSettled(renderer.domElement.getAnimations().map((animation) => animation.finished));
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    },
    // Camera on the fitted full-body orbit. Azimuth about +Y from +Z towards +X (0 front, 90 side,
    // 180 rear); polar from +Y. Optional extras for close studies: zoom (2 = twice as close) and
    // height (0 feet .. 1 top of the figure) of the point looked at.
    setOrbit(azimuthDeg, polarDeg = 82, zoom = 1, height = null) {
      if (!bounds) return;
      const azimuth = THREE.MathUtils.degToRad(azimuthDeg);
      const polar = THREE.MathUtils.degToRad(polarDeg);
      frame([Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)], null, false);
      const offset = camera.position.clone().sub(controls.target).divideScalar(Math.max(zoom, 0.05));
      if (height !== null) controls.target.y = bounds.min.y + (bounds.max.y - bounds.min.y) * height;
      camera.position.copy(controls.target).add(offset);
      framing = true;
      controls.update();
      framing = false;
      showPreset(false);
      renderFull();
    },
    state() {
      return { mode, view, free: !onPreset, viewer: root.dataset.viewer, pixelRatio: renderer.getPixelRatio(), coarse, ...look.state() };
    },
  };
}
