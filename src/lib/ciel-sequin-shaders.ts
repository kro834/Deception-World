import { SEQUIN_SPRING } from "./ciel-sequin-physics.ts";

export const CIEL_SEQUIN_VERTEX = /* glsl */ `
attribute vec2 aCenter;
attribute vec2 aAxis;
attribute vec4 aMotion;
attribute float aSeed;
attribute float aWall;
uniform float uTime;
uniform float uRadius;
uniform vec2 uSize;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vLocal;
varying float vSeed;
varying float vWall;
vec3 turn(vec3 v,vec3 axis,float a){return v*cos(a)+cross(axis,v)*sin(a)+axis*dot(axis,v)*(1.-cos(a));}
void main(){
 float t=max(0.,uTime-aMotion.w);
 float d=${SEQUIN_SPRING.omega * SEQUIN_SPRING.damping};
 float w=${SEQUIN_SPRING.omega * Math.sqrt(1 - SEQUIN_SPRING.damping ** 2)};
 float a=aMotion.x-aMotion.z,b=(aMotion.y+d*a)/w;
 float angle=t>=${SEQUIN_SPRING.settle}?aMotion.z:aMotion.z+exp(-d*t)*(a*cos(w*t)+b*sin(w*t));
 vec3 axis=vec3(aAxis,0.);
 vec3 p=turn(position*uRadius,axis,angle);
 p.xy+=aCenter;
 // Tiny fixed row-depth prevents coplanar neighbouring rim flicker.
 p.z+=aSeed*.06;
 vNormal=turn(normal,axis,angle);
 vWorld=p;vLocal=position.xy;vSeed=aSeed;vWall=aWall;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}
`;
export const CIEL_SEQUIN_FRAGMENT = /* glsl */ `
uniform sampler2D uImage;
uniform float uImageReady;
uniform vec4 uImageRect;
uniform vec3 uLight;
uniform vec2 uSize;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vLocal;
varying float vSeed;
varying float vWall;
void main(){
 vec3 n=normalize(vNormal);
 if(!gl_FrontFacing)n=-n;
 float radius=length(vLocal);
 // A bevel and pressed facets catch the moving light independently.
 n=normalize(n+vec3(vLocal*.12*smoothstep(.68,1.,radius),0.));
 vec3 light=normalize(uLight-vWorld);
 vec3 halfLight=normalize(light+vec3(0.,0.,1.));
 float diffuse=max(0.,dot(n,light));
 float spec=pow(max(0.,dot(n,halfLight)),54.+vSeed*80.);
 float fine=pow(max(0.,dot(n,normalize(vec3(-.6,.7,1.)))),24.);
 vec3 front=mix(vec3(.045,.11,.095),vec3(.35,.48,.41),vSeed*.65);
 front=front*(.55+diffuse*.8)+vec3(.82,.96,.87)*spec*1.15+vec3(.47,.34,.13)*fine*.2;
 // Project through screen space after rotation: each backside shares one
 // continuous photograph, with no per-tile mirroring at its final seat.
 vec2 uv=(vWorld.xy-uImageRect.xy)/uImageRect.zw;
 float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
 vec3 photo=texture2D(uImage,clamp(uv,0.,1.)).rgb;
 photo=mix(vec3(.012,.018,.022),photo,inside*uImageReady);
 vec3 back=photo*(.88+.12*diffuse)+vec3(spec*.08);
 vec3 color=gl_FrontFacing?front:back;
 if(vWall>.5)color=vec3(.075,.095,.083)*(.55+diffuse)+vec3(spec*.45);
 float rim=smoothstep(.95,1.,radius);
 color*=1.-rim*.23;
 // The tiny rivet reads as a stitched scale, not an unanchored particle.
 float pin=1.-smoothstep(.035,.07,length(vLocal-vec2(0.,.74)));
 color=mix(color,vec3(.025,.035,.03),pin*.7);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;
