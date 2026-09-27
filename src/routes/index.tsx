import { createFileRoute } from "@tanstack/react-router";
import { TitleSequence } from "@/components/cinematic/title-sequence";
import { OPENING_LOGO_FIRST, OPENING_LOGO_SIZES } from "@/lib/opening-logo";
import { DOSSIER_HUD_FONTS_URL } from "@/lib/world-head";
import openingElevationCssUrl from "../styles-opening-elevation.css?url";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
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
      // The World's HUD face (the same Michroma subset /world and the
      // dossiers load) and the title's elevation sheet, last on this route.
      { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
      { rel: "stylesheet", href: openingElevationCssUrl },
    ],
  }),
});

function Home() {
  return <TitleSequence />;
}
