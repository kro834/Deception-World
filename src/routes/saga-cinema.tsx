import { createFileRoute } from "@tanstack/react-router";
import { SagaCinema } from "@/components/saga-cinema/saga-cinema";
import { WORLD_CORE_STYLESHEET_LINKS, CINEMATIC_STYLESHEET_LINK } from "@/lib/world-head";
import cinemaCss from "@/components/saga-cinema/saga-cinema.css?url";

export const Route = createFileRoute("/saga-cinema")({
  component: SagaCinema,
  head: () => ({
    meta: [
      { title: "映画四部作『仮面ライダーサーガ』｜Deception World" },
      {
        name: "description",
        content:
          "『仮面ライダーサーガ』本編をリメイクする映画4部作。邂逅、覚醒、激情、終末。ディセプションワールド内の映画特設ページ。",
      },
      { property: "og:title", content: "映画四部作『仮面ライダーサーガ』｜Deception World" },
      { property: "og:image", content: "/saga-cinema-assets/chapter-4.jpg" },
    ],
    links: [
      ...WORLD_CORE_STYLESHEET_LINKS,
      CINEMATIC_STYLESHEET_LINK,
      { rel: "stylesheet", href: cinemaCss },
      { rel: "preload", as: "image", href: "/saga-cinema-assets/chapter-4.jpg" },
      { rel: "preload", as: "image", href: "/saga-cinema-assets/saga-logo-original.webp" },
    ],
  }),
});
