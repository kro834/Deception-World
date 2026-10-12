// A real, deterministic 3D street, not a zoomed background. The opening owns
// the clock and all lifetime management; this renderer never starts its own RAF.
import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { cityArchitecture } from "./rain-city-architecture.ts";
import { applyCitySurface, cityTexture, type CitySurfaceImages } from "./rain-city-materials.ts";

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
  private destruction: { mesh: THREE.InstancedMesh; fragments: Fragment[] }[] = [];
  private debrisPose = new THREE.Object3D();
  private headlight = new THREE.PointLight(0x8dcfe1, 130, 42, 1.6);
  private lamps: Block[] = [];
  private streetLights: THREE.SpotLight[] = [];
  private lightPositions = { value: Array.from({ length: 6 }, () => new THREE.Vector3()) };
  private reflectionTexel = { value: new THREE.Vector2(1 / 768, 1 / 512) };
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private disposed = false;

  constructor(images: CitySurfaceImages | null = null) {
    this.canvas.className = "opening-rain-city";
    this.canvas.setAttribute("aria-hidden", "true");
    this.canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0";
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    });
    try {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.2;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.scene.background = new THREE.Color("#030710");
      this.scene.fog = new THREE.FogExp2("#111d29", 0.013);
      this.scene.add(new THREE.HemisphereLight(0x9cb4ca, 0x11151b, 0.85));
      const moon = new THREE.DirectionalLight(0xa5bfd4, 2.2);
      moon.position.set(-35, 70, -80);
      this.scene.add(moon);
      const warm = new THREE.DirectionalLight(0xff7839, 0.32);
      warm.position.set(20, 8, 25);
      this.scene.add(warm);
      this.headlight.intensity = 12;
      this.headlight.decay = 2;
      this.scene.add(this.headlight);
      this.installEnvironment();

      let seed = 73017;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        return (seed >>> 0) / 4294967296;
      };
      const city = cityArchitecture(cityRouteAt, cityDamageAt, random);
      this.lamps = city.lamps;
      const maps = [
        cityTexture(images?.[0], [156, 155, 147, 255], true),
        cityTexture(images?.[1], [128, 128, 255, 255]),
        cityTexture(images?.[2], [200, 200, 200, 255]),
        cityTexture(images?.[3], [54, 59, 61, 255], true),
        cityTexture(images?.[4], [128, 128, 255, 255]),
        cityTexture(images?.[5], [180, 180, 180, 255]),
      ];
      maps.forEach((map) => this.textures.add(map));
      this.canvas.dataset.materials = images ? "blender-baked" : "procedural-fallback";
      const cement = (color: number) =>
        applyCitySurface(
          new THREE.MeshStandardMaterial({
            color,
            roughness: 1,
            metalness: 0,
            envMapIntensity: 0.3,
          }),
          maps,
          3,
        );
      this.blocks(city.concrete, cement(0xc5c9ca));
      this.blocks(city.masonry, cement(0x988577));
      this.blocks(
        city.steel,
        new THREE.MeshStandardMaterial({ color: 0x434541, roughness: 0.52, metalness: 0.75 }),
      );
      this.blocks(
        city.housings,
        new THREE.MeshStandardMaterial({ color: 0x53605f, roughness: 0.38, metalness: 0.7 }),
        new RoundedBoxGeometry(1, 1, 1, 1, 0.06),
      );
      this.blocks(
        city.poles,
        new THREE.MeshStandardMaterial({ color: 0x485151, roughness: 0.42, metalness: 0.8 }),
        new THREE.CylinderGeometry(0.5, 0.57, 1, 8),
      );
      this.blocks(
        city.darkRooms,
        new THREE.MeshStandardMaterial({ color: 0x262320, roughness: 0.95 }),
      );
      const rooms = new THREE.MeshBasicMaterial({ color: 0xe5b275 });
      rooms.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          // Lamp-lit plaster is not an evenly luminous rectangle.
          float shade=.32+.68*smoothstep(0.,.9,vUv.y);
          diffuseColor.rgb*=shade;`,
        );
        shader.vertexShader = "#define USE_UV\n" + shader.vertexShader;
        shader.fragmentShader = "#define USE_UV\n" + shader.fragmentShader;
      };
      this.blocks(city.rooms, rooms);
      this.blocks(
        city.glass,
        new THREE.MeshPhysicalMaterial({
          color: 0x697c7e,
          metalness: 0.18,
          roughness: 0.2,
          transparent: true,
          opacity: 0.3,
          depthWrite: false,
          clearcoat: 1,
          clearcoatRoughness: 0.12,
          envMapIntensity: 1.8,
        }),
      );
      const chip = new THREE.Shape();
      chip.moveTo(-0.5, -0.25);
      chip.lineTo(-0.35, -0.48);
      chip.lineTo(0.12, -0.39);
      chip.lineTo(0.44, -0.12);
      chip.lineTo(0.33, 0.11);
      chip.lineTo(0.48, 0.37);
      chip.lineTo(-0.11, 0.5);
      chip.lineTo(-0.45, 0.22);
      chip.closePath();
      const rubbleGeometry = new THREE.ExtrudeGeometry(chip, {
        depth: 1,
        bevelEnabled: true,
        bevelSize: 0.025,
        bevelThickness: 0.018,
        bevelSegments: 1,
        steps: 1,
      });
      rubbleGeometry.translate(0, 0, -0.5);
      rubbleGeometry.rotateX(-Math.PI / 2);
      this.blocks(city.rubble, cement(0x9a9b98), rubbleGeometry);
      this.blocks(
        city.lamps,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.85, 0.82) }),
      );
      this.lampHalos(city.lamps);
      this.blocks(
        city.embers,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.2, 0.035) }),
      );
      this.installLighting();
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

      // Two entire buildings obstruct the bend and the final district. Their
      // facades fracture ahead of impact and their upper floors fold outward as
      // the camera crosses the original walls, leaving a visible hollow shell.
      const windowFragments: Fragment[] = [],
        frameFragments: Fragment[] = [];
      for (const distance of CITY_IMPACTS) {
        const p = cityRouteAt(distance),
          hit = cityTimeAt(distance);
        for (let floor = 0; floor < 9; floor++) {
          const y = floor * 3.15;
          const part = (
            x: number,
            cy: number,
            w: number,
            h: number,
            d: number,
            depth = 0,
            glass = false,
          ): Fragment => {
            const side = x < 0 ? -1 : 1,
              speed = (glass ? 15 : 8) + random() * 12;
            return {
              x: p.x + Math.cos(p.heading) * x + Math.sin(p.heading) * depth,
              z: p.z + Math.sin(p.heading) * x - Math.cos(p.heading) * depth,
              y: cy,
              w,
              h,
              d,
              yaw: -p.heading,
              shade: 0.74 + random() * 0.24,
              start: hit - (glass ? 0.3 : 0.27) + Math.abs(x) * 0.012 + floor * 0.013,
              vx: Math.cos(p.heading) * side * speed + Math.sin(p.heading) * 8,
              vz: Math.sin(p.heading) * side * speed - Math.cos(p.heading) * 8,
              vy: floor < 3 ? 5 + random() * 7 : random() * 2,
              spin: side * (0.3 + random() * (glass ? 5 : 1.3)),
            };
          };
          // Spandrels, piers and inset glazing form an actual inhabited facade,
          // not a checkerboard of disconnected cubes hung across the road.
          for (let bay = -2; bay <= 2; bay++) {
            const x = bay * 3.3;
            if (floor > 6 && random() < 0.28) continue;
            this.fragments.push(part(x - 0.83, y + 0.42, 1.69, 0.82, 0.52));
            this.fragments.push(part(x + 0.83, y + 0.42, 1.69, 0.82, 0.52));
            this.fragments.push(part(x, y + 2.99, 3.33, 0.34, 0.52));
            this.fragments.push(part(x - 1.49, y + 1.83, 0.36, 2.12, 0.56));
            this.fragments.push(part(x + 1.49, y + 1.83, 0.36, 2.12, 0.56));
            // Four panes really separate on impact. They never persist as an
            // immovable rectangular overlay after the surrounding wall breaks.
            for (const dx of [-0.7, 0.7])
              for (const dy of [1.36, 2.3])
                windowFragments.push(part(x + dx, y + dy, 1.34, 0.89, 0.035, 0.18, true));
            frameFragments.push(part(x, y + 1.82, 0.055, 1.92, 0.11, 0.02));
            frameFragments.push(part(x, y + 1.82, 2.8, 0.055, 0.11, 0.02));
          }
          for (const side of [-1, 1]) {
            this.fragments.push(part(side * 7.55, y + 0.1, 3.4, 0.3, 9, 4));
            this.fragments.push(part(side * 8.3, y + 1.55, 0.42, 3.15, 8, 4));
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
      this.debris = this.blocks(this.fragments, cement(0xb9b7b1), fragmentGeometry);
      this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.debris.frustumCulled = false;
      this.destruction.push({ mesh: this.debris, fragments: this.fragments });
      const brokenWindows = this.blocks(
        windowFragments,
        new THREE.MeshStandardMaterial({
          color: 0x273b43,
          metalness: 0.6,
          roughness: 0.2,
          envMapIntensity: 1.7,
        }),
      );
      const brokenFrames = this.blocks(
        frameFragments,
        new THREE.MeshStandardMaterial({
          color: 0x616767,
          metalness: 0.8,
          roughness: 0.4,
        }),
      );
      for (const [mesh, fragments] of [
        [brokenWindows, windowFragments],
        [brokenFrames, frameFragments],
      ] as const) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        this.destruction.push({ mesh, fragments });
      }
      this.makeImpactDust(random);

      // One bounded planar reflection, seen only through wet patches. It reflects
      // the actual street, so buildings and lamps move correctly as we pass them.
      const reflectionGeometry = new THREE.PlaneGeometry(400, 420);
      this.geometries.add(reflectionGeometry);
      this.reflection = new Reflector(reflectionGeometry, {
        textureWidth: 768,
        textureHeight: 512,
        clipBias: 0.003,
        multisample: 2,
      });
      this.reflection.rotation.x = -Math.PI / 2;
      this.reflection.position.set(80, -0.035, -120);
      this.reflection.getReflectionCamera(this.camera).layers.set(0);
      const road = this.reflection.material as THREE.ShaderMaterial;
      Object.assign(road.uniforms, {
        uTime: this.time,
        uTexel: this.reflectionTexel,
        uLights: this.lightPositions,
        uAlbedo: { value: maps[3] },
        uNormal: { value: maps[4] },
        uRoughness: { value: maps[5] },
      });
      road.vertexShader = `uniform mat4 textureMatrix;varying vec4 vReflect;varying vec3 vWorld;
        void main(){vReflect=textureMatrix*vec4(position,1.);vec4 p=modelMatrix*vec4(position,1.);
        vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`;
      road.fragmentShader = `
        uniform sampler2D tDiffuse,uAlbedo,uNormal,uRoughness;uniform float uTime;
        uniform vec2 uTexel;uniform vec3 uLights[6];varying vec4 vReflect;varying vec3 vWorld;
        ${noise}
        void main(){
          vec2 p=vWorld.xz,uv=p/4.;
          float wet=smoothstep(.37,.69,noise(p*vec2(.35,.21))+.16*noise(p*1.2));
          float rough=texture2D(uRoughness,uv).g;
          vec2 bump=texture2D(uNormal,uv).xy*2.-1.;
          // Broken rain rings change the reflected view, not just a tint above it.
          vec2 cell=fract(p*1.35)-.5;float radius=length(cell);
          float ring=sin(radius*59.-uTime*10.)*exp(-radius*6.)*.028;
          vec2 slope=bump*(1.-wet)*.09+normalize(cell+vec2(.001))*ring*wet;
          vec3 N=normalize(vec3(slope.x,1.,slope.y));
          vec3 V=normalize(cameraPosition-vWorld);
          vec2 projected=vReflect.xy/vReflect.w;
          projected+=slope*.055;
          projected=clamp(projected,vec2(.003),vec2(.997));
          vec2 blur=uTexel*(1.5+rough*4.)*(1.-wet*.82);
          vec3 reflected=texture2D(tDiffuse,projected).rgb*.4;
          reflected+=texture2D(tDiffuse,clamp(projected+vec2(blur.x,0.),.001,.999)).rgb*.15;
          reflected+=texture2D(tDiffuse,clamp(projected-vec2(blur.x,0.),.001,.999)).rgb*.15;
          reflected+=texture2D(tDiffuse,clamp(projected+vec2(0.,blur.y),.001,.999)).rgb*.15;
          reflected+=texture2D(tDiffuse,clamp(projected-vec2(0.,blur.y),.001,.999)).rgb*.15;
          vec3 albedo=texture2D(uAlbedo,uv).rgb;
          vec3 col=albedo*vec3(.11,.15,.2);
          for(int i=0;i<6;i++){
            vec3 L=uLights[i]-vWorld;float dist=length(L);L/=dist;
            float cone=smoothstep(.5,.85,L.y);
            float attenuation=210./(dist*dist+1.)*cone*pow(max(0.,1.-dist/27.),2.);
            vec3 H=normalize(V+L);
            float spec=pow(max(0.,dot(N,H)),mix(16.,170.,wet))*(.08+wet*.28);
            col+=vec3(1.,.56,.25)*(albedo*max(0.,dot(N,L))*.45+spec)*attenuation;
          }
          float fresnel=.025+.64*pow(1.-max(0.,dot(N,V)),4.);
          col=mix(col,reflected,clamp(fresnel*(.15+wet*.85),0.,.8));
          float fog=1.-exp(-length(cameraPosition-vWorld)*.01);
          gl_FragColor=vec4(mix(col,vec3(.004,.008,.014),fog),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`;
      this.scene.add(this.reflection);

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
      vec3 col=mix(vec3(.001,.003,.007),vec3(.015,.025,.041),c*.5);
      float horizon=exp(-abs(vWorld.y-5.)*.045);col+=vec3(.006,.01,.019)*horizon;
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
        uniforms: { uTime: this.time, uHeading: this.heading, uLights: this.lightPositions },
        transparent: true,
        depthWrite: false,
        vertexShader: `
      attribute float aSeed;attribute float aTail;uniform float uTime;uniform float uHeading;uniform vec3 uLights[6];varying float vAlpha;varying vec3 vColor;
      void main(){vec3 p=position;p.y=mod(p.y-uTime*(15.+aSeed*8.)+240.,24.)+aTail;
      p.x+=sin(uTime*.7)*.4;p.xz=mat2(cos(uHeading),sin(uHeading),-sin(uHeading),cos(uHeading))*p.xz;
      p+=cameraPosition;vec4 mv=viewMatrix*vec4(p,1.);
      vAlpha=(.1+aSeed*.2)*(1.-smoothstep(25.,85.,-mv.z));
      vColor=vec3(.18,.24,.31);
      for(int i=0;i<6;i++){float light=max(0.,1.-distance(p,uLights[i])/9.);vColor+=vec3(.9,.48,.2)*light*light;}
      gl_Position=projectionMatrix*mv;}`,
        fragmentShader: `varying float vAlpha;varying vec3 vColor;void main(){gl_FragColor=vec4(vColor,vAlpha);
        #include <colorspace_fragment>
        }`,
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

  private installEnvironment() {
    // Linear-HDR overcast sky supplies broad reflections to glass and wet metal.
    // This probe is made once per flight, not regenerated as the camera moves.
    const width = 128,
      height = 64,
      data = new Float32Array(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const up = Math.cos(((y + 0.5) / height) * Math.PI);
        const cloud = 0.82 + 0.18 * Math.sin(x * 0.13 + Math.sin(y * 0.4));
        const moon = Math.exp(-((x - 29) ** 2 / 80 + (y - 16) ** 2 / 34));
        const sky = (0.025 + Math.max(0, up) * 0.18) * cloud;
        const i = (y * width + x) * 4;
        data.set([sky * 0.62 + moon * 1.1, sky * 0.8 + moon * 1.25, sky + moon * 1.4, 1], i);
      }
    const environment = new THREE.DataTexture(
      data,
      width,
      height,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    environment.mapping = THREE.EquirectangularReflectionMapping;
    environment.needsUpdate = true;
    this.textures.add(environment);
    this.scene.environment = environment;
  }

  private installLighting() {
    // A fixed-size pool avoids recompiling shaders as lamps enter the view.
    // Only the nearest two lights cast soft shadows; distant lights stay cheap.
    for (let i = 0; i < 6; i++) {
      const light = new THREE.SpotLight(0xffc48c, 210, 27, 1.02, 0.72, 2);
      light.castShadow = i < 2;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.near = 0.4;
      light.shadow.camera.far = 27;
      light.shadow.bias = -0.0003;
      light.shadow.normalBias = 0.045;
      this.streetLights.push(light);
      this.scene.add(light, light.target);
    }
    const beams = this.lamps.map((lamp) => ({ ...lamp, y: lamp.y - 3.3, w: 1, h: 1, d: 1 }));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vPosition;varying vec3 vNormal;varying float vHeight;
      void main(){vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.);vPosition=p.xyz;
      vNormal=normalize(normalMatrix*mat3(instanceMatrix)*normal);vHeight=position.y/6.6+.5;
      gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 vPosition;varying vec3 vNormal;varying float vHeight;
      void main(){float edge=pow(abs(dot(normalize(vNormal),normalize(-vPosition))),2.);
      float vertical=smoothstep(0.,.24,vHeight)*(1.-smoothstep(.8,1.,vHeight));
      gl_FragColor=vec4(.85,.56,.3,edge*vertical*.065);
      #include <colorspace_fragment>
      }`,
    });
    this.blocks(beams, material, new THREE.ConeGeometry(4.2, 6.6, 24, 1, true));
  }

  private updateLighting(x: number, z: number) {
    // The six-light pool changes beyond illumination range. Its two shadow
    // slots change closer to the camera: fade shadows at a distance tie so
    // switching lamps never produces a hard, visible shadow pop.
    const nearby = this.lamps
      .map((lamp) => ({ lamp, distance: (lamp.x - x) ** 2 + (lamp.z - z) ** 2 }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 6);
    this.streetLights.forEach((light, i) => {
      const lamp = nearby[i]?.lamp;
      if (!lamp) {
        light.intensity = 0;
        return;
      }
      light.position.set(lamp.x, lamp.y - 0.06, lamp.z);
      light.target.position.set(lamp.x, -0.2, lamp.z);
      this.lightPositions.value[i].copy(light.position);
      if (i < 2) {
        const nextDistance = Math.sqrt(nearby[2]?.distance ?? Infinity);
        light.shadow.intensity = smooth(0, 5, nextDistance - Math.sqrt(nearby[i].distance));
      }
    });
  }

  private lampHalos(lamps: Block[]) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv;varying float vFade;
      void main(){vUv=uv;vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      center.xy+=position.xy*4.8;vFade=exp(-max(0.,-center.z)*.012);
      gl_Position=projectionMatrix*center;}`,
      fragmentShader: `varying vec2 vUv;varying float vFade;
      void main(){vec2 p=vUv-.5;float r=length(p)*2.;float glow=exp(-r*7.)*(1.-smoothstep(.6,1.,r));
      float streak=exp(-abs(p.y)*150.)*exp(-abs(p.x)*12.);
      gl_FragColor=vec4(1.2,.64,.24,(glow*.72+streak*.12)*vFade);
      #include <colorspace_fragment>
      }`,
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
    mesh.castShadow = material instanceof THREE.MeshStandardMaterial && !material.transparent;
    mesh.receiveShadow = mesh.castShadow;
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
    this.reflectionTexel.value.set(
      1 / Math.max(128, Math.round(width * scale * 0.55)),
      1 / Math.max(128, Math.round(height * scale * 0.55)),
    );
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
    this.updateLighting(state.x, state.z);
    this.destruction.forEach(({ mesh, fragments }) => {
      fragments.forEach((fragment, i) => {
        const pose = fragmentAt(fragment, t),
          object = this.debrisPose;
        object.position.set(pose.x, pose.y, pose.z);
        object.rotation.set(0, pose.yaw, pose.tilt);
        object.scale.set(fragment.w, fragment.h, fragment.d);
        object.updateMatrix();
        mesh.setMatrixAt(i, object.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.streetLights.forEach((light) => light.shadow.dispose());
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.reflection?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
