import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useLoadGate } from "@/components/load-gate";
import { createCinemaExit, shouldAnimateCinemaClick } from "@/lib/external-cinema-exit.js";
import cinemaExitCss from "./external-cinema-link.css?url";

const CINEMA_PATH = "/saga-cinema";
const CINEMA_ASSETS = [
  "/saga-cinema-assets/chapter-4.jpg",
  "/saga-cinema-assets/saga-logo-original.webp",
] as const;

export function CinemaLink({
  beforeNavigate,
  active = false,
}: {
  beforeNavigate?: () => void;
  active?: boolean;
}) {
  const { go } = useLoadGate();
  const [exiting, setExiting] = useState(false);
  const keyboardNavigationRef = useRef(false);
  const exitRef = useRef<ReturnType<typeof createCinemaExit> | null>(null);

  useEffect(() => {
    const exit = createCinemaExit({
      onActive: setExiting,
      navigate: () => {
        void go({
          to: CINEMA_PATH,
          hash: "top",
          assets: CINEMA_ASSETS,
          focusDestination: keyboardNavigationRef.current,
        });
      },
    });
    exitRef.current = exit;
    return () => {
      exitRef.current = null;
      exit.dispose();
    };
  }, [go]);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldAnimateCinemaClick(event)) return;
    keyboardNavigationRef.current = event.detail === 0;
    // Only take over once the effect is ready and motion is allowed. The
    // href remains the immediate fallback for hydration and quiet modes.
    event.preventDefault();
    event.stopPropagation();
    if (active || !exitRef.current?.begin()) {
      void go({
        to: CINEMA_PATH,
        hash: "top",
        assets: CINEMA_ASSETS,
        focusDestination: event.detail === 0,
      });
    }
    beforeNavigate?.();
  };

  return (
    <>
      <link rel="stylesheet" href={cinemaExitCss} precedence="default" />
      <a
        href={`${CINEMA_PATH}#top`}
        className="side-panel-cinema-link"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
      >
        <span>映画四部作「仮面ライダーサーガ」</span>
        <i>本編リメイク</i>
      </a>
      {exiting &&
        createPortal(
          <div className="external-cinema-exit" aria-hidden="true">
            <div className="external-cinema-exit-curtain" />
            <div className="external-cinema-exit-title">
              <small>本編リメイク</small>
              <b>仮面ライダーサーガ</b>
              <span>映画四部作</span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
