import * as THREE from "three";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";

/** The photo studio the suit is lit in, baked once with PMREM: a black room, a large warm
 * key box above the front left, a cooler fill, an overhead strip, two tall strip boxes
 * behind each shoulder (the long highlights that run down black lacquer), a blue rim panel
 * behind the left and a pink one behind the right, and a dim floor bounce so gold
 * undersides are never dead. The figure faces +Z. */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(40, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec3 vDir;
void main() { vDir = normalize( position ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */ `varying vec3 vDir;
void main() {
  float up = vDir.y;
  vec3 c = mix( vec3( 0.012, 0.013, 0.02 ), vec3( 0.03, 0.03, 0.042 ), smoothstep( -0.1, 0.8, up ) );
  c = mix( c, vec3( 0.016, 0.012, 0.012 ), smoothstep( -0.05, -0.6, up ) );
  gl_FragColor = vec4( c, 1.0 );
}`,
    }),
  );
  scene.add(room);
  const panel = (
    color: THREE.ColorRepresentation,
    intensity: number,
    position: [number, number, number],
    size: [number, number],
    soft = false,
  ) => {
    const material = soft
      ? new THREE.ShaderMaterial({
          side: THREE.DoubleSide,
          uniforms: { tint: { value: new THREE.Color(color).multiplyScalar(intensity) } },
          vertexShader: /* glsl */ `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
          // A softbox: bright centre, a soft edge (reflections show a glowing panel, not a cut).
          fragmentShader: /* glsl */ `uniform vec3 tint; varying vec2 vUv;
void main() {
  vec2 d = abs( vUv - 0.5 ) * 2.0;
  float k = ( 1.0 - smoothstep( 0.55, 1.0, d.x ) ) * ( 1.0 - smoothstep( 0.55, 1.0, d.y ) );
  gl_FragColor = vec4( tint * ( 0.35 + 0.65 * k ), 1.0 );
}`,
        })
      : new THREE.MeshBasicMaterial({
          color: new THREE.Color(color).multiplyScalar(intensity),
          side: THREE.DoubleSide,
        });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), material);
    mesh.position.set(...position);
    mesh.lookAt(0, 1, 0);
    scene.add(mesh);
  };
  panel(0xfff3e6, 7, [-7, 9, 9], [8, 5], true); // key, above front left
  panel(0xe8f0ff, 2.4, [9, 4, 8], [5, 7], true); // fill, front right
  panel(0xffffff, 5, [0, 14, 1], [14, 1.6]); // overhead strip
  panel(0xf4f6ff, 6, [-8, 5, -3], [1.1, 12]); // strip behind the left shoulder
  panel(0xf4f6ff, 6, [8, 5, -3], [1.1, 12]); // strip behind the right shoulder
  panel(0x4a7dff, 4.2, [-9, 3, -9], [7, 9], true); // blue rim, behind left
  panel(0xff4fb4, 3.6, [9, 3, -9], [7, 9], true); // pink rim, behind right
  panel(0x3b2a26, 1, [0, -12, 0], [26, 26]); // floor bounce
  // Small hard sources for the glints on gold and jewels.
  for (const [x, y, z, k] of [
    [3, 11, 10, 22],
    [-12, 2, 6, 14],
    [6, -2, 12, 9],
  ] as const) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(k) }),
    );
    bulb.position.set(x, y, z);
    scene.add(bulb);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.02);
  generator.dispose();
  scene.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      (node.material as THREE.Material).dispose();
    }
  });
  return target;
}

/** The dark stage behind the figure, in screen space (it never swings with the orbit): deep
 * navy above, a violet haze behind the figure, near black toward the floor. Drawn first, at
 * the far plane. */
export function createBackdrop() {
  const uniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCenter: { value: new THREE.Vector2(0.5, 0.52) },
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `void main() { gl_Position = vec4( position.xy, 1.0, 1.0 ); }`,
      fragmentShader: /* glsl */ `uniform vec2 uResolution; uniform vec2 uCenter;
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 d = ( uv - uCenter ) * vec2( uResolution.x / uResolution.y, 1.0 );
  vec3 top = vec3( 0.0045, 0.0055, 0.016 );
  vec3 low = vec3( 0.0012, 0.0012, 0.0022 );
  vec3 c = mix( low, top, smoothstep( 0.05, 0.95, uv.y ) );
  float haze = exp( -dot( d * vec2( 1.3, 0.75 ), d * vec2( 1.3, 0.75 ) ) * 3.2 );
  c += vec3( 0.014, 0.010, 0.036 ) * haze;
  c += vec3( 0.006, 0.010, 0.026 ) * exp( -dot( d - vec2( -0.35, 0.25 ), d - vec2( -0.35, 0.25 ) ) * 5.0 );
  c += vec3( 0.014, 0.004, 0.014 ) * exp( -dot( d - vec2( 0.38, 0.18 ), d - vec2( 0.38, 0.18 ) ) * 6.0 );
  // Dither: the 8-bit output would band this dark ramp.
  c += ( hash( gl_FragCoord.xy ) - 0.5 ) * 0.0016;
  gl_FragColor = vec4( max( c, 0.0 ), 1.0 );
}`,
    }),
  );
  mesh.name = "RexonanceBackdrop";
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return {
    mesh,
    setSize(width: number, height: number) {
      uniforms.uResolution.value.set(width, height);
    },
    /** Where the figure sits on screen (0..1), so the haze stays behind it. */
    setCenter(x: number, y: number) {
      uniforms.uCenter.value.set(x, y);
    },
    dispose() {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    },
  };
}

/** A round stage under the feet: a dark disc that fades into the backdrop, two faint
 * holographic rings, and the contact shadow (the figure rendered from below into a small
 * depth-darkness target, blurred twice), baked when the model arrives. */
export function createStage(radius: number, shadowSize: number) {
  const group = new THREE.Group();
  group.name = "RexonanceStage";
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 96).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uRadius: { value: radius } },
      vertexShader: /* glsl */ `varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */ `uniform float uRadius; varying vec2 vP;
void main() {
  float r = length( vP ) / uRadius;
  float body = 1.0 - smoothstep( 0.15, 1.0, r );
  vec3 c = vec3( 0.006, 0.007, 0.014 ) * 1.4;
  float ring = exp( -pow( ( r - 0.62 ) / 0.006, 2.0 ) ) * 0.5 + exp( -pow( ( r - 0.78 ) / 0.004, 2.0 ) ) * 0.3;
  vec3 ringColor = mix( vec3( 0.2, 0.32, 1.0 ), vec3( 1.0, 0.3, 0.75 ), smoothstep( -0.6, 0.6, vP.x / uRadius ) );
  gl_FragColor = vec4( c + ringColor * ring * 0.22, body * 0.92 + ring * 0.4 );
}`,
    }),
  );
  disc.name = "RexonanceStageDisc";
  disc.renderOrder = 1;
  group.add(disc);

  const width = radius * 1.35;
  const depth = radius * 1.35;
  const height = 0.7;
  const target = new THREE.WebGLRenderTarget(shadowSize, shadowSize);
  target.texture.generateMipmaps = false;
  const blurTarget = new THREE.WebGLRenderTarget(shadowSize, shadowSize);
  blurTarget.texture.generateMipmaps = false;
  const planeGeometry = new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2);
  const shadow = new THREE.Mesh(
    planeGeometry,
    new THREE.MeshBasicMaterial({
      map: target.texture,
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
    }),
  );
  shadow.name = "RexonanceContactShadow";
  shadow.renderOrder = 2;
  shadow.position.y = 0.002;
  shadow.scale.y = -1;
  group.add(shadow);
  const blurPlane = new THREE.Mesh(planeGeometry);
  blurPlane.visible = false;
  group.add(blurPlane);
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, height);
  camera.rotation.x = Math.PI / 2;
  group.add(camera);
  const depthMaterial = new THREE.MeshDepthMaterial();
  depthMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
      "gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 2.2 ) * 1.25 );",
    );
  };
  // The surface nearest the floor wins (the camera looks up from it), so a sole is never
  // overwritten by a knee drawn after it.
  depthMaterial.side = THREE.DoubleSide;
  const horizontal = new THREE.ShaderMaterial(HorizontalBlurShader);
  horizontal.depthTest = false;
  const vertical = new THREE.ShaderMaterial(VerticalBlurShader);
  vertical.depthTest = false;

  const blur = (renderer: THREE.WebGLRenderer, amount: number) => {
    blurPlane.visible = true;
    blurPlane.material = horizontal;
    horizontal.uniforms.tDiffuse.value = target.texture;
    horizontal.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(blurTarget);
    renderer.render(blurPlane, camera);
    blurPlane.material = vertical;
    vertical.uniforms.tDiffuse.value = blurTarget.texture;
    vertical.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(target);
    renderer.render(blurPlane, camera);
    blurPlane.visible = false;
  };

  return {
    group,
    /** Render `figure` (already in `scene`) from below into the shadow texture. */
    bake(renderer: THREE.WebGLRenderer, scene: THREE.Scene, hide: THREE.Object3D[]) {
      const previousTarget = renderer.getRenderTarget();
      const previousOverride = scene.overrideMaterial;
      const previousBackground = scene.background;
      const previousClear = renderer.getClearAlpha();
      const visibility = hide.map((object) => object.visible);
      hide.forEach((object) => (object.visible = false));
      group.visible = false;
      scene.background = null;
      scene.overrideMaterial = depthMaterial;
      renderer.setClearAlpha(0);
      renderer.setRenderTarget(target);
      renderer.clear();
      group.updateMatrixWorld(true);
      renderer.render(scene, camera);
      scene.overrideMaterial = previousOverride;
      blur(renderer, 2.2);
      blur(renderer, 0.9);
      renderer.setRenderTarget(previousTarget);
      renderer.setClearAlpha(previousClear);
      scene.background = previousBackground;
      hide.forEach((object, index) => (object.visible = visibility[index]));
      group.visible = true;
    },
    dispose() {
      target.dispose();
      blurTarget.dispose();
      planeGeometry.dispose();
      disc.geometry.dispose();
      (disc.material as THREE.Material).dispose();
      (shadow.material as THREE.Material).dispose();
      depthMaterial.dispose();
      horizontal.dispose();
      vertical.dispose();
    },
  };
}

/** Direct lights on top of the environment: a warm key for crisp lacquer highlights, a cool
 * fill, and the blue and pink rims that edge the silhouette as in the sheet. */
export function createLightRig() {
  const rig = new THREE.Group();
  rig.name = "RexonanceLights";
  const key = new THREE.DirectionalLight(0xfff1e2, 1.8);
  key.position.set(-3, 6, 5);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.55);
  fill.position.set(5, 2, 4);
  const blue = new THREE.DirectionalLight(0x5b86ff, 1.9);
  blue.position.set(-5, 2.5, -4.5);
  const pink = new THREE.DirectionalLight(0xff63bd, 1.6);
  pink.position.set(5, 2.5, -4.5);
  const top = new THREE.DirectionalLight(0xffffff, 0.8);
  top.position.set(0, 10, 0.5);
  rig.add(key, fill, blue, pink, top);
  return rig;
}
