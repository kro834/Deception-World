import { createFileRoute } from "@tanstack/react-router";
import { DreamChapter } from "@/components/dream-chapter/dream-chapter";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
} from "@/lib/world-head";
import dreamChapterCssUrl from "@/styles-dream-chapter.css?url";
import dreamFilmCssUrl from "@/styles-dream-film.css?url";
import dreamStoryCssUrl from "@/styles-dream-story.css?url";
import dreamTaishoCssUrl from "@/styles-dream-taisho.css?url";

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
      CINEMATIC_STYLESHEET_LINK,
      { rel: "preload", as: "image", href: "/dream-chapter-poster-05.jpeg" },
      {
        rel: "preload",
        as: "image",
        href: "/dream-chapter-logo.jpeg",
      },
    ],
  }),
});
