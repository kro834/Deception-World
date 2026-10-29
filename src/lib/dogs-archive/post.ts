import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

/** Grading toward the paintings, applied after tone mapping (display sRGB): ink contour lines
 * from the scene depth (silhouettes and the ribs over the membranes, like a brush outline),
 * ink-lifted blacks, green-biased greys, highlights rolled toward mint, a soft vignette and a
 * static paper grain fixed to the screen like paper, so nothing flickers. */
export class GuardianInkGradePass extends ShaderPass {
  /** Set each frame by the owner to the texture holding this frame's scene depth. */
  depthSource: { sceneDepth: THREE.Texture | null } | null = null;

  constructor(camera: THREE.PerspectiveCamera) {
    super({
      name: "GuardianInkGrade",
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uGrain: { value: 0.03 },
        uVignette: { value: 0.3 },
        uContour: { value: 0.6 },
        uHalo: { value: 12 },
        uNear: { value: camera.near },
        uFar: { value: camera.far },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform sampler2D tDiffuse,tDepth;uniform float uGrain,uVignette,uContour,uHalo,uNear,uFar;uniform vec2 uResolution;varying vec2 vUv;
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float linearDepth(vec2 uv){float d=texture2D(tDepth,uv).r;return -(uNear*uFar)/((uFar-uNear)*d-uFar);}
void main(){
 vec3 c=texture2D(tDiffuse,vUv).rgb;
 vec3 ink=vec3(.014,.032,.024);
 // Contour: depth steps between neighbouring pixels, relative to the depth itself, drawn as
 // a thin ink line (one pixel at the render scale; the sky counts as the far plane).
 vec2 px=1./uResolution;
 float d0=linearDepth(vUv);
 // Only the far side of a step is inked: the line lies outside a pale part (on whatever is
 // behind it), so thin ribs, teeth and rungs keep their full brightness.
 float dn=min(min(linearDepth(vUv+vec2(px.x,0.)),linearDepth(vUv-vec2(px.x,0.))),min(linearDepth(vUv+vec2(0.,px.y)),linearDepth(vUv-vec2(0.,px.y))));
 float step_=max(d0-dn,0.)/max(d0,1.);
 float contour=smoothstep(.012,.04,step_)*(1.-smoothstep(.85,1.,d0/uFar));
 c=mix(c,ink,contour*uContour);
 // Ink halo: the ground just outside the silhouette darkens, as ink pools around a figure,
 // so the body reads against the fire. Background pixels only; the body keeps its colour.
 float halo=0.;
 if(d0>uFar*.9){
  for(int i=0;i<6;i++){
   float ang=float(i)*1.0472;vec2 o=vec2(cos(ang),sin(ang))*px*uHalo;
   halo=max(halo,step(linearDepth(vUv+o),uFar*.9));
   halo=max(halo,step(linearDepth(vUv+o*1.9),uFar*.9)*.62);
   halo=max(halo,step(linearDepth(vUv+o*2.9),uFar*.9)*.3);
  }
 }
 c=mix(c,ink,halo*.6*uContour);
 // A light black lift only: the pits between the ridges stay near-black.
 vec3 lift=ink*.5;
 c=lift+c*(1.-lift);
 float l=dot(c,vec3(.2126,.7152,.0722));
 c=mix(c,c*vec3(.92,1.03,.96),.15);
 c=mix(c,vec3(l)*vec3(.9,1.,.94),(1.-smoothstep(0.,.32,l))*.06);
 c=mix(c,vec3(.86,1.,.88)*l,smoothstep(.75,1.,l)*.1);
 vec2 v=(vUv-.5)*vec2(1.,1.08);
 float vig=smoothstep(1.3,.4,length(v)*1.45);
 c*=mix(1.-uVignette,1.,vig);
 vec2 cell=floor(gl_FragCoord.xy*.5);
 float g=hash(cell)-.5;
 float paper=hash(floor(gl_FragCoord.xy*.06))-.5;
 c+=g*uGrain*(1.-l*.5)+paper*uGrain*.5;
 gl_FragColor=vec4(c,1.);
}`,
    });
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) {
    const depth = this.depthSource?.sceneDepth ?? null;
    this.uniforms.tDepth.value = depth;
    this.uniforms.uContour.value = depth ? 0.6 : 0;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}
