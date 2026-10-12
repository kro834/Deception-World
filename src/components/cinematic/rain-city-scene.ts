// A real, deterministic 3D street, not a zoomed background. The opening owns
// the clock and all lifetime management; this renderer never starts its own RAF.
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export const CITY_FLIGHT = { enter: 0.12, clear: 0.48, exit: 4.9, end: 5.6, length: 246 } as const;
export const CITY_IMPACTS = [104, 170] as const;
// Heading is integrated by distance, not time. This keeps actual forward speed
// increasing even through the two bends, with no teleport or sideways camera slide.
const headingAt = (s: number) => 1.13 * smooth(44, 88, s) - 0.94 * smooth(130, 179, s);
const route = [{ x: 0, z: 18 }];
for (let s = 1; s <= 320; s++) {
  const heading = headingAt(s - 0.5),
    previous = route[s - 1];
  route.push({ x: previous.x + Math.sin(heading), z: previous.z - Math.cos(heading) });
}
export function cityRouteAt(distance: number) {
  const s = Math.min(319, Math.max(0, distance));
  const i = Math.floor(s),
    f = s - i;
  return {
    x: THREE.MathUtils.lerp(route[i].x, route[i + 1].x, f),
    z: THREE.MathUtils.lerp(route[i].z, route[i + 1].z, f),
    heading: headingAt(s),
  };
}
export function cityTimeAt(distance: number) {
  return (
    (CITY_FLIGHT.end * (-0.18 + Math.sqrt(0.18 ** 2 + (3.28 * distance) / CITY_FLIGHT.length))) /
    1.64
  );
}
export const cityDamageAt = (distance: number) => 0.12 + 0.84 * smooth(0, 250, distance);
export function cityFlightAt(t: number) {
  const progress = Math.min(1, Math.max(0, t / CITY_FLIGHT.end));
  const distance = CITY_FLIGHT.length * (0.18 * progress + 0.82 * progress * progress);
  const position = cityRouteAt(distance),
    ahead = cityRouteAt(distance + 13);
  const bend = headingAt(distance + 6) - headingAt(Math.max(0, distance - 6));
  return {
    opacity:
      smooth(CITY_FLIGHT.enter, CITY_FLIGHT.clear, t) *
      (1 - smooth(CITY_FLIGHT.exit, CITY_FLIGHT.end, t)),
    distance,
    damage: cityDamageAt(distance),
    z: position.z,
    x: position.x,
    targetX: ahead.x,
    targetZ: ahead.z,
    heading: position.heading,
    bank: -bend * 0.24,
    y: 2.8 + Math.sin(progress * Math.PI) * 0.7,
  };
}

const vertex = `varying vec3 vWorld;
void main(){ vec4 p=modelMatrix*vec4(position,1.); vWorld=p.xyz;
gl_Position=projectionMatrix*viewMatrix*p; }`;
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}`;

type Block = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  tilt?: number;
  yaw?: number;
  shade?: number;
};

type Fragment = Block & { start: number; vx: number; vy: number; vz: number; spin: number };
// Pure, seekable destruction. The flash auditor and replay use exactly the same
// physical poses as a live flight; no frame-dependent physics or hidden timers.
export function fragmentAt(fragment: Fragment, t: number) {
  const age = Math.max(0, t - fragment.start);
  return {
    x: fragment.x + fragment.vx * age,
    z: fragment.z + fragment.vz * age,
    y: Math.max(fragment.h * 0.3, fragment.y + fragment.vy * age - 7 * age * age),
    tilt: (fragment.tilt ?? 0) + fragment.spin * age,
    yaw: (fragment.yaw ?? 0) + fragment.spin * age * 0.43,
  };
}

export class RainCityScene {
  readonly canvas = document.createElement("canvas");
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(66, 1, 0.15, 270);
  private rain!: THREE.LineSegments;
  private reflection!: Reflector;
  private time = { value: 0 };
  private heading = { value: 0 };
  private dustPixels = { value: 700 };
  private fragments: Fragment[] = [];
  private debris!: THREE.InstancedMesh;
  private debrisPose = new THREE.Object3D();
  private headlight = new THREE.PointLight(0x8dcfe1, 130, 42, 1.6);
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private disposed = false;

  constructor() {
    this.canvas.className = "opening-rain-city";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0";
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: false,
      antialias: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
    try {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.1;
      this.scene.background = new THREE.Color("#030710");
      this.scene.fog = new THREE.FogExp2("#08101b", 0.009);
      this.scene.add(new THREE.HemisphereLight(0x6486ba, 0x080c16, 0.8));
      const moon = new THREE.DirectionalLight(0x89b6eb, 1.7);
      moon.position.set(-35, 70, -80);
      this.scene.add(moon);
      const warm = new THREE.DirectionalLight(0xff7839, 0.32);
      warm.position.set(20, 8, 25);
      this.scene.add(warm);
      this.scene.add(this.headlight);

      let seed = 73017;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        return (seed >>> 0) / 4294967296;
      };
      const concrete: Block[] = [],
        steel: Block[] = [],
        glass: Block[] = [],
        rubble: Block[] = [],
        lamps: Block[] = [],
        windows: Block[] = [],
        embers: Block[] = [];
      // All neighbourhoods follow the same curved route as the camera. Deeper
      // districts lose facades, then floors; debris replaces the surviving city.
      const along = (s: number, offset: number, y: number, b: Omit<Block, "x" | "y" | "z">) => {
        const p = cityRouteAt(s);
        return {
          ...b,
          x: p.x + Math.cos(p.heading) * offset,
          z: p.z + Math.sin(p.heading) * offset,
          y,
          yaw: -p.heading,
        };
      };
      // Concrete floor plates, severed columns and irregular surviving facades.
      // Missing cells expose each building's skeleton, including jagged rooflines.
      for (const side of [-1, 1]) {
        for (let row = 0; row < 2; row++) {
          for (let b = 0; b < 23; b++) {
            const distance = b * 13 + random() * 3;
            const damage = cityDamageAt(distance);
            const offset = side * (16 + row * 18 + random() * 2);
            const w = 7 + random() * 5,
              d = 7 + random() * 4;
            const floors = 5 + Math.floor(random() * 12 * (1 - damage * 0.5));
            for (let f = 0; f < floors; f++) {
              const y = f * 3.1;
              const damaged = random() < damage || f > floors * (1 - damage * 0.6);
              if (f < 2 || random() > damage * 0.38)
                concrete.push(
                  along(distance, offset, y + 0.12, {
                    w: w * (damaged ? 0.65 + random() * 0.35 : 1),
                    h: 0.28,
                    d,
                    tilt: damaged ? side * damage * random() * 0.32 : 0,
                    shade: 0.42 + random() * 0.25,
                  }),
                );
              for (let c = 0; c < 4; c++) {
                if (damaged && random() < 0.38) continue;
                const cx = offset - w * 0.45 + c * w * 0.3;
                concrete.push(
                  along(distance - d * 0.43, cx, y + 1.55, {
                    w: 0.35,
                    h: 3.1,
                    d: 0.48,
                    shade: 0.55,
                  }),
                );
                if (random() > (damaged ? 0.7 : 0.28)) {
                  glass.push(
                    along(distance - d * 0.45, cx + w * 0.13, y + 1.6, {
                      w: w * 0.23,
                      h: 2.35,
                      d: 0.12,
                      shade: 0.3 + random() * 0.65,
                    }),
                  );
                }
              }
              steel.push(
                along(distance, offset - side * w * 0.45, y + 1.55, {
                  w: 0.18,
                  h: 3.1,
                  d: d * 0.95,
                  shade: 0.65,
                }),
              );
              // Surviving wall sections face the street, rather than leaving
              // every block as an identical open construction scaffold.
              for (let bay = 0; bay < 3; bay++) {
                if (random() < damage * (damaged ? 0.9 : 0.55)) continue;
                concrete.push(
                  along(distance + d * 0.32 - bay * d * 0.32, offset - side * w * 0.47, y + 1.5, {
                    w: 0.34,
                    h: 2.85,
                    d: d * 0.28,
                    shade: 0.5 + random() * 0.35,
                  }),
                );
                // Recessed glass and occasional surviving light distinguish
                // abandoned offices from identical unfinished scaffolding.
                const pane = along(
                  distance + d * 0.32 - bay * d * 0.32,
                  offset - side * w * 0.5,
                  y + 1.65,
                  { w: 0.035, h: 1.55, d: d * 0.18, shade: 0.4 + random() * 0.5 },
                );
                (random() < 0.18 * (1 - damage) ? windows : glass).push(pane);
              }
            }
            // Jagged exposed reinforcing bars at broken corners.
            for (let r = 0; r < 3; r++)
              steel.push(
                along(
                  distance + (random() - 0.5) * d,
                  offset + (random() - 0.5) * w,
                  floors * 3.1 + 0.65,
                  {
                    w: 0.055,
                    h: 1.6 + random() * 2,
                    d: 0.06,
                    tilt: (random() - 0.5) * 0.7,
                  },
                ),
              );
          }
        }
        for (let i = 0; i < 450; i++) {
          const distance = random() * 290,
            damage = cityDamageAt(distance);
          const offset = side * (5 + random() * 12),
            size = 0.2 + random() * (0.8 + damage * 4.2);
          rubble.push(
            along(distance, offset, size * 0.28, {
              w: size,
              h: size * (0.15 + random() * 0.28),
              d: size * (0.5 + random() * 0.6),
              tilt: (random() - 0.5) * 1.1,
              shade: 0.35 + random() * 0.35,
            }),
          );
          if (i % 14 === 0 && damage > 0.4)
            embers.push(along(distance, offset, 0.2, { w: size * 0.7, h: 0.07, d: size * 0.3 }));
        }
        for (let i = 0; i < 15; i++) {
          const s = 10 + i * 19,
            damaged = i > 6 && i % 2 === 0;
          steel.push(
            along(s, side * 9.6, damaged ? 1.7 : 3.5, {
              w: 0.15,
              h: 7,
              d: 0.15,
              tilt: side * (damaged ? 1.2 : 0.06),
            }),
          );
          if (damaged) continue;
          steel.push(along(s, side * 8.65, 6.95, { w: 2, h: 0.12, d: 0.18, tilt: side * 0.08 }));
          lamps.push(along(s, side * 7.8, 6.85, { w: 0.75, h: 0.1, d: 0.4 }));
        }
      }
      this.blocks(
        concrete,
        new THREE.MeshStandardMaterial({ color: 0x71808a, roughness: 0.84, metalness: 0.12 }),
      );
      this.blocks(
        steel,
        new THREE.MeshStandardMaterial({ color: 0x35454e, roughness: 0.4, metalness: 0.75 }),
      );
      this.blocks(
        glass,
        new THREE.MeshStandardMaterial({ color: 0x183d4d, roughness: 0.2, metalness: 0.8 }),
      );
      this.blocks(
        rubble,
        new THREE.MeshStandardMaterial({ color: 0x747978, roughness: 0.92 }),
        new THREE.IcosahedronGeometry(0.65, 0),
      );
      this.blocks(lamps, new THREE.MeshBasicMaterial({ color: 0xffd09a }));
      this.lampHalos(lamps);
      this.blocks(windows, new THREE.MeshBasicMaterial({ color: 0xaec8ce }));
      this.blocks(embers, new THREE.MeshBasicMaterial({ color: 0xcb5425 }));
      // Worn lane paint also bends with the street (never a straight stripe
      // slipping sideways under a turning camera).
      const paint: Block[] = [],
        curbs: Block[] = [];
      for (let s = 0; s < 300; s += 3) {
        for (const side of [-1, 1]) {
          if (random() > cityDamageAt(s) * 0.75)
            paint.push(along(s, side * 0.22, 0.005, { w: 0.1, h: 0.012, d: 1.2, shade: 0.4 }));
          if (random() > cityDamageAt(s) * 0.55)
            curbs.push(along(s, side * 10, 0.14, { w: 0.24, h: 0.28, d: 2.5, shade: 0.6 }));
        }
      }
      this.blocks(paint, new THREE.MeshStandardMaterial({ color: 0xc4baa0, roughness: 0.7 }));
      this.blocks(curbs, new THREE.MeshStandardMaterial({ color: 0x64717b, roughness: 0.8 }));

      // A few surviving neon fixtures and warm pools on the wet roadway. No
      // flashing billboards or screen-filling lightning to manufacture impact.
      const signals: Block[] = [],
        pools: Block[] = [];
      for (let i = 0; i < 12; i++) {
        const s = i * 24 + 8,
          side = i % 2 ? -1 : 1;
        signals.push(along(s, side * 11.1, 7, { w: 0.08, h: 3.6, d: 0.35, shade: 0.7 }));
        pools.push(along(s, side * 7.8, 0.025, { w: 4, h: 1, d: 8, shade: 0.55 }));
      }
      this.blocks(signals, new THREE.MeshBasicMaterial({ color: 0x59adca }));
      const poolGeo = new THREE.PlaneGeometry(1, 1);
      poolGeo.rotateX(-Math.PI / 2);
      this.blocks(
        pools,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
          fragmentShader: `varying vec2 vUv;void main(){float a=pow(max(0.,1.-length((vUv-.5)*2.)),2.);gl_FragColor=vec4(.42,.19,.06,a*.2);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`,
        }),
        poolGeo,
      );

      // Two entire buildings obstruct the bend and the final district. Their
      // facades fracture ahead of impact and their upper floors fold outward as
      // the camera crosses the original walls, leaving a visible hollow shell.
      for (const distance of CITY_IMPACTS) {
        const p = cityRouteAt(distance),
          hit = cityTimeAt(distance);
        for (let floor = 0; floor < 10; floor++) {
          for (let column = -4; column <= 4; column++) {
            const offset = column * 1.65,
              y = floor * 2.25 + 1;
            const block = along(distance, offset, y, {
              w: 1.6,
              h: 2.18,
              d: 0.45 + random() * 0.4,
              shade: 0.52 + random() * 0.35,
            });
            // Missing windows on upper floors, but a complete impact wall below.
            if (floor > 2 && random() < 0.3) continue;
            const side = column < 0 ? -1 : 1,
              speed = 8 + random() * 13;
            this.fragments.push({
              ...block,
              start: hit - 0.27 + Math.abs(column) * 0.022 + floor * 0.013,
              vx: Math.cos(p.heading) * side * speed + Math.sin(p.heading) * 8,
              vz: Math.sin(p.heading) * side * speed - Math.cos(p.heading) * 8,
              vy: floor < 3 ? 5 + random() * 7 : random() * 2,
              spin: side * (0.3 + random() * 2),
            });
          }
          // Broken floor plates and torn returns: the breach has real depth.
          for (const side of [-1, 1]) {
            const block = along(distance + 4, side * 7.8, floor * 2.25 + 0.3, {
              w: 3,
              h: 0.32,
              d: 10,
              shade: 0.48,
            });
            this.fragments.push({
              ...block,
              start: hit - 0.12 + floor * 0.018,
              vx: Math.cos(p.heading) * side * (3 + floor * 0.4),
              vz: Math.sin(p.heading) * side * 4,
              vy: -floor * 0.2,
              spin: -side * (0.5 + floor * 0.05),
            });
          }
        }
      }
      const fracture = new THREE.Shape();
      fracture.moveTo(-0.5, -0.43);
      fracture.lineTo(-0.22, -0.5);
      fracture.lineTo(0.31, -0.47);
      fracture.lineTo(0.5, -0.28);
      fracture.lineTo(0.43, 0.22);
      fracture.lineTo(0.49, 0.45);
      fracture.lineTo(0.18, 0.5);
      fracture.lineTo(-0.43, 0.42);
      fracture.lineTo(-0.5, 0.15);
      fracture.closePath();
      const fragmentGeometry = new THREE.ExtrudeGeometry(fracture, {
        depth: 1,
        steps: 1,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.022,
        bevelThickness: 0.025,
      });
      fragmentGeometry.translate(0, 0, -0.5);
      this.debris = this.blocks(
        this.fragments,
        new THREE.MeshStandardMaterial({ color: 0x829199, roughness: 0.78, metalness: 0.17 }),
        fragmentGeometry,
      );
      this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.debris.frustumCulled = false;
      this.makeImpactDust(random);

      // One bounded planar reflection, seen only through wet patches. It reflects
      // the actual street, so buildings and lamps move correctly as we pass them.
      const reflectionGeometry = new THREE.PlaneGeometry(400, 420);
      this.geometries.add(reflectionGeometry);
      this.reflection = new Reflector(reflectionGeometry, {
        textureWidth: 768,
        textureHeight: 512,
        color: 0x637485,
        clipBias: 0.003,
        multisample: 0,
      });
      this.reflection.rotation.x = -Math.PI / 2;
      this.reflection.position.set(80, -0.05, -120);
      this.reflection.getReflectionCamera(this.camera).layers.set(0);
      this.scene.add(this.reflection);
      const roadMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: this.time },
        vertexShader: vertex,
        fragmentShader: `
      varying vec3 vWorld; uniform float uTime; ${noise}
      void main(){vec2 p=vWorld.xz; float n=noise(p*1.7),fine=noise(p*32.);
      float wet=smoothstep(.37,.68,noise(p*vec2(.6,.28))+.12*noise(p*2.));
      float ripple=sin(length(fract(p*1.2)-.5)*42.-uTime*9.)*.5+.5;
      vec3 col=vec3(.009,.015,.021)+(fine-.5)*.012+n*.008;
      col*=.5;col+=vec3(.002,.004,.007)*wet*(.95+ripple*.05);
      float fog=1.-exp(-length(cameraPosition-vWorld)*.012);
      gl_FragColor=vec4(mix(col,vec3(.0025,.005,.01),fog),mix(.98,.3,wet));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
      });
      const road = this.mesh(new THREE.PlaneGeometry(400, 420), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(80, -0.03, -120);

      // Layered storm clouds above the street's vanishing point.
      const sky = this.mesh(
        new THREE.SphereGeometry(330, 28, 16),
        new THREE.ShaderMaterial({
          vertexShader: vertex,
          uniforms: { uTime: this.time },
          depthWrite: false,
          side: THREE.BackSide,
          fragmentShader: `
      varying vec3 vWorld;uniform float uTime;${noise}
      void main(){vec2 p=vWorld.xz*.018+vWorld.y*.006;float c=noise(p)+.5*noise(p*2.1)+.25*noise(p*4.2);
      vec3 col=mix(vec3(.001,.002,.005),vec3(.008,.016,.035),c*.48);
      float horizon=exp(-abs(vWorld.y-5.)*.045);col+=vec3(.004,.007,.014)*horizon;
      gl_FragColor=vec4(col,1.);#include <colorspace_fragment>
      }`.replace(";#include", ";\n#include"),
        }),
      );
      sky.position.set(80, 0, -100);
      this.camera.far = 550;
      this.camera.updateProjectionMatrix();

      const count = 1800,
        positions = new Float32Array(count * 6),
        seeds = new Float32Array(count * 2),
        tails = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        const x = (random() - 0.5) * 42,
          y = random() * 24,
          z = -random() * 90;
        positions.set([x, y, z, x + 0.1, y, z - 0.14], i * 6);
        tails[i * 2 + 1] = -0.7 - random() * 0.5;
        seeds[i * 2] = seeds[i * 2 + 1] = random();
      }
      const rainGeo = new THREE.BufferGeometry();
      rainGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      rainGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
      rainGeo.setAttribute("aTail", new THREE.BufferAttribute(tails, 1));
      const rainMat = new THREE.ShaderMaterial({
        uniforms: { uTime: this.time, uHeading: this.heading },
        transparent: true,
        depthWrite: false,
        vertexShader: `
      attribute float aSeed;attribute float aTail;uniform float uTime;uniform float uHeading;varying float vAlpha;
      void main(){vec3 p=position;p.y=mod(p.y-uTime*(15.+aSeed*8.)+240.,24.)+aTail;
      p.x+=sin(uTime*.7)*.4;p.xz=mat2(cos(uHeading),sin(uHeading),-sin(uHeading),cos(uHeading))*p.xz;
      p+=cameraPosition;vec4 mv=viewMatrix*vec4(p,1.);
      vAlpha=(.12+aSeed*.24)*(1.-smoothstep(25.,85.,-mv.z));
      gl_Position=projectionMatrix*mv;}`,
        fragmentShader: `varying float vAlpha;void main(){gl_FragColor=vec4(.58,.74,.81,vAlpha);}`,
      });
      this.geometries.add(rainGeo);
      this.materials.add(rainMat);
      this.rain = new THREE.LineSegments(rainGeo, rainMat);
      this.rain.frustumCulled = false;
      this.rain.layers.set(1);
      this.scene.add(this.rain);

      // Lens moisture and vignette, a single low-cost overlay in clip space.
      const lens = this.mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          uniforms: { uTime: this.time },
          transparent: true,
          depthTest: false,
          depthWrite: false,
          vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
          fragmentShader: `varying vec2 vUv;uniform float uTime;${noise}
      void main(){vec2 p=vUv-.5;float vignette=smoothstep(.22,.72,length(p));
      vec2 q=vUv*vec2(34.,9.);q.y+=uTime*.17;vec2 cell=floor(q),f=fract(q)-.5;
      float drop=(1.-smoothstep(.06,.13,length(f*vec2(1.,.35))))*step(.93,hash(cell));
      gl_FragColor=vec4(vec3(.035,.065,.08)+drop*.13,vignette*.62+drop*.14);}`,
        }),
      );
      lens.renderOrder = 10;
      lens.layers.set(1);
      this.camera.layers.enable(1);
      lens.frustumCulled = false;
      this.resize(innerWidth, innerHeight);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.geometries.add(geometry);
    this.materials.add(material);
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
    return mesh;
  }

  private lampHalos(lamps: Block[]) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv;varying float vFade;
      void main(){vUv=uv;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      center.xy+=position.xy*3.5;vFade=exp(-max(0.,-center.z)*.014);
      gl_Position=projectionMatrix*center;}`,
      fragmentShader: `varying vec2 vUv;varying float vFade;
      void main(){vec2 p=vUv-.5;float r=length(p)*2.;float glow=exp(-r*7.)*(1.-smoothstep(.6,1.,r));
      float streak=exp(-abs(p.y)*150.)*exp(-abs(p.x)*12.);
      gl_FragColor=vec4(.7,.38,.15,(glow*.38+streak*.05)*vFade);}`,
    });
    this.blocks(lamps, material, geometry);
  }

  private makeImpactDust(random: () => number) {
    const count = 420,
      positions = new Float32Array(count * 3),
      motion = new Float32Array(count * 3),
      starts = new Float32Array(count),
      sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const distance = CITY_IMPACTS[i % 2],
        p = cityRouteAt(distance),
        side = random() < 0.5 ? -1 : 1;
      positions.set(
        [p.x + (random() - 0.5) * 9, 1 + random() * 19, p.z + (random() - 0.5) * 4],
        i * 3,
      );
      motion.set(
        [
          Math.cos(p.heading) * side * (5 + random() * 10),
          2 + random() * 6,
          Math.sin(p.heading) * side * 8 - Math.cos(p.heading) * 8,
        ],
        i * 3,
      );
      starts[i] = cityTimeAt(distance) - 0.27 + random() * 0.18;
      sizes[i] = i % 9 === 0 ? 0.08 : 1 + random() * 3;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aMotion", new THREE.BufferAttribute(motion, 3));
    geometry.setAttribute("aStart", new THREE.BufferAttribute(starts, 1));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: this.time, uPixels: this.dustPixels },
      vertexShader: `attribute vec3 aMotion;attribute float aStart;attribute float aSize;
      uniform float uTime;uniform float uPixels;varying float vAlpha;varying float vSpark;
      void main(){float age=max(0.,uTime-aStart);vec3 p=position+aMotion*age;
      p.y=max(.2,p.y-3.*age*age);vec4 mv=viewMatrix*vec4(p,1.);
      vAlpha=smoothstep(0.,.12,age)*(1.-smoothstep(.45,1.8,age))*.22;
      vSpark=1.-step(.1,aSize);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp(aSize*(1.+age*.7)*uPixels/max(1.,-mv.z),1.,160.);}`,
      fragmentShader: `varying float vAlpha;varying float vSpark;
      void main(){float r=length(gl_PointCoord-.5)*2.;float edge=1.-smoothstep(.15,1.,r);
      gl_FragColor=vec4(mix(vec3(.14,.18,.23),vec3(.8,.34,.09),vSpark),edge*vAlpha);}`,
    });
    this.geometries.add(geometry);
    this.materials.add(material);
    const dust = new THREE.Points(geometry, material);
    dust.frustumCulled = false;
    dust.layers.set(1);
    this.scene.add(dust);
  }

  private blocks(
    blocks: Block[],
    material: THREE.Material,
    geometry: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1),
  ) {
    if (material instanceof THREE.MeshStandardMaterial) {
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = "varying vec3 citySurface;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vec4 cityP=vec4(position,1.);
          #ifdef USE_INSTANCING
          cityP=instanceMatrix*cityP;
          #endif
          citySurface=(modelMatrix*cityP).xyz;`,
        );
        shader.fragmentShader =
          "varying vec3 citySurface;\n" + noise + "\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float grime=noise(citySurface.xy*vec2(1.8,.14)+citySurface.z*.2);
          float grain=noise(citySurface.xy*26.+citySurface.z*3.);
          float cracks=pow(1.-abs(noise(citySurface.xy*2.+citySurface.z)-.5)*2.,24.);
          diffuseColor.rgb*=.55+grime*.65+grain*.2-cracks*.23;`,
        );
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <normal_fragment_begin>",
          `#include <normal_fragment_begin>
          normal=normalize(normal+vec3(noise(citySurface.yz*18.)-.5,
          noise(citySurface.xz*18.)-.5,noise(citySurface.xy*18.)-.5)*.16);`,
        );
      };
    }
    this.geometries.add(geometry);
    this.materials.add(material);
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
    const object = new THREE.Object3D(),
      color = new THREE.Color();
    blocks.forEach((b, i) => {
      object.position.set(b.x, b.y, b.z);
      object.scale.set(b.w, b.h, b.d);
      object.rotation.set(0, b.yaw ?? 0, b.tilt ?? 0);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.setScalar(b.shade ?? 1));
    });
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
    return mesh;
  }

  async compile() {
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) return;
    // Allocate instance buffers and the reflection target while the canvas is
    // still detached. The first visible rain frame must not pay that cost.
    this.draw(CITY_FLIGHT.clear);
    this.canvas.style.opacity = "0";
  }
  get lost() {
    return this.disposed || this.renderer.getContext().isContextLost();
  }
  resize(width: number, height: number, rung = 0) {
    if (this.disposed) return;
    const compact = width < 760;
    const scale =
      Math.min(
        devicePixelRatio || 1,
        1.6,
        Math.sqrt((compact ? 750000 : 1600000) / (width * height)),
      ) * Math.pow(0.8, rung);
    this.renderer.setSize(
      Math.max(32, Math.round(width * scale)),
      Math.max(32, Math.round(height * scale)),
      false,
    );
    this.reflection
      .getRenderTarget()
      .setSize(
        Math.max(128, Math.round(width * scale * 0.55)),
        Math.max(128, Math.round(height * scale * 0.55)),
      );
    this.camera.aspect = width / height;
    this.dustPixels.value = height * scale * 0.65;
    this.camera.fov = compact ? 78 : 66;
    this.camera.updateProjectionMatrix();
  }
  draw(t: number) {
    if (this.disposed) return;
    const state = cityFlightAt(t);
    this.canvas.style.opacity = String(state.opacity);
    if (state.opacity === 0) return;
    this.time.value = t;
    this.heading.value = state.heading;
    this.camera.position.set(state.x, state.y, state.z);
    this.camera.lookAt(state.targetX, state.y + 0.7, state.targetZ);
    this.camera.rotateZ(state.bank);
    this.headlight.position.set(state.x, state.y + 1, state.z);
    this.fragments.forEach((fragment, i) => {
      const pose = fragmentAt(fragment, t),
        object = this.debrisPose;
      object.position.set(pose.x, pose.y, pose.z);
      object.rotation.set(0, pose.yaw, pose.tilt);
      object.scale.set(fragment.w, fragment.h, fragment.d);
      object.updateMatrix();
      this.debris.setMatrixAt(i, object.matrix);
    });
    this.debris.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.reflection?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
