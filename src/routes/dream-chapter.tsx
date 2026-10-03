import { createFileRoute } from "@tanstack/react-router";
import { DreamChapter } from "@/components/dream-chapter/dream-chapter";
import { DREAM_CHAPTER_HERO_ART, DREAM_CHAPTER_LOGO } from "@/lib/asset-loader";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
} from "@/lib/world-head";
import dreamChapterCssUrl from "@/styles-dream-chapter.css?url";
import dreamFilmCssUrl from "@/styles-dream-film.css?url";
import dreamStoryCssUrl from "@/styles-dream-story.css?url";
import dreamTaishoCssUrl from "@/styles-dream-taisho.css?url";
import dreamElevationCssUrl from "@/styles-dream-elevation.css?url";
import dreamAnnexCssUrl from "@/styles-dream-annex.css?url";
import dreamArrivalCssUrl from "@/styles-dream-arrival.css?url";
import dreamStageCssUrl from "@/styles-dream-stage.css?url";
import dreamRefinementCssUrl from "@/styles-dream-refinement.css?url";
import dreamExtraCssUrl from "@/styles-dream-extra.css?url";
import dreamKinemaCssUrl from "@/styles-dream-kinema.css?url";

// Shippori Mincho carries the Taisho letterpress voice of the film site.
const DREAM_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;800&family=Shippori+Mincho:wght@400;500;700&display=swap";

export const Route = createFileRoute("/dream-chapter")({
  component: DreamChapter,
  head: () => ({
    meta: [
      { title: "DREAM CHAPTER｜Deception World" },
      {
        name: "description",
        content:
          "映画第一作『ドリームチャプター』の人物資料、ドルミネンスの機密記録と、Case 0〜5の中盤までのあらすじを収録。シエルたちと幻想郷の住人が交わる物語を紹介します。",
      },
      { property: "og:title", content: "DREAM CHAPTER｜Deception World" },
      {
        property: "og:description",
        content: "夢と現実の境界を記録する、映画第一作『ドリームチャプター』公式サイト。",
      },
      { property: "og:image", content: "/dream-chapter-poster-03.jpeg" },
    ],
    links: [
      ...WORLD_STYLESHEET_LINKS,
      { rel: "stylesheet", href: dreamChapterCssUrl },
      { rel: "stylesheet", href: dreamFilmCssUrl },
      { rel: "stylesheet", href: dreamStoryCssUrl },
      { rel: "stylesheet", href: DREAM_FONTS_URL },
      { rel: "stylesheet", href: dreamTaishoCssUrl },
      { rel: "stylesheet", href: dreamElevationCssUrl },
      { rel: "stylesheet", href: dreamAnnexCssUrl },
      { rel: "stylesheet", href: dreamArrivalCssUrl },
      { rel: "stylesheet", href: dreamStageCssUrl },
      { rel: "stylesheet", href: dreamRefinementCssUrl },
      { rel: "stylesheet", href: dreamExtraCssUrl },
      // The Kinema edition: the programme's finish, states and signatures.
      { rel: "stylesheet", href: dreamKinemaCssUrl },
      CINEMATIC_STYLESHEET_LINK,
      // The same files the dive warms and the hero shows.
      { rel: "preload", as: "image", href: DREAM_CHAPTER_HERO_ART },
      {
        rel: "preload",
        as: "image",
        href: DREAM_CHAPTER_LOGO,
      },
    ],
  }),
});
