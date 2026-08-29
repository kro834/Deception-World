import { createFileRoute } from "@tanstack/react-router";
import { RelatedPage } from "@/components/world/related-page";
import { createWorldHead } from "@/lib/world-head";

export const Route = createFileRoute("/characters/luna")({
  component: () => <RelatedPage id="luna" />,
  head: () =>
    createWorldHead({
      title: "ルナ・アレイン｜人物資料｜Deception World",
      description: "ルナ・アレインとレルム ムーンフォームの人物・能力記録。",
      image: "/character-luna.jpeg",
    }),
});
