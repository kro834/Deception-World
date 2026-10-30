import * as THREE from "three";
import type { RexonanceGlint } from "./contract.ts";

export type GlintAnchor = RexonanceGlint & {
  node: THREE.Object3D;
  /** Which way the jewel under the star faces, in the anchor node's frame. */
  normal?: THREE.Vector3;
};

/** The facing of every glint: the mean normal of the surface around it (its jewel first,
 * then whatever it sits on), so a star on the chest fades as the suit turns side-on instead
 * of floating beside the silhouette. Measured once, in each mesh's own frame. */
export function estimateGlintNormals(
  anchors: GlintAnchor[],
  jewels: THREE.Mesh[],
  surfaces: THREE.Mesh[],
  axis: THREE.Vector3,
) {
  const world = new THREE.Vector3();
  const local = new THREE.Vector3();
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const sum = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const inverse = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const gather = (meshes: THREE.Mesh[], radius: number) => {
    sum.set(0, 0, 0);
    for (const mesh of meshes) {
      const geometry = mesh.geometry as THREE.BufferGeometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      inverse.copy(mesh.matrixWorld).invert();
      local.copy(world).applyMatrix4(inverse);
      mesh.matrixWorld.decompose(point, new THREE.Quaternion(), scale);
      const reach = radius / Math.max(1e-6, Math.max(scale.x, scale.y, scale.z));
      if (geometry.boundingBox!.distanceToPoint(local) > reach) continue;
      const position = geometry.getAttribute("position");
      const normals = geometry.getAttribute("normal");
      if (!normals) continue;
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        const d = point.distanceTo(local);
        if (d > reach) continue;
        normal.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
        sum.addScaledVector(normal, 1 - d / reach);
      }
    }
    return sum.lengthSq() > 1e-6;
  };
  const turn = new THREE.Quaternion();
  for (const anchor of anchors) {
    anchor.node.getWorldPosition(world);
    const radius = Math.max(0.02, anchor.size * 1.2);
    // Thin double-sided crystal plates cancel out; then the surface under them decides.
    if (!gather(jewels, radius) && !gather(surfaces, radius * 1.5)) {
      sum.set(world.x - axis.x, 0, world.z - axis.z);
      if (sum.lengthSq() < 1e-8) sum.set(0, 0, 1);
    }
    sum.normalize();
    anchor.node.getWorldQuaternion(turn).invert();
    anchor.normal = sum.clone().applyQuaternion(turn);
  }
}

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
  const facings = new Float32Array(count * 12);
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
  geometry.setAttribute("rxFacing", new THREE.BufferAttribute(facings, 3));
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
attribute vec3 rxFacing;
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
  // A jewel turned away from the camera does not flash.
  float facing = dot( normalize( rxFacing ), normalize( cameraPosition - position ) );
  twinkle *= smoothstep( -0.05, 0.5, facing );
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
  vec3 color = tint * ( arms * 0.7 + diag * 0.45 + halo ) + vec3( 1.0 ) * core * 0.75;
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
  const facingAttribute = geometry.getAttribute("rxFacing") as THREE.BufferAttribute;
  const turn = new THREE.Quaternion();
  const facing = new THREE.Vector3();
  return {
    mesh,
    count,
    /** Follow the anchors (some ride on moving pivots) and advance the twinkle. */
    update(time: number, motion: number) {
      uniforms.uTime.value = time;
      uniforms.uMotion.value = motion;
      anchors.forEach((anchor, i) => {
        anchor.node.getWorldPosition(world);
        facing.copy(anchor.normal ?? new THREE.Vector3(0, 0, 1));
        facing.applyQuaternion(anchor.node.getWorldQuaternion(turn));
        for (let corner = 0; corner < 4; corner++) {
          positions.set([world.x, world.y, world.z], i * 12 + corner * 3);
          facings.set([facing.x, facing.y, facing.z], i * 12 + corner * 3);
        }
      });
      positionAttribute.needsUpdate = true;
      facingAttribute.needsUpdate = true;
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
