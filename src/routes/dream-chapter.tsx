import { createFileRoute } from "@tanstack/react-router";
import { DreamChapter } from "@/components/dream-chapter/dream-chapter";
import "@/styles-world.css";
import "@/styles-world-addon.css";
import "@/styles-dream-chapter.css";

export const Route = createFileRoute("/dream-chapter")({
  component: DreamChapter,
  head: () => ({
    meta: [
      { title: "DREAM CHAPTER｜Deception World" },
      {
        name: "description",
        content:
          "映画第一作『ドリームチャプター』のポスター、シエル・東風谷慶弥・怪作の人物資料、ドルミネンスの機密記録、Case 0〜5を収録した公式記録ページ。",
      },
      { property: "og:title", content: "DREAM CHAPTER｜Deception World" },
      {
        property: "og:description",
        content: "夢と現実の境界を記録する、映画第一作『ドリームチャプター』公式サイト。",
      },
      { property: "og:image", content: "/dream-chapter-poster-03.jpeg" },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: "/dream-chapter-poster-03.jpeg",
      },
    ],
  }),
});
