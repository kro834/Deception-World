export const BUTTON_STYLE_STORAGE_KEY = "dw-button-style";
export const BUTTON_STYLE_ATTRIBUTE = "data-button-style";

/** Applied while <head> is parsed (before first paint): only "liquid" sets the attribute. */
export const BUTTON_STYLE_SCRIPT = `(function(){try{var r=document.documentElement;if(window.localStorage.getItem(${JSON.stringify(BUTTON_STYLE_STORAGE_KEY)})==="liquid")r.setAttribute(${JSON.stringify(BUTTON_STYLE_ATTRIBUTE)},"liquid");else r.removeAttribute(${JSON.stringify(BUTTON_STYLE_ATTRIBUTE)});}catch(_){}})();`;

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
    if (event.key !== null && event.key !== BUTTON_STYLE_STORAGE_KEY) return;
    applyButtonStyle(readButtonStyle());
    notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("dw-button-style-change", notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("dw-button-style-change", notify);
  };
}
