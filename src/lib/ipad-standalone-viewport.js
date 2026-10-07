/** Reserve the native status area on iPad before first paint, in Safari tabs
 * as well as installed apps. iPhone/Android retain their edge-to-edge layout. */
export const IPAD_STANDALONE_VIEWPORT_SCRIPT = `(function () {
  var n = window.navigator;
  var ipad = /iPad/.test(n.userAgent || "") ||
    (/Macintosh/.test(n.userAgent || "") && n.maxTouchPoints > 1);
  var installed = n.standalone === true ||
    Boolean(window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  if (!ipad) return;
  function reserveStatusArea() {
    var viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return;
    var content = viewport.getAttribute("content") || "";
    var contained = /viewport-fit\\s*=/i.test(content)
      ? content.replace(/viewport-fit\\s*=\\s*[^,;\\s]+/i, "viewport-fit=contain")
      : content + ", viewport-fit=contain";
    if (contained !== content) viewport.setAttribute("content", contained);
  }
  reserveStatusArea();
  // The router may replace head metadata on soft navigation. Reapply in the
  // mutation microtask, without changing scroll positions or creating a loop.
  if (window.MutationObserver) {
    new window.MutationObserver(reserveStatusArea).observe(document.head, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["content"]
    });
  }
  document.documentElement.setAttribute("data-ipad-viewport", "contained");
  // Match the hydrated controller's personal default before the first paint.
  // Do not write storage merely for opening the page or replace an explicit OFF.
  var compact = true;
  try { compact = window.localStorage.getItem("dw-ipad-compact-menu-v1") !== "0"; } catch (_) {}
  document.documentElement.setAttribute("data-ipad-menu-preference", compact ? "on" : "off");
  if (compact) document.documentElement.setAttribute("data-ipad-menu", "compact");
  if (installed) document.documentElement.setAttribute("data-ipad-standalone-viewport", "contained");
})();`;
