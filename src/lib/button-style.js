export const BUTTON_STYLE_STORAGE_KEY = "dw-button-style";
export const BUTTON_STYLE_ATTRIBUTE = "data-button-style";

export const GLASS_VARIANT_STORAGE_KEY = "dw-glass-variant";
export const GLASS_VARIANT_ATTRIBUTE = "data-glass-variant";

export const LIQUID_LENS_ATTRIBUTE = "data-liquid-lens";

/** Applied while <head> is parsed (before first paint): only "liquid" sets the
    style attribute, and only "tinted" the glass's variant (Clear, the
    default, sets nothing). With "liquid" it also decides the lens
    (html[data-liquid-lens]) with lensSupported()'s checks in
    src/lib/liquid-glass.ts (a Chromium that draws url() in backdrop-filter)
    and the defs' reduced-transparency check, so the material does not change
    once the page has hydrated. Economy is the sheet's own guard. */
export const BUTTON_STYLE_SCRIPT = `(function(){try{var r=document.documentElement,s=window.localStorage;if(s.getItem(${JSON.stringify(BUTTON_STYLE_STORAGE_KEY)})==="liquid"){r.setAttribute(${JSON.stringify(BUTTON_STYLE_ATTRIBUTE)},"liquid");try{var n=navigator.userAgentData,w=window;if(n&&Array.isArray(n.brands)&&w.CSS&&CSS.supports&&CSS.supports("backdrop-filter","url(#a) blur(1px)")&&!(w.matchMedia&&w.matchMedia("(prefers-reduced-transparency: reduce)").matches))r.setAttribute(${JSON.stringify(LIQUID_LENS_ATTRIBUTE)},"");}catch(_){}}else r.removeAttribute(${JSON.stringify(BUTTON_STYLE_ATTRIBUTE)});if(s.getItem(${JSON.stringify(GLASS_VARIANT_STORAGE_KEY)})==="tinted")r.setAttribute(${JSON.stringify(GLASS_VARIANT_ATTRIBUTE)},"tinted");else r.removeAttribute(${JSON.stringify(GLASS_VARIANT_ATTRIBUTE)});}catch(_){}})();`;

/** @param {string | null | undefined} value */
export function normalizeButtonStyle(value) {
  return value === "liquid" ? "liquid" : "default";
}

export function readButtonStyle() {
  try {
    return normalizeButtonStyle(window.localStorage.getItem(BUTTON_STYLE_STORAGE_KEY));
  } catch {
    return "default";
  }
}

/* Owner (2026-11-20): the glass's three sheets (about 160 KB) are no longer
   linked on every page. The head script below links them, in their own place
   in the cascade, only when the option is on. */
export const LIQUID_GLASS_SHEETS_GLOBAL = "__dwLiquidGlassSheets";

/** The head script that owns the glass's stylesheet links. It runs after
    BUTTON_STYLE_SCRIPT, while <head> is parsed. With the option on it links
    the sheets at once, before `before` (the sheet that follows the glass in
    the cascade), marked render-blocking, so the first paint already has them.
    It also leaves a loader on window for the side menu's switch: the loader
    links the sheets once and calls back when all three have loaded.
    @param {readonly string[]} sheets @param {string} before */
export function liquidGlassSheetsScript(sheets, before) {
  return `(function(u,b){try{var d=document,w=window,k=${JSON.stringify(LIQUID_GLASS_SHEETS_GLOBAL)},s=null;if(w[k])return;w[k]=function(done){try{var i,a=null,l,e,p;if(!s){s=[];l=d.querySelectorAll('link[rel="stylesheet"]');for(i=0;i<l.length;i++)if(l[i].getAttribute("href")===b){a=l[i];break}p=a?a.parentNode:d.head;for(i=0;i<u.length;i++){e=d.createElement("link");e.rel="stylesheet";e.setAttribute("data-precedence","default");e.setAttribute("data-liquid-glass-sheet","");e.setAttribute("blocking","render");e.href=u[i];p.insertBefore(e,a);s.push(e)}}if(!done)return;var n=0,c=false,f=function(){if(!c){c=true;done()}},g=function(){if(++n>=s.length)f()};for(i=0;i<s.length;i++){if(s[i].sheet)n++;else{s[i].addEventListener("load",g);s[i].addEventListener("error",g)}}if(n>=s.length)f();else w.setTimeout(f,4000)}catch(_){if(done)done()}};if(d.documentElement.getAttribute(${JSON.stringify(BUTTON_STYLE_ATTRIBUTE)})==="liquid")w[k]()}catch(_){}})(${JSON.stringify(sheets)},${JSON.stringify(before)});`;
}

/* The style the page should end on. A switch flipped back before the sheets
   have arrived must not turn the glass on afterwards. */
let wantedButtonStyle = "default";

/** @param {"liquid" | "default"} style */
export function applyButtonStyle(style) {
  if (typeof document === "undefined") return;
  wantedButtonStyle = style === "liquid" ? "liquid" : "default";
  if (style !== "liquid") {
    delete document.documentElement.dataset.buttonStyle;
    return;
  }
  if (document.documentElement.dataset.buttonStyle === "liquid") return;
  const turnOn = () => {
    if (wantedButtonStyle !== "liquid") return;
    document.documentElement.dataset.buttonStyle = "liquid";
  };
  /** @type {unknown} */
  const load = /** @type {any} */ (window)[LIQUID_GLASS_SHEETS_GLOBAL];
  if (typeof load !== "function") {
    turnOn();
    return;
  }
  // The attribute waits for the sheets: other sheets and the lens read it,
  // and the glass must not be half-dressed for a frame. Already loaded, the
  // loader calls back at once, so the switch stays synchronous.
  let waited = false;
  let settled = false;
  load(() => {
    settled = true;
    turnOn();
    if (waited) window.dispatchEvent(new Event("dw-button-style-change"));
  });
  waited = !settled;
}

/** @param {"liquid" | "default"} style */
export function setButtonStyle(style) {
  const next = normalizeButtonStyle(style);
  try {
    if (next === "liquid") window.localStorage.setItem(BUTTON_STYLE_STORAGE_KEY, "liquid");
    else window.localStorage.removeItem(BUTTON_STYLE_STORAGE_KEY);
  } catch {
    /* storage denied: the style still applies for this page view */
  }
  applyButtonStyle(next);
  window.dispatchEvent(new Event("dw-button-style-change"));
}

/** The attribute is the single source of truth, so the snapshot is a primitive. */
export function getButtonStyleSnapshot() {
  if (typeof document === "undefined") return "default";
  return document.documentElement.dataset.buttonStyle === "liquid" ? "liquid" : "default";
}

export const getButtonStyleServerSnapshot = () => "default";

/** Follows other tabs: a storage event re-applies the stored value. @param {() => void} notify */
export function subscribeButtonStyle(notify) {
  const onStorage = (/** @type {StorageEvent} */ event) => {
    if (
      event.key !== null &&
      event.key !== BUTTON_STYLE_STORAGE_KEY &&
      event.key !== GLASS_VARIANT_STORAGE_KEY
    )
      return;
    applyButtonStyle(readButtonStyle());
    applyGlassVariant(readGlassVariant());
    notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("dw-button-style-change", notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("dw-button-style-change", notify);
  };
}

/* The glass's variant (iOS 26.1's Settings > Display & Brightness choice:
   Clear, the original, or Tinted, "greater opacity and contrast"). Read by
   the sheet only while the liquid style is on. */

/** @param {string | null | undefined} value */
export function normalizeGlassVariant(value) {
  return value === "tinted" ? "tinted" : "clear";
}

/** @param {"clear" | "tinted"} variant */
function applyGlassVariant(variant) {
  if (typeof document === "undefined") return;
  if (variant === "tinted") document.documentElement.dataset.glassVariant = "tinted";
  else delete document.documentElement.dataset.glassVariant;
}

/** @param {"clear" | "tinted"} variant */
export function setGlassVariant(variant) {
  const next = normalizeGlassVariant(variant);
  try {
    if (next === "tinted") window.localStorage.setItem(GLASS_VARIANT_STORAGE_KEY, "tinted");
    else window.localStorage.removeItem(GLASS_VARIANT_STORAGE_KEY);
  } catch {
    /* storage denied: the variant still applies for this page view */
  }
  applyGlassVariant(next);
  window.dispatchEvent(new Event("dw-button-style-change"));
}

export function readGlassVariant() {
  try {
    return normalizeGlassVariant(window.localStorage.getItem(GLASS_VARIANT_STORAGE_KEY));
  } catch {
    return "clear";
  }
}

export function getGlassVariantSnapshot() {
  if (typeof document === "undefined") return "clear";
  return document.documentElement.dataset.glassVariant === "tinted" ? "tinted" : "clear";
}

export const getGlassVariantServerSnapshot = () => "clear";
