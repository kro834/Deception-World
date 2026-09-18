import { createFileRoute } from "@tanstack/react-router";
import { DantePage } from "@/components/world/dante-page";
import { createWorldHead, WORLD_STYLESHEET_LINKS } from "@/lib/world-head";
import danteCss from "@/styles-dante.css?url";

export const Route = createFileRoute("/characters/dante")({
  component: DantePage,
  head: () =>
    createWorldHead({
      title: "ダンテ｜管理人殺し・人物資料｜Deception World",
      description:
        "スカーズNo.1・ダンテの人物記録と、仮面ライダールーラーのポラリス／エニグマ両モードの能力・必殺技。",
      image: "/character-dante.webp",
      stylesheetLinks: [...WORLD_STYLESHEET_LINKS, { rel: "stylesheet", href: danteCss }],
    }),
});
