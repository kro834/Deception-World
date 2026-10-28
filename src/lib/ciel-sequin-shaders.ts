import { SEQUIN_SPRING } from "./ciel-sequin-physics.ts";

export const CIEL_SEQUIN_VERTEX = /* glsl */ `
attribute vec2 aCenter;
attribute vec2 aAxis;
attribute vec4 aMotion;
attribute float aSeed;
attribute float aWall;
attribute float aFace;
uniform float uTime;
uniform float uRadius;
uniform vec2 uSize;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vLocal;
varying float vSeed;
varying float vWall;
varying float vFace;
varying float vBackExposure;
varying vec3 vTangent;
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
 vTangent=turn(vec3(cos(aSeed*.24),sin(aSeed*.24),0.),axis,angle);
 vWorld=p;vLocal=position.xy;vSeed=aSeed;vWall=aWall;vFace=aFace;
 // Let the printed back extend over its bevel as it seats. Adjacent raised
 // lips can otherwise occlude the photo cap and leave periodic dark dots.
 vBackExposure=smoothstep(.97,.999,-cos(angle));
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}
`;
export const CIEL_SEQUIN_FRAGMENT = /* glsl */ `
uniform sampler2D uImage;
uniform sampler2D uStudio;
uniform float uStudioReady;
uniform float uImageReady;
uniform vec4 uImageRect;
uniform vec3 uLight;
uniform vec2 uSize;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vLocal;
varying float vSeed;
varying float vWall;
varying float vFace;
varying float vBackExposure;
varying vec3 vTangent;
// A broad studio remains available before the optional Blender map loads.
// Reflections are spatial, never time-driven, so settled scales can sleep.
vec3 studio(vec3 r){
 float ceiling=pow(max(0.,dot(r,normalize(vec3(-.35,.8,.45)))),4.);
 float strip=exp(-18.*pow(r.x+.38,2.))*smoothstep(-.4,.6,r.y);
 float warm=pow(max(0.,dot(r,normalize(vec3(.8,-.2,.35)))),9.);
 vec3 fallback=vec3(.025,.045,.038)+vec3(.24,.29,.28)*ceiling+vec3(.24,.27,.25)*strip+vec3(.1,.065,.025)*warm;
 // Aim a resting disc near the large neutral softbox edge, rather than the
 // black studio horizon. The fixed orientation also makes the bevel sweep
 // across the real lights as a scale turns, with no extra animation.
 vec3 pitched=vec3(r.x,.900447*r.y+.434966*r.z,-.434966*r.y+.900447*r.z);
 vec3 room=vec3(-.227202*pitched.x+.973848*pitched.z,pitched.y,-.973848*pitched.x-.227202*pitched.z);
 vec2 uv=vec2(atan(room.z,room.x)*.159154943+.5,asin(clamp(room.y,-1.,1.))*.318309886+.5);
 // Authored softboxes are already broad; a single texture lookup keeps the
 // full-screen instance field within its mobile fill-rate budget.
 return mix(fallback,texture2D(uStudio,uv,2.).rgb,uStudioReady);
}
vec3 fresnel(vec3 f0,float vh){return f0+(1.-f0)*pow(1.-clamp(vh,0.,1.),5.);}
// Anisotropic GGX distribution with height-correlated Smith visibility.
// The brush direction follows the physical disc as its spring rotates.
vec3 brushedSpecular(vec3 n,vec3 t,vec3 b,vec3 l,vec3 v,vec3 f0,vec2 rough){
 vec3 h=normalize(l+v);
 float nl=max(0.,dot(n,l)),nv=max(.001,dot(n,v)),nh=max(0.,dot(n,h));
 vec3 q=vec3(dot(t,h)/rough.x,dot(b,h)/rough.y,nh);
 float q2=dot(q,q);
 float distribution=1./max(.0001,3.14159265*rough.x*rough.y*q2*q2);
 float gv=nl*length(vec3(rough.x*dot(t,v),rough.y*dot(b,v),nv));
 float gl=nv*length(vec3(rough.x*dot(t,l),rough.y*dot(b,l),nl));
 float visibility=.5/max(.001,gv+gl);
 return fresnel(f0,max(0.,dot(v,h)))*distribution*visibility*nl;
}
void main(){
 // A closed disc has explicit material sides: both caps are front-facing
 // from their exterior. Do not use winding to select the photograph.
 if(vFace<-.5){
  // Post-rotation screen coordinates keep every photo fragment continuous,
  // including at 180 degrees; there is no tile-local mirror or relighting.
  vec2 uv=(vWorld.xy-uImageRect.xy)/uImageRect.zw;
  float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
  vec3 photo=texture2D(uImage,clamp(uv,0.,1.)).rgb;
  photo=mix(vec3(.012,.018,.022),photo,inside*uImageReady);
  gl_FragColor=vec4(photo,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  return;
 }
 float rimPhotoWeight=vWall*vBackExposure;
 vec3 rimPhoto=vec3(0.);
 if(rimPhotoWeight>0.){
  vec2 uv=(vWorld.xy-uImageRect.xy)/uImageRect.zw;
  float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
  rimPhoto=mix(vec3(.012,.018,.022),texture2D(uImage,clamp(uv,0.,1.)).rgb,inside*uImageReady);
  if(rimPhotoWeight>.999){
   gl_FragColor=vec4(rimPhoto,1.);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   return;
  }
 }
 vec3 n=normalize(vNormal);
 if(!gl_FrontFacing)n=-n;
 float radius=length(vLocal);
 // Geometry supplies the dish, rounded bevel and sidewall normals. Build a
 // tangent frame without singularities on a vertical section of the rim.
 vec3 tangent=vTangent-n*dot(n,vTangent);
 if(dot(tangent,tangent)<.001)tangent=cross(n,vec3(0.,0.,1.));
 vec3 t=normalize(tangent),b=normalize(cross(n,t));
 float groove=vLocal.y*180.+vSeed*6.283185;
 float resolved=1.-smoothstep(.45,2.8,fwidth(groove));
 float grain=sin(groove)*resolved;
 // Sub-pixel brush marks fade away rather than sparkle or form a moire.
 n=normalize(n+b*grain*.018*(1.-vWall));
 vec3 light=normalize(uLight-vWorld);
 vec3 view=vec3(0.,0.,1.);
 float diffuse=max(0.,dot(n,light)),nv=max(0.,dot(n,view));
 vec3 f0=mix(vec3(.48,.58,.52),vec3(.61,.66,.60),vSeed*.45);
 vec2 rough=mix(vec2(.38,.19),vec2(.25,.22),vWall);
 rough*=.94+vSeed*.12;
 vec3 spec=brushedSpecular(n,t,b,light,view,f0,rough);
 // A large, soft source is represented by the broad GGX lobe. Compress only
 // its direct highlight, not the image, to retain detail under the cursor.
 spec=spec/(1.+spec*.8);
 vec3 reflected=studio(reflect(-view,n));
 vec3 color=vec3(.025,.051,.04)*(.65+.35*diffuse);
 color+=reflected*fresnel(f0,nv)*(.72-.12*vWall);
 color+=spec*vec3(.30,.33,.31);
 color*=.96+grain*.025;
 // The stamped lip has a narrow contact recess, followed by the actual
 // reflective bevel. This avoids painting dark borders onto the photo.
 float recess=smoothstep(.78,.86,radius)*(1.-smoothstep(.88,.94,radius));
 color*=1.-recess*.16;
 float pinDistance=length(vLocal-vec2(0.,.74));
 float pin=1.-smoothstep(.023,.045,pinDistance);
 float pinLip=smoothstep(.025,.043,pinDistance)*(1.-smoothstep(.045,.062,pinDistance));
 color=color*(1.-pin*.66)+vec3(.035,.042,.038)*pinLip;
 // Only the last few degrees wrap the print across the edge; the moving
 // sidewall retains its metal and thickness throughout the main flip.
 color=mix(color,rimPhoto,rimPhotoWeight);
 gl_FragColor=vec4(color,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;
