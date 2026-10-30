import * as THREE from "three";
import type { RexonanceGlint } from "./contract.ts";

export type GlintAnchor = RexonanceGlint & { node: THREE.Object3D };

/** Four-point star glints (the sheet's sparkle on every star jewel): one camera-facing quad
 * per RX_Glint_* anchor, drawn additively over the scene and depth tested, so a jewel on
 * the far side of the suit stays hidden. The star is pulled a little toward the camera so
 * the jewel it sits on does not swallow it. */
export function createGlints(anchors: GlintAnchor[]) {
  const count = anchors.length;
  const geometry = new THREE.BufferGeometry();
  const corners = new Float32Array(count * 8);
  const positions = new Float32Array(count * 12);
  const params = new Float32Array(count * 12);
  const index: number[] = [];
  anchors.forEach((anchor, i) => {
    corners.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
    // A golden-ratio walk spreads the twinkle phases.
    const phase = (i * 0.618034) % 1;
    for (let corner = 0; corner < 4; corner++)
      params.set([anchor.size, anchor.hue, phase], i * 12 + corner * 3);
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("rxCorner", new THREE.BufferAttribute(corners, 2));
  geometry.setAttribute("rxParams", new THREE.BufferAttribute(params, 3));
  geometry.setIndex(index);
  const uniforms = {
    uTime: { value: 0 },
    uMotion: { value: 1 },
    uStrength: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
attribute vec2 rxCorner;
attribute vec3 rxParams;
uniform float uTime;
uniform float uMotion;
varying vec2 vCorner;
varying float vHue;
varying float vLight;
void main() {
  float size = rxParams.x;
  float phase = rxParams.z;
  float speed = 1.1 + fract( phase * 7.31 ) * 1.3;
  float wave = 0.5 + 0.5 * sin( uTime * speed + phase * 6.2832 );
  float twinkle = mix( 0.78, 0.35 + 0.9 * wave * wave, uMotion );
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  mv.xyz += normalize( -mv.xyz ) * size * 1.2;
  float angle = phase * 1.2 + uMotion * 0.18 * sin( uTime * 0.37 + phase * 9.0 );
  mat2 turn = mat2( cos( angle ), sin( angle ), -sin( angle ), cos( angle ) );
  mv.xy += turn * rxCorner * size * ( 1.5 + 0.5 * twinkle );
  gl_Position = projectionMatrix * mv;
  vCorner = rxCorner;
  vHue = rxParams.y;
  vLight = twinkle;
}`,
    fragmentShader: /* glsl */ `
uniform float uStrength;
varying vec2 vCorner;
varying float vHue;
varying float vLight;
void main() {
  vec2 p = vCorner;
  float ax = abs( p.x );
  float ay = abs( p.y );
  float r = length( p );
  // Two long arms, two short diagonal ones, a hot core and a soft halo.
  float arms = exp( -ay * ay * 140.0 ) * pow( max( 0.0, 1.0 - ax ), 1.6 )
    + exp( -ax * ax * 140.0 ) * pow( max( 0.0, 1.0 - ay ), 1.6 );
  vec2 q = vec2( ax + ay, abs( ax - ay ) ) * 0.70710678;
  float diag = exp( -q.y * q.y * 220.0 ) * pow( max( 0.0, 1.0 - q.x * 1.9 ), 2.0 ) * 0.45;
  float core = exp( -r * r * 90.0 );
  float halo = exp( -r * r * 14.0 ) * 0.1;
  vec3 tint = mix( vec3( 0.55, 0.8, 1.0 ), vec3( 1.0, 0.48, 0.86 ), vHue );
  vec3 color = tint * ( arms * 0.8 + diag * 0.55 + halo ) + vec3( 1.0 ) * core * 0.9;
  float fade = 1.0 - smoothstep( 0.75, 1.0, r );
  gl_FragColor = vec4( color * vLight * uStrength * fade, 1.0 );
}`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "RexonanceGlints";
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  const world = new THREE.Vector3();
  const positionAttribute = geometry.getAttribute("position") as THREE.BufferAttribute;
  return {
    mesh,
    count,
    /** Follow the anchors (some ride on moving pivots) and advance the twinkle. */
    update(time: number, motion: number) {
      uniforms.uTime.value = time;
      uniforms.uMotion.value = motion;
      anchors.forEach((anchor, i) => {
        anchor.node.getWorldPosition(world);
        for (let corner = 0; corner < 4; corner++)
          positions.set([world.x, world.y, world.z], i * 12 + corner * 3);
      });
      positionAttribute.needsUpdate = true;
    },
    setStrength(value: number) {
      uniforms.uStrength.value = value;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
