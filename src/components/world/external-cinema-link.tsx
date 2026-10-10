import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { createCinemaExit, shouldAnimateCinemaClick } from "@/lib/external-cinema-exit.js";
import cinemaExitCss from "./external-cinema-link.css?url";

const CINEMA_URL = "https://kamen-rider-saga-cinema.akiopromax13.chatgpt.site/";

export function ExternalCinemaLink({ beforeNavigate }: { beforeNavigate?: () => void }) {
  const [exiting, setExiting] = useState(false);
  const exitRef = useRef<ReturnType<typeof createCinemaExit> | null>(null);

  useEffect(() => {
    const exit = createCinemaExit({
      onActive: setExiting,
      navigate: () => window.location.assign(CINEMA_URL),
    });
    exitRef.current = exit;
    return () => {
      exitRef.current = null;
      exit.dispose();
    };
  }, []);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldAnimateCinemaClick(event)) return;
    // Only take over once the effect is ready and motion is allowed. The
    // href remains the immediate fallback for hydration and quiet modes.
    if (exitRef.current?.begin()) {
      event.preventDefault();
      event.stopPropagation();
    }
    beforeNavigate?.();
  };

  return (
    <>
      <link rel="stylesheet" href={cinemaExitCss} precedence="default" />
      <a href={CINEMA_URL} className="side-panel-cinema-link" onClick={onClick}>
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
