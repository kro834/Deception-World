import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { TitleSequence } from "@/components/cinematic/title-sequence";
import { CommandDeck } from "@/components/command-deck/command-deck";
import {
  endDocumentEntryOpening,
  isDocumentEntryOpening,
  showsOpening,
  validateCommandDeckSearch,
} from "@/lib/command-deck-mode";
import { OPENING_LOGO_FIRST, OPENING_LOGO_SIZES } from "@/lib/opening-logo";
import { DOSSIER_HUD_FONTS_URL } from "@/lib/world-head";
import openingElevationCssUrl from "../styles-opening-elevation.css?url";
import openingCinemaCssUrl from "../styles-opening-cinema.css?url";
import openingRefinementCssUrl from "../styles-opening-refinement.css?url";
import artworkStageCssUrl from "../styles-artwork-stage.css?url";
import commandDeckCssUrl from "../styles-command-deck.css?url";

const opensWith = (search: Parameters<typeof showsOpening>[0]) =>
  isDocumentEntryOpening() || showsOpening(search);

export const Route = createFileRoute("/")({
  validateSearch: validateCommandDeckSearch,
  component: Home,
  head: ({ match }) =>
    opensWith(match.search)
      ? {
          links: [
            // The ice logo is the first title (the prism logo emerges from its burn
            // and is fetched by its <img> at low priority). Same srcset and sizes as
            // the <img> layers, so one candidate is fetched once.
            {
              rel: "preload",
              as: "image",
              type: "image/webp",
              href: OPENING_LOGO_FIRST.src,
              imageSrcSet: OPENING_LOGO_FIRST.srcSet,
              imageSizes: OPENING_LOGO_SIZES,
              crossOrigin: "anonymous",
              fetchPriority: "high",
            },
            { rel: "preload", as: "image", href: "/atmosphere-poster.jpg" },
            { rel: "stylesheet", href: openingRefinementCssUrl },
            // The World's HUD face (the same Michroma subset /world and the
            // dossiers load), the title's elevation sheet, then its cinema light
            // (the arrival, the rays, the streaks), last on this route.
            { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
            { rel: "stylesheet", href: openingElevationCssUrl },
            { rel: "stylesheet", href: openingCinemaCssUrl },
          ],
        }
      : {
          meta: [
            { title: "Deception World｜仮面ライダーサーガ" },
            {
              name: "description",
              content:
                "ディセプションワールド、夢の章、ファイナルステージ。物語、ライダー、作品を巡る。",
            },
          ],
          links: [{ rel: "stylesheet", href: artworkStageCssUrl }, { rel: "stylesheet", href: commandDeckCssUrl }],
        },
});

function Home() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  useEffect(
    () => () => {
      endDocumentEntryOpening();
    },
    [],
  );
  return opensWith(search) ? (
    <TitleSequence />
  ) : (
    <CommandDeck
      onReplay={() => {
        try {
          window.sessionStorage.setItem("dw-opening-replay", "1");
        } catch {
          // Without session storage the title already plays on every visit.
        }
        void navigate({ search: { opening: true } });
      }}
    />
  );
}
