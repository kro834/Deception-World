import * as THREE from "three";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

/** Grading toward the paintings, applied after tone mapping (display sRGB): ink-lifted blacks,
 * green-biased greys, highlights rolled toward mint, a soft vignette and a static paper grain.
 * The grain is fixed to the screen like paper, so nothing flickers. */
export function createInkGradePass() {
  const pass = new ShaderPass({
    name: "GuardianInkGrade",
    uniforms: {
      tDiffuse: { value: null },
      uGrain: { value: 0.03 },
      uVignette: { value: 0.3 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform sampler2D tDiffuse;uniform float uGrain,uVignette;uniform vec2 uResolution;varying vec2 vUv;
float hash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
void main(){
 vec3 c=texture2D(tDiffuse,vUv).rgb;
 vec3 ink=vec3(.014,.032,.024);
 c=ink+c*(1.-ink);
 float l=dot(c,vec3(.2126,.7152,.0722));
 c=mix(c,c*vec3(.92,1.03,.96),.3);
 // Dark tones settle toward ink grey-green; highlights roll toward paper mint.
 c=mix(c,vec3(l)*vec3(.9,1.,.94),(1.-smoothstep(0.,.32,l))*.4);
 c=mix(c,vec3(.86,1.,.88)*l,smoothstep(.75,1.,l)*.2);
 vec2 v=(vUv-.5)*vec2(1.,1.08);
 float vig=smoothstep(1.35,.4,length(v)*1.45);
 c*=mix(1.-uVignette,1.,vig);
 vec2 cell=floor(gl_FragCoord.xy*.5);
 float g=hash(cell)-.5;
 float paper=hash(floor(gl_FragCoord.xy*.06))-.5;
 c+=g*uGrain*(1.-l*.5)+paper*uGrain*.5;
 gl_FragColor=vec4(c,1.);
}`,
  });
  return pass;
}
