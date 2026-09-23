/**
 * Inline head script for /world. It runs while the server HTML is parsed, so
 * it decides before the first paint whether the CSS-only Mirage boot may
 * play. The boot stays quiet (html[data-mirage-quiet]) on lightweight
 * renderers (the same rules as prefersLightweightRendering in
 * rendering-profile.js), after the first boot of the session, on a hash
 * landing and on a rider-return. Without it those loads would start the boot
 * and snap it off at hydration.
 *
 * Keep the device rules in step with rendering-profile.js;
 * scripts/world-mirage.test.mjs checks the two against each other.
 */
export const MIRAGE_BOOT_KEY = "deception-world:mirage-boot:v1";

export const MIRAGE_BOOT_GATE_SCRIPT = `(function () {
  var d = document.documentElement;
  var quiet = false;
  try {
    var n = navigator;
    var u = n.userAgent || "";
    var c = n.connection || {};
    var mobile = /iPhone|iPad|iPod/.test(u);
    var apple = 0;
    if (mobile || (/Macintosh/.test(u) && (n.maxTouchPoints || 0) > 1)) {
      var safari = u.match(/Version\\/(\\d+)(?:\\.|\\s|$)/);
      var os = mobile ? u.match(/OS (\\d+)(?:_|\\s|;|$)/) : null;
      apple = safari ? Number(safari[1]) : os ? Number(os[1]) : 0;
    }
    quiet =
      apple === 18 ||
      /Android/i.test(u) ||
      c.saveData === true ||
      c.effectiveType === "slow-2g" ||
      c.effectiveType === "2g" ||
      (n.deviceMemory !== undefined && n.deviceMemory <= 2) ||
      ((n.hardwareConcurrency || 0) > 0 && n.hardwareConcurrency <= 2);
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
