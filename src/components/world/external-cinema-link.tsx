import { type MouseEvent } from "react";
import { useLoadGate } from "@/components/load-gate";
import { shouldAnimateCinemaClick } from "@/lib/external-cinema-exit.js";
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
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldAnimateCinemaClick(event)) return;
    event.preventDefault();
    event.stopPropagation();
    // One route-owned cover starts now; no independent pre-navigation movie.
    void go({
      to: CINEMA_PATH,
      hash: "top",
      assets: CINEMA_ASSETS,
      focusDestination: event.detail === 0,
    });
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
    </>
  );
}
