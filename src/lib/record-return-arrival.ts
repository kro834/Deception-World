import { defaultParseSearch } from "@tanstack/react-router";
import { matchesRecordReturnSource, type RecordReturnSource } from "./record-return-state";

/** Restore once after overlays settle. Any new user input owns focus and scroll. */
export function watchRecordReturnArrival(source: RecordReturnSource, scroll: boolean) {
  const root = document.documentElement;
  let frame = 0;
  let settling = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    observer.disconnect();
    window.cancelAnimationFrame(frame);
    window.clearTimeout(settling);
    window.clearTimeout(deadline);
    for (const name of ["pointerdown", "wheel", "keydown", "touchstart"])
      document.removeEventListener(name, stop, true);
  };
  const onSource = () =>
    matchesRecordReturnSource(source, {
      pathname: window.location.pathname,
      search: defaultParseSearch(window.location.search),
    });
  const covered = () =>
    root.hasAttribute("data-loading") ||
    root.hasAttribute("data-route-cover") ||
    root.hasAttribute("data-route-scroll-settling") ||
    root.hasAttribute("data-dialog-open") ||
    Boolean(document.querySelector('dialog[open], .side-panel[data-open="true"]'));
  const candidate = () =>
    document.getElementById(source.cardId) ??
    document.getElementById(
      source.pathname === "/search" ? "record-results-heading" : "library-browser-title",
    );
  const restore = () => {
    settling = 0;
    if (!onSource()) {
      stop();
      return;
    }
    if (covered()) return;
    const target = candidate();
    if (
      !target ||
      !target.getClientRects().length ||
      target.closest('[inert], [aria-hidden="true"]')
    )
      return;
    const isCard = target.id === source.cardId;
    const ownTab = !target.matches("a[href],button,input,select,textarea,summary,[tabindex]");
    if (ownTab) {
      target.tabIndex = -1;
      target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
    }
    // Native Back retains the router's restored offset. An absent saved card
    // moves focus to the results heading without a surprise jump to the top.
    if (scroll && isCard) target.scrollIntoView({ block: "center", behavior: "instant" });
    target.focus({ preventScroll: true });
    stop();
  };
  const check = () => {
    frame = 0;
    if (!onSource()) {
      stop();
      return;
    }
    if (covered() || !candidate()) return;
    window.clearTimeout(settling);
    settling = window.setTimeout(restore, 240);
  };
  const schedule = () => {
    if (!stopped && !frame) frame = window.requestAnimationFrame(check);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "data-loading",
      "data-route-cover",
      "data-route-scroll-settling",
      "data-dialog-open",
      "data-open",
      "open",
      "inert",
      "aria-hidden",
    ],
  });
  const deadline = window.setTimeout(stop, 15_000);
  for (const name of ["pointerdown", "wheel", "keydown", "touchstart"])
    document.addEventListener(name, stop, { capture: true, passive: true });
  schedule();
  return stop;
}
