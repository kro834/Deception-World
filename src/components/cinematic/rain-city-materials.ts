import * as THREE from "three";

export const CITY_MAPS = [
  "concrete-albedo.webp",
  "concrete-normal.png",
  "concrete-roughness.png",
  "asphalt-albedo.webp",
  "asphalt-normal.png",
  "asphalt-roughness.png",
] as const;
export type CitySurfaceImages = ImageBitmap[];

// Preparation owns decoded CPU images; each flight owns its GPU textures. No
// texture swaps during a flight, and a missing bake never prevents navigation.
export async function loadCitySurfaceImages(timeout = 1200): Promise<CitySurfaceImages | null> {
  const controller = new AbortController();
  const images: ImageBitmap[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = Promise.all(
    CITY_MAPS.map(async (name) => {
      const response = await fetch(`/rain-city-materials/${name}`, { signal: controller.signal });
      if (!response.ok) throw new Error("City material unavailable");
      const bitmap = await createImageBitmap(await response.blob(), {
        colorSpaceConversion: "none",
        imageOrientation: "flipY",
      });
      if (controller.signal.aborted) {
        bitmap.close();
        throw new Error("City preparation released");
      }
      images.push(bitmap);
      return bitmap;
    }),
  );
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("City material deadline")), timeout);
      }),
    ]);
  } catch {
    controller.abort();
    images.forEach((image) => image.close());
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function closeCitySurfaceImages(images: CitySurfaceImages | null) {
  images?.forEach((image) => image.close());
}

export function cityTexture(image: ImageBitmap | undefined, fallback: number[], srgb = false) {
  const texture = image
    ? new THREE.Texture(image)
    : new THREE.DataTexture(new Uint8Array(fallback), 1, 1);
  // ImageBitmap was flipped at decode (Texture.flipY cannot flip a bitmap).
  // Data maps remain linear; only albedo is sRGB.
  texture.flipY = false;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// Object-local metre coordinates keep the aggregate at a physical scale and
// attached to flying fragments. Three's corrected vNormal handles nonuniform
// instance scales; surface projections derive from the unscaled face normal.
export function applyCitySurface(
  material: THREE.MeshStandardMaterial,
  maps: THREE.Texture[],
  period: number,
) {
  material.map = maps[0];
  material.normalMap = maps[1];
  material.roughnessMap = maps[2];
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cityPeriod = { value: period };
    shader.vertexShader = "varying vec3 cityLocal; varying vec3 cityFace;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      cityLocal=position; cityFace=normal;
      #ifdef USE_INSTANCING
      cityLocal*=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      #endif`,
    );
    shader.fragmentShader =
      `varying vec3 cityLocal;varying vec3 cityFace;uniform float cityPeriod;
      vec3 cityWeights(){vec3 w=pow(abs(cityFace),vec3(6.));return w/max(.001,w.x+w.y+w.z);}
      vec4 citySample(sampler2D tex){vec3 p=cityLocal/cityPeriod;vec3 w=cityWeights();
      return texture2D(tex,p.zy)*w.x+texture2D(tex,p.xz)*w.y+texture2D(tex,p.xy)*w.z;}
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      diffuseColor*=citySample(map);
      // Slow vertical runoff, not the high-contrast contour noise of the old material.
      float runoff=.94+.06*sin(cityLocal.y*.4+sin(cityLocal.x*2.1+cityLocal.z*1.7));
      diffuseColor.rgb*=runoff;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `
      float roughnessFactor=roughness*citySample(roughnessMap).g;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `
      vec3 detail=citySample(normalMap).xyz*2.-1.;
      // Screen derivatives construct the tangent frame in view space, including
      // the instance's rotation. Tiny stone pits catch light without swimming.
      vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);
      vec3 face=abs(cityFace);vec2 uv=face.x>face.y&&face.x>face.z?cityLocal.zy:(face.y>face.z?cityLocal.xz:cityLocal.xy);
      vec2 st0=dFdx(uv),st1=dFdy(uv);
      vec3 tangent=q0*st1.y-q1*st0.y;vec3 bitangent=-q0*st1.x+q1*st0.x;
      float det=max(dot(tangent,tangent),dot(bitangent,bitangent));
      if(det>1e-10) normal=normalize(normal+(.32*inversesqrt(det))*(tangent*detail.x+bitangent*detail.y));`,
    );
  };
  material.customProgramCacheKey = () => "rain-city-baked-metres-v1";
  return material;
}
