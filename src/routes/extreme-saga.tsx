import { createFileRoute } from "@tanstack/react-router";
import { ExtremeSaga } from "@/components/extreme-saga/extreme-saga";
import "@/styles-world.css";
import "@/styles-world-addon.css";
import "@/styles-rexonance-saga.css";
import "@/styles-extreme-saga.css";

export const Route = createFileRoute("/extreme-saga")({
  component: ExtremeSaga,
  head: () => ({
    meta: [
      { title: "エクスプリームサーガ｜Deception World" },
      {
        name: "description",
        content:
          "至高、極まれり。エクスプリームサーガの性能、P14、ディルクルムサーガ／ヴィンクルムサーガとの比較を体験する公式特設サイト。",
      },
      { property: "og:title", content: "エクスプリームサーガ｜Deception World" },
      {
        property: "og:description",
        content: "可能性を増殖し、勝利という結果へ。エクスプリームサーガ公式特設サイト。",
      },
      { property: "og:image", content: "/saga-extreme-middle.jpeg" },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: "/saga-extreme-middle.webp",
        fetchPriority: "high",
        type: "image/webp",
      },
    ],
  }),
});
