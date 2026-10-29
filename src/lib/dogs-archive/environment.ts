import * as THREE from "three";

/** The paintings' space: a dark ink sky, a bank of pale green fire below and behind the
 * creature, one soft mint key above and in front. Baked once with PMREM so bone picks up
 * green reflections and membranes a faint fire glow from below. */
export function createInkEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 vDir;
void main(){
 float up=vDir.y;
 vec3 top=vec3(.040,.056,.048),horizon=vec3(.022,.046,.032),below=vec3(.06,.30,.11);
 vec3 c=mix(horizon,top,smoothstep(0.,.7,up));
 c=mix(c,below,smoothstep(.05,-.75,up));
 float back=smoothstep(.25,-.9,vDir.z)*smoothstep(.35,-.45,up);
 c+=vec3(.10,.46,.18)*back;
 float frontFloor=smoothstep(-.2,.9,vDir.z)*smoothstep(.1,-.6,up);
 c+=vec3(.05,.22,.09)*frontFloor;
 gl_FragColor=vec4(c,1.);
}`,
    }),
  );
  scene.add(sky);
  const bulb = (
    color: number,
    intensity: number,
    position: [number, number, number],
    radius: number,
  ) => {
    const material = new THREE.MeshBasicMaterial({ color });
    material.color.multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 8), material);
    mesh.position.set(...position);
    scene.add(mesh);
  };
  bulb(0xdcf2e0, 2.6, [16, 40, 30], 9); // soft pale key, above and in front
  bulb(0x3ee07c, 2.2, [-34, -4, -38], 16); // the fire bank behind and left
  bulb(0x2fc468, 1.5, [36, 6, -30], 12); // second rim behind and right
  bulb(0x1f9a4c, 1.3, [0, -46, 14], 22); // glow from the fire below
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.035);
  generator.dispose();
  scene.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      (node.material as THREE.Material).dispose();
    }
  });
  return target;
}
