import { createFileRoute } from "@tanstack/react-router";
import { TitleSequence } from "@/components/cinematic/title-sequence";
import { OPENING_LOGO_FIRST, OPENING_LOGO_SIZES } from "@/lib/opening-logo";

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
    ],
  }),
});

function Home() {
  return <TitleSequence />;
}
