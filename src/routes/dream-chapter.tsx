import { createFileRoute } from "@tanstack/react-router";
import { DreamChapter } from "@/components/dream-chapter/dream-chapter";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
} from "@/lib/world-head";
import dreamChapterCssUrl from "@/styles-dream-chapter.css?url";
import dreamFilmCssUrl from "@/styles-dream-film.css?url";
import dreamStoryCssUrl from "@/styles-dream-story.css?url";

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
