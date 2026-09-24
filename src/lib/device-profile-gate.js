/**
 * Pre-paint device profile. DEVICE_PROFILE_SCRIPT is inlined in the head of
 * every route (src/routes/__root.tsx) and runs while the server HTML is
 * parsed, so the document-level device attributes are on <html> at the first
 * paint and never change after hydration:
 * - data-android-renderer: an Android UA, or Samsung Internet in desktop-site
 *   mode or DeX ("X11; Linux x86_64" with a touch screen);
 * - data-one-ui-renderer: Samsung Internet except for Windows (diagnostics
 *   only, no style depends on it);
 * - data-ios18-renderer: iOS/iPadOS 18;
 * - data-world-effects="economy": the lightweight renderer;
 * - data-native-scroll-progress: reading progress from the compositor
 *   (useWorldMode keeps it in step when reduced motion changes).
 * Written by useWorldMode after hydration they restyled and relaid out the
 * whole document in one forced task (about 250 ms at 4x CPU on a Galaxy
 * profile), and the first paint had none of the Android styling.
 *
 * DEVICE_RULES is shared with the /world boot gate (mirage-boot-gate.js), so
 * the two scripts cannot disagree. It reads `n` (navigator) and declares
 * `apple`, `android`, `oneUi` and `economy`. Its JS twins are in
 * rendering-profile.js; scripts/samsung-internet-profile.test.mjs runs both
 * scripts against them. Keep it ES5: it runs before any polyfill.
 */
export const DEVICE_RULES = `var u = n.userAgent || "";
    var c = n.connection || {};
    var cores = n.hardwareConcurrency || 0;
    var touch = n.maxTouchPoints || 0;
    var mobile = /iPhone|iPad|iPod/.test(u);
    var apple = 0;
    if (mobile || (/Macintosh/.test(u) && touch > 1)) {
      var safari = u.match(/Version\\/(\\d+)(?:\\.|\\s|$)/);
      var os = mobile ? u.match(/OS (\\d+)(?:_|\\s|;|$)/) : null;
      apple = safari ? Number(safari[1]) : os ? Number(os[1]) : 0;
    }
    var samsung = /SamsungBrowser\\/\\d+/.test(u);
    var android = /Android/i.test(u) || (samsung && /X11; Linux x86_64/.test(u) && touch > 0);
    var oneUi = samsung && !/Windows NT/.test(u);
    var economy =
      apple === 18 ||
      (android && cores > 0 && cores <= 4) ||
      c.saveData === true ||
      c.effectiveType === "slow-2g" ||
      c.effectiveType === "2g" ||
      (n.deviceMemory !== undefined && n.deviceMemory <= 2) ||
      (cores > 0 && cores <= 2);`;

export const DEVICE_PROFILE_SCRIPT = `(function () {
  var d = document.documentElement;
  try {
    var n = navigator;
    ${DEVICE_RULES}
    if (android) d.setAttribute("data-android-renderer", "true");
    if (oneUi) d.setAttribute("data-one-ui-renderer", "true");
    if (apple === 18) d.setAttribute("data-ios18-renderer", "true");
    if (economy) d.setAttribute("data-world-effects", "economy");
    var css = window.CSS;
    var supports = function (property, value) {
      return Boolean(css && css.supports && css.supports(property, value));
    };
    var reduced = Boolean(
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    var views =
      supports("animation-timeline", "view()") &&
      supports("animation-range", "entry 0% entry 100%");
    if (
      supports("animation-timeline", "scroll(root block)") &&
      !reduced &&
      (android || (apple === 27 && views && !economy))
    )
      d.setAttribute("data-native-scroll-progress", "true");
  } catch (error) {
    /* Without the profile the page still works; it only loses the tuned styling. */
  }
})();`;
