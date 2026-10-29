import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/addons/postprocessing/Pass.js";

export type VolumeDepthUniforms = {
  uDepth: { value: THREE.Texture | null };
  uResolution: { value: THREE.Vector2 };
  uNear: { value: number };
  uFar: { value: number };
  uForward: { value: THREE.Vector3 };
};

/** Renders the breath volume at reduced resolution against the scene's depth, then composites
 * it over the scene (premultiplied). The ray-march stops at the creature's surface, so the jet
 * wraps the body instead of fogging it, and phones march a quarter of the pixels. */
export class GuardianVolumePass extends Pass {
  readonly target: THREE.WebGLRenderTarget;
  /** The depth texture holding this frame's scene depth, for later passes. */
  sceneDepth: THREE.Texture | null = null;
  private readonly quad: FullScreenQuad;
  private readonly composite: THREE.ShaderMaterial;
  private readonly clearColor = new THREE.Color();
  private readonly volumeScene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly uniforms: VolumeDepthUniforms;
  private readonly scale: number;

  constructor(
    volumeScene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    uniforms: VolumeDepthUniforms,
    scale: number,
  ) {
    super();
    this.volumeScene = volumeScene;
    this.camera = camera;
    this.uniforms = uniforms;
    this.scale = scale;
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this.target.texture.name = "GuardianBreathVolume";
    this.composite = new THREE.ShaderMaterial({
      uniforms: { tVolume: { value: this.target.texture } },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader: `uniform sampler2D tVolume;varying vec2 vUv;void main(){gl_FragColor=texture2D(tVolume,vUv);}`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.quad = new FullScreenQuad(this.composite);
  }

  setSize(width: number, height: number) {
    const w = Math.max(1, Math.ceil(width * this.scale)),
      h = Math.max(1, Math.ceil(height * this.scale));
    this.target.setSize(w, h);
    this.uniforms.uResolution.value.set(w, h);
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: unknown, readBuffer: THREE.WebGLRenderTarget) {
    const depth = readBuffer.depthTexture;
    this.sceneDepth = depth;
    if (!depth || !this.volumeScene.children.some((child) => child.visible)) return;
    this.uniforms.uDepth.value = depth;
    this.uniforms.uNear.value = this.camera.near;
    this.uniforms.uFar.value = this.camera.far;
    this.camera.getWorldDirection(this.uniforms.uForward.value);
    const previousAutoClear = renderer.autoClear;
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    renderer.render(this.volumeScene, this.camera);
    renderer.setRenderTarget(readBuffer);
    renderer.autoClear = false;
    this.quad.render(renderer);
    renderer.autoClear = previousAutoClear;
    renderer.setClearColor(this.clearColor, previousAlpha);
  }

  dispose() {
    this.target.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}
