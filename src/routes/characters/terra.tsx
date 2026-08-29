import { createFileRoute } from "@tanstack/react-router";
import { RelatedPage } from "@/components/world/related-page";
import { createWorldHead } from "@/lib/world-head";

export const Route = createFileRoute("/characters/terra")({
  component: () => <RelatedPage id="terra" />,
  head: () =>
    createWorldHead({
      title: "テラ・アレイン｜人物資料｜Deception World",
      description: "テラ・アレインとレルム アースフォームの人物・能力記録。",
      image: "/character-terra.jpeg",
    }),
});
