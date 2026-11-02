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

/** @param {"liquid" | "default"} style */
export function applyButtonStyle(style) {
  if (typeof document === "undefined") return;
  if (style === "liquid") document.documentElement.dataset.buttonStyle = "liquid";
  else delete document.documentElement.dataset.buttonStyle;
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
