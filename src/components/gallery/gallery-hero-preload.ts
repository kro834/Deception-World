import { GALLERY_DEFAULT_ARTWORK } from "./gallery-data.ts";
import { GALLERY_FEATURE_KEY } from "./gallery-feature.ts";
import { galleryStageSizes } from "./gallery-image-delivery.ts";

const artwork = GALLERY_DEFAULT_ARTWORK;

// This runs in the initial document head, before hydration. A personal choice
// stays private to this browser and never gets embedded in server HTML.
// Later SPA/history entries already own their preview and must not warm default.
export const GALLERY_HERO_PRELOAD_SCRIPT = `(function(){
  if(document.readyState!=="loading"||location.pathname.replace(/\\/+$/,"")!=="/gallery")return;
  var choice;
  try{choice=localStorage.getItem(${JSON.stringify(GALLERY_FEATURE_KEY)});}catch(_){return;}
  if(choice&&choice!==${JSON.stringify(artwork.id)})return;
  if(document.querySelector('link[data-gallery-hero-preload]'))return;
  var hint=document.createElement("link");
  hint.rel="preload";hint.as="image";hint.type="image/webp";
  hint.href=${JSON.stringify(artwork.medium)};
  hint.setAttribute("imagesrcset",${JSON.stringify(artwork.fullSrcSet ?? artwork.srcSet)});
  hint.setAttribute("imagesizes",${JSON.stringify(galleryStageSizes(artwork.width, artwork.height))});
  hint.setAttribute("fetchpriority","high");
  hint.setAttribute("data-gallery-hero-preload",${JSON.stringify(artwork.id)});
  document.head.appendChild(hint);
})();`;
