import { createFileRoute } from "@tanstack/react-router";
import { RexonanceSaga } from "@/components/rexonance-saga/rexonance-saga";
import "@/styles-world.css";
import "@/styles-world-addon.css";
import "@/styles-rexonance-saga.css";

export const Route = createFileRoute("/rexonance-saga")({
  component: RexonanceSaga,
  head: () => ({
    meta: [
      { title: "レクソナンスサーガ｜Deception World" },
      {
        name: "description",
        content:
          "無限出力を無限の攻撃へ。レクソナンスサーガの性能比較、三段階の運用形態、トリニティ・レゾナンスを体験する公式特設サイト。",
      },
      { property: "og:title", content: "レクソナンスサーガ｜Deception World" },
      {
        property: "og:description",
        content: "サーガシステムの次世代到達点。その性能と共鳴を体験する公式特設サイト。",
      },
      { property: "og:image", content: "/rider-saga-rexonance-thumbnail-20260827.jpeg" },
    ],
    links: [
      {
        rel: "preload",
        as: "image",
        href: "/rider-rexonance-saga-pickup.jpeg",
        fetchPriority: "high",
      },
    ],
  }),
});
