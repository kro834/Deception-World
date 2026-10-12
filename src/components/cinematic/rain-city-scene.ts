// A real, deterministic 3D street, not a zoomed background. The opening owns
// the clock and all lifetime management; this renderer never starts its own RAF.
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

export const CITY_FLIGHT = { enter: 0.12, clear: 0.48, exit: 2.85, end: 3.5 } as const;
export function cityFlightAt(t: number) {
  const progress = Math.min(1, Math.max(0, t / CITY_FLIGHT.end));
  return {
    opacity:
      smooth(CITY_FLIGHT.enter, CITY_FLIGHT.clear, t) *
      (1 - smooth(CITY_FLIGHT.exit, CITY_FLIGHT.end, t)),
    z: 18 - 112 * (0.22 * progress + 0.78 * progress * progress),
    x: Math.sin(progress * Math.PI * 1.2) * 1.15,
    y: 2.65 + Math.sin(progress * Math.PI) * 0.55,
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
  shade?: number;
};

export class RainCityScene {
  readonly canvas = document.createElement("canvas");
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(66, 1, 0.15, 270);
  private rain!: THREE.LineSegments;
  private reflection!: Reflector;
  private time = { value: 0 };
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
      this.renderer.toneMappingExposure = 1.15;
      this.scene.background = new THREE.Color("#1a2935");
      this.scene.fog = new THREE.FogExp2("#263c48", 0.012);
      this.scene.add(new THREE.HemisphereLight(0x9bbacd, 0x18232c, 2.5));
      const moon = new THREE.DirectionalLight(0xa5cedd, 3.2);
      moon.position.set(-35, 70, -80);
      this.scene.add(moon);
      const warm = new THREE.DirectionalLight(0xffb778, 0.5);
      warm.position.set(20, 8, 25);
      this.scene.add(warm);

      let seed = 73017;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        return (seed >>> 0) / 4294967296;
      };
      const concrete: Block[] = [],
        steel: Block[] = [],
        glass: Block[] = [],
        rubble: Block[] = [],
        lamps: Block[] = [];
      // Concrete floor plates, severed columns and irregular surviving facades.
      // Missing cells expose each building's skeleton, including jagged rooflines.
      for (const side of [-1, 1]) {
        for (let row = 0; row < 2; row++) {
          for (let b = 0; b < 19; b++) {
            const z = 28 - b * 11 - random() * 3;
            const x = side * (14 + row * 15 + random() * 3);
            const w = 7 + random() * 5,
              d = 7 + random() * 4;
            const floors = 4 + Math.floor(random() * 14);
            for (let f = 0; f < floors; f++) {
              const y = f * 3.1;
              const damaged = f > floors * 0.65;
              concrete.push({
                x,
                y: y + 0.12,
                z,
                w: w * (damaged ? 0.65 + random() * 0.35 : 1),
                h: 0.28,
                d,
                shade: 0.42 + random() * 0.25,
              });
              for (let c = 0; c < 4; c++) {
                if (damaged && random() < 0.38) continue;
                const cx = x - w * 0.45 + c * w * 0.3;
                concrete.push({
                  x: cx,
                  y: y + 1.55,
                  z: z + d * 0.43,
                  w: 0.35,
                  h: 3.1,
                  d: 0.48,
                  shade: 0.55,
                });
                if (random() > (damaged ? 0.7 : 0.28)) {
                  glass.push({
                    x: cx + w * 0.13,
                    y: y + 1.6,
                    z: z + d * 0.45,
                    w: w * 0.23,
                    h: 2.35,
                    d: 0.12,
                    shade: 0.3 + random() * 0.65,
                  });
                }
              }
              steel.push({
                x: x - side * w * 0.45,
                y: y + 1.55,
                z,
                w: 0.18,
                h: 3.1,
                d: d * 0.95,
                shade: 0.65,
              });
              // Surviving wall sections face the street, rather than leaving
              // every block as an identical open construction scaffold.
              for (let bay = 0; bay < 3; bay++) {
                if (random() < (damaged ? 0.64 : 0.22)) continue;
                concrete.push({
                  x: x - side * w * 0.47,
                  y: y + 1.5,
                  z: z - d * 0.32 + bay * d * 0.32,
                  w: 0.3,
                  h: 2.6,
                  d: d * 0.26,
                  shade: 0.5 + random() * 0.35,
                });
              }
            }
            // Jagged exposed reinforcing bars at broken corners.
            for (let r = 0; r < 3; r++)
              steel.push({
                x: x + (random() - 0.5) * w,
                y: floors * 3.1 + 0.65,
                z: z + (random() - 0.5) * d,
                w: 0.055,
                h: 1.6 + random() * 2,
                d: 0.06,
                tilt: (random() - 0.5) * 0.7,
              });
          }
        }
        for (let i = 0; i < 240; i++) {
          const x = side * (8 + random() * 9),
            size = 0.2 + random() * 1.15;
          rubble.push({
            x,
            y: size * 0.28,
            z: 25 - random() * 215,
            w: size,
            h: size * 0.6,
            d: size * 0.8,
            tilt: random() * 2,
            shade: 0.35 + random() * 0.35,
          });
        }
        for (let i = 0; i < 12; i++) {
          const z = 15 - i * 18,
            x = side * 9.6;
          steel.push({ x, y: 3.5, z, w: 0.15, h: 7, d: 0.15, tilt: side * 0.06 });
          steel.push({ x: x - side * 0.95, y: 6.95, z, w: 2, h: 0.12, d: 0.18, tilt: side * 0.08 });
          lamps.push({ x: x - side * 1.8, y: 6.85, z, w: 0.75, h: 0.1, d: 0.4 });
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

      // One bounded planar reflection, seen only through wet patches. It reflects
      // the actual street, so buildings and lamps move correctly as we pass them.
      const reflectionGeometry = new THREE.PlaneGeometry(130, 300);
      this.geometries.add(reflectionGeometry);
      this.reflection = new Reflector(reflectionGeometry, {
        textureWidth: 768,
        textureHeight: 512,
        color: 0x82959d,
        clipBias: 0.003,
        multisample: 0,
      });
      this.reflection.rotation.x = -Math.PI / 2;
      this.reflection.position.set(0, -0.05, -85);
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
      float lane=(1.-smoothstep(.07,.14,abs(abs(p.x)-.22)))*step(.28,fract(p.y*.13))*step(.25,n);
      col+=vec3(.11,.105,.07)*lane;
      float distanceGlow=exp(-abs(p.x)*.29);
      col+=vec3(.008,.014,.02)*wet*distanceGlow*(.95+ripple*.05);
      float lamps=pow(max(0.,1.-abs(abs(p.x)-7.8)/3.),3.);
      float streak=pow(max(0.,sin((p.y-15.)*.349)),10.);
      col+=vec3(.16,.08,.025)*lamps*(.12+streak*.6)*wet;
      float fog=1.-exp(-length(cameraPosition-vWorld)*.012);
      gl_FragColor=vec4(mix(col,vec3(.065,.105,.125),fog),mix(.97,.42,wet)+lane*.03);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
      });
      const road = this.mesh(new THREE.PlaneGeometry(130, 300), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, -0.03, -85);

      // Layered storm clouds above the street's vanishing point.
      const sky = this.mesh(
        new THREE.PlaneGeometry(450, 220),
        new THREE.ShaderMaterial({
          vertexShader: vertex,
          uniforms: { uTime: this.time },
          depthWrite: false,
          fragmentShader: `
      varying vec3 vWorld;uniform float uTime;${noise}
      void main(){vec2 p=vWorld.xy*.027;float c=noise(p)+.5*noise(p*2.1)+.25*noise(p*4.2);
      vec3 col=mix(vec3(.027,.043,.063),vec3(.19,.26,.29),c*.48);
      float horizon=exp(-abs(vWorld.y-5.)*.045);col+=vec3(.11,.14,.15)*horizon;
      gl_FragColor=vec4(col,1.);#include <colorspace_fragment>
      }`.replace(";#include", ";\n#include"),
        }),
      );
      sky.position.set(0, 75, -218);

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
        uniforms: { uTime: this.time },
        transparent: true,
        depthWrite: false,
        vertexShader: `
      attribute float aSeed;attribute float aTail;uniform float uTime;varying float vAlpha;
      void main(){vec3 p=position;p.y=mod(p.y-uTime*(15.+aSeed*8.)+240.,24.)+aTail;
      p.x+=sin(uTime*.7)*.4;p+=cameraPosition;vec4 mv=viewMatrix*vec4(p,1.);
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
          float grain=noise(citySurface.xy*65.+citySurface.z*3.);
          float cracks=pow(1.-abs(noise(citySurface.xy*2.+citySurface.z)-.5)*2.,24.);
          diffuseColor.rgb*=.55+grime*.65+grain*.2-cracks*.23;`,
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
      object.rotation.set(0, 0, b.tilt ?? 0);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
      mesh.setColorAt(i, color.setScalar(b.shade ?? 1));
    });
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
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
    this.camera.fov = compact ? 78 : 66;
    this.camera.updateProjectionMatrix();
  }
  draw(t: number) {
    if (this.disposed) return;
    const state = cityFlightAt(t);
    this.canvas.style.opacity = String(state.opacity);
    if (state.opacity === 0) return;
    this.time.value = t;
    this.camera.position.set(state.x, state.y, state.z);
    this.camera.lookAt(state.x * 0.35, 4.2, state.z - 45);
    this.camera.rotation.z = Math.sin(t * 1.2) * 0.008;
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
