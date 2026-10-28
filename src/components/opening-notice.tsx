import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouterState } from "@tanstack/react-router";
import {
  OPENING_NOTICE_IMAGE,
  OPENING_NOTICE_IMAGE_MS,
  OPENING_NOTICE_TEXT,
  takeOpeningNotice,
} from "@/lib/opening-notice";
import { ZEUS_SURFACE_EVENT } from "@/lib/zeus-surface";

// The notice waits for the opening's handoff, the file shutter and the route
// cover to have left /world, then a beat for the World's first reveal.
const ARRIVAL_SETTLE_MS = 900;
const BUSY_ATTRIBUTES = ["data-opening-handoff-active", "data-loading", "data-route-cover"];

const documentBusy = () => {
  const root = document.documentElement;
  return BUSY_ATTRIBUTES.some((name) => root.hasAttribute(name));
};

/* SCP Foundation wiki grammar: a plain grey slip, a thin rule, a dark header
   strip with a single dark-red mark, Verdana. Inline, so no route pays for a
   stylesheet it never shows. Kept clear of the Zeus button's home on the
   right (x 0.95, y 0.82): it sits at the bottom left and leaves the right
   88px free on a phone. */
const NOTICE_CSS = `
.opening-notice {
  position: fixed;
  left: max(16px, env(safe-area-inset-left));
  bottom: calc(max(16px, env(safe-area-inset-bottom)) + 8px);
  z-index: 75;
  width: min(340px, calc(100vw - 104px));
  box-sizing: border-box;
  border: 1px solid #8f8f8f;
  background: #f2f2f2;
  color: #1e1e1e;
  font-family: Verdana, "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, Arial, sans-serif;
  box-shadow: 0 2px 0 rgb(0 0 0 / 35%), 0 10px 26px rgb(0 0 0 / 45%);
  border-radius: 0;
}
.opening-notice-strip {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 28px;
  border-bottom: 1px solid #5c5c5c;
  background: linear-gradient(#3b3b3b, #2a2a2a);
}
.opening-notice-strip::before {
  content: "";
  flex: none;
  width: 6px;
  height: 100%;
  margin-right: auto;
  background: #7a0f0f;
}
.opening-notice .opening-notice-close {
  all: unset;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: 40px;
  height: 28px;
  color: #d8d8d8;
  font: 400 16px/1 Verdana, Arial, sans-serif;
  cursor: pointer;
}
.opening-notice .opening-notice-close:hover { background: #7a0f0f; color: #fff; }
.opening-notice .opening-notice-open {
  all: unset;
  box-sizing: border-box;
  display: block;
  width: 100%;
  padding: 12px 14px 13px;
  border-left: 6px solid #b9b9b9;
  color: #1e1e1e;
  font-family: inherit;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.6;
  letter-spacing: 0.02em;
  cursor: pointer;
  text-decoration: underline dotted #7a0f0f;
  text-underline-offset: 4px;
}
.opening-notice .opening-notice-open:hover { background: #e8e8e8; color: #7a0f0f; }
.opening-notice :is(.opening-notice-open, .opening-notice-close):focus-visible {
  outline: 2px solid #7a0f0f;
  outline-offset: -2px;
}
.opening-notice-cut {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-items: center;
  background: #000;
  overflow: hidden;
}
.opening-notice-cut .opening-notice-cut-image {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  object-fit: contain;
}
`;

/** Mounted once in the root: shows the notice on /world after the opening. */
export function OpeningNotice() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [state, setState] = useState<"none" | "waiting" | "shown" | "cut">("none");
  const preload = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (takeOpeningNotice(pathname)) setState("waiting");
    else if (pathname !== "/world") setState("none");
  }, [pathname]);

  // Appears only once the World is uncovered.
  useEffect(() => {
    if (state !== "waiting") return;
    let timer: number | null = null;
    const check = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = documentBusy()
        ? null
        : window.setTimeout(() => {
            if (!documentBusy()) setState("shown");
          }, ARRIVAL_SETTLE_MS);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: BUSY_ATTRIBUTES,
    });
    check();
    return () => {
      observer.disconnect();
      if (timer != null) window.clearTimeout(timer);
    };
  }, [state]);

  // Shown: fetch and decode the image now, so a press cuts to it at once.
  // The Zeus button looks again for a spot clear of the notice.
  useEffect(() => {
    if (state !== "shown") return;
    if (!preload.current) {
      const image = new Image();
      image.decoding = "async";
      image.src = OPENING_NOTICE_IMAGE.webp;
      void image.decode?.().catch(() => undefined);
      preload.current = image;
    }
    document.dispatchEvent(new CustomEvent(ZEUS_SURFACE_EVENT));
    return () => {
      document.dispatchEvent(new CustomEvent(ZEUS_SURFACE_EVENT));
    };
  }, [state]);

  const dismiss = useCallback(() => setState("none"), []);

  useEffect(() => {
    if (state !== "shown") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // An open dialog or menu takes its own Escape first.
      if (document.querySelector("dialog[open]")) return;
      if (document.documentElement.dataset.sideMenuOpen === "true") return;
      dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, dismiss]);

  // The cut lasts exactly OPENING_NOTICE_IMAGE_MS, then the notice is gone.
  useEffect(() => {
    if (state !== "cut") return;
    const timer = window.setTimeout(dismiss, OPENING_NOTICE_IMAGE_MS);
    return () => window.clearTimeout(timer);
  }, [state, dismiss]);

  if (state !== "shown" && state !== "cut") return null;
  return (
    <>
      <style>{NOTICE_CSS}</style>
      {state === "shown" ? (
        <aside className="opening-notice" aria-label="お知らせ" aria-live="polite">
          <div className="opening-notice-strip">
            <button
              type="button"
              className="opening-notice-close"
              aria-label="お知らせを閉じる"
              onClick={dismiss}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <button type="button" className="opening-notice-open" onClick={() => setState("cut")}>
            {OPENING_NOTICE_TEXT}
          </button>
        </aside>
      ) : (
        createPortal(
          <div className="opening-notice-cut" aria-hidden="true" data-opening-notice-cut="">
            <picture>
              <source srcSet={OPENING_NOTICE_IMAGE.webp} type="image/webp" />
              <img
                className="opening-notice-cut-image"
                src={OPENING_NOTICE_IMAGE.jpeg}
                alt=""
                width={OPENING_NOTICE_IMAGE.width}
                height={OPENING_NOTICE_IMAGE.height}
                decoding="sync"
              />
            </picture>
          </div>,
          document.body,
        )
      )}
    </>
  );
}
