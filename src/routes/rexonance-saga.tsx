import { createFileRoute } from "@tanstack/react-router";
import { RexonanceSaga } from "@/components/rexonance-saga/rexonance-saga";
import {
  WORLD_CORE_STYLESHEET_LINKS as WORLD_STYLESHEET_LINKS,
  CINEMATIC_STYLESHEET_LINK,
} from "@/lib/world-head";
import rexonanceSagaCssUrl from "@/styles-rexonance-saga.css?url";
import resonanceMotionCssUrl from "@/styles-rexonance-motion.css?url";
import sagaShowcaseCssUrl from "@/styles-saga-showcase.css?url";
import { rexonanceImage } from "@/lib/rexonance-images";

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
      ...WORLD_STYLESHEET_LINKS,
      { rel: "stylesheet", href: rexonanceSagaCssUrl },
      { rel: "stylesheet", href: resonanceMotionCssUrl },
      { rel: "stylesheet", href: sagaShowcaseCssUrl },
      CINEMATIC_STYLESHEET_LINK,
      {
        rel: "preload",
        as: "image",
        href: "/rider-rexonance-saga-pickup-20260922.webp",
        imageSrcSet: rexonanceImage("/rider-rexonance-saga-pickup-20260922.webp").srcSet,
        imageSizes: rexonanceImage("/rider-rexonance-saga-pickup-20260922.webp").sizes,
        fetchPriority: "high",
      },
    ],
  }),
});
