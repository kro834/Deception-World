import { DEVICE_RULES } from "./device-profile-gate.js";

/**
 * Inline head script for /world. It runs while the server HTML is parsed, so
 * it decides before the first paint whether the CSS-only Mirage boot may
 * play. The boot stays quiet (html[data-mirage-quiet]) on lightweight
 * renderers (DEVICE_RULES, shared with the root device profile and twinned by
 * prefersLightweightRendering in rendering-profile.js), after the first boot
 * of the session, on a hash landing and on a rider-return. Without it those
 * loads would start the boot and snap it off at hydration.
 *
 * It also puts the page in world mode (html[data-mode="world"]) before the
 * first paint, so hydration does not flip <body> out of being a scroll
 * container and rebind every view timeline. data-mode-origin="prepaint" tells
 * useWorldMode that this value belongs to /world, not to a page being left.
 *
 * scripts/world-mirage.test.mjs and scripts/samsung-internet-profile.test.mjs
 * check the device rules against rendering-profile.js.
 */
export const MIRAGE_BOOT_KEY = "deception-world:mirage-boot:v1";

export const MIRAGE_BOOT_GATE_SCRIPT = `(function () {
  var d = document.documentElement;
  var quiet = false;
  d.setAttribute("data-mode", "world");
  d.setAttribute("data-mode-origin", "prepaint");
  try {
    var n = navigator;
    ${DEVICE_RULES}
    quiet = economy;
  } catch (error) {
    quiet = false;
  }
  try {
    var store = window.sessionStorage;
    quiet =
      quiet ||
      store.getItem("${MIRAGE_BOOT_KEY}") === "1" ||
      store.getItem("deception-world:rider-return") !== null;
  } catch (error) {
    /* Storage can be blocked; the device rules still apply. */
  }
  if (quiet || window.location.hash) d.setAttribute("data-mirage-quiet", "");
})();`;
