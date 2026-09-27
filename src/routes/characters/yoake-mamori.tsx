import { createFileRoute } from "@tanstack/react-router";
import { YoakeMamoriPage } from "@/components/world/yoake-mamori-page";
import { DOSSIER_STYLESHEET_LINKS, createWorldHead } from "@/lib/world-head";

export const Route = createFileRoute("/characters/yoake-mamori")({
  component: YoakeMamoriPage,
  head: () =>
    createWorldHead({
      title: "夜明護尊｜人物資料｜Deception World",
      description: "夜明護尊（よあけまもりのみこと）の人物、神性、焔雷・暁天穿の記録。",
      image: "/character-yoake-mamori.jpeg",
      stylesheetLinks: DOSSIER_STYLESHEET_LINKS,
    }),
});
