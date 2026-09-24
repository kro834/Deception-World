import { createFileRoute } from "@tanstack/react-router";
import { CielPage } from "@/components/world/ciel-page";
import { WORLD_STYLESHEET_LINKS, createWorldHead } from "@/lib/world-head";
import cielCssUrl from "@/styles-ciel.css?url";

export const Route = createFileRoute("/characters/ciel")({
  component: CielPage,
  head: () =>
    createWorldHead({
      title: "シエル｜人物資料｜Deception World",
      description: "シエル（月城悠真）の人物記録、能力、フォーム、装備を収録した資料。",
      image: "/ciel-thumb-20260924.jpeg",
      stylesheetLinks: [...WORLD_STYLESHEET_LINKS, { rel: "stylesheet", href: cielCssUrl }],
    }),
});
