// Cast shadows: a depth map of the figure as the key light sees it.
//
// The key light is fixed to the camera (upper left, in front), so it turns around the figure with
// the camera and the map is redrawn whenever the camera moves. It is an orthographic depth-only
// pass fitted to the figure's bounding sphere; the material compares its own depth along the light
// with the map to find what another part of the figure hides from the light.
import * as THREE from 'three';

export function createShadowMap({ renderer, size }) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 4);
  // Depth only. Both faces, because much of the figure is single thin sheets (drapes, feathers).
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  const matrix = new THREE.Matrix4(); // main camera's view space -> shadow map (xy = uv, z = depth), all 0..1
  const toTexture = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const towardsLight = new THREE.Vector3();
  let target = null;
  let depthRange = 1;

  function allocate() {
    // DepthTexture defaults: 24-bit depth, nearest filtering, no comparison mode. The material reads
    // it as an ordinary texture and does its own filtering.
    const depthTexture = new THREE.DepthTexture(size, size);
    target = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      depthTexture,
      stencilBuffer: false,
      generateMipmaps: false,
    });
  }

  // Draw the map. `keyDirView` points towards the light in the main camera's view space; `sphere`
  // bounds the figure in world space. Returns false when the target cannot be used.
  function render(scene, viewCamera, sphere, keyDirView) {
    if (!target) allocate();
    const radius = sphere.radius * 1.02;
    towardsLight.copy(keyDirView).transformDirection(viewCamera.matrixWorld);
    camera.left = -radius;
    camera.right = radius;
    camera.top = radius;
    camera.bottom = -radius;
    camera.near = 0.001;
    camera.far = radius * 4;
    depthRange = camera.far - camera.near;
    camera.position.copy(sphere.center).addScaledVector(towardsLight, radius * 2);
    camera.up.set(0, 1, 0).transformDirection(viewCamera.matrixWorld);
    camera.lookAt(sphere.center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const gl = renderer.getContext();
    const previous = scene.overrideMaterial;
    renderer.setRenderTarget(target);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      renderer.setRenderTarget(null);
      return false;
    }
    scene.overrideMaterial = depthOnly;
    try {
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
    } finally {
      scene.overrideMaterial = previous;
      renderer.setRenderTarget(null);
    }
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(viewCamera.matrixWorld).premultiply(toTexture);
    return true;
  }

  return {
    render,
    matrix,
    size,
    get texture() { return target ? target.depthTexture : null; },
    // A length in world units as a difference of map depth.
    depthOf(length) { return length / depthRange; },
    reset() {
      if (!target) return;
      target.depthTexture.dispose();
      target.dispose();
      target = null;
    },
    dispose() {
      this.reset();
      depthOnly.dispose();
    },
  };
}
