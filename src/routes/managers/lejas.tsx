import { createFileRoute } from "@tanstack/react-router";
import { LejasPage } from "@/components/world/lejas-page";
import { createWorldHead } from "@/lib/world-head";

export const Route = createFileRoute("/managers/lejas")({
  component: LejasPage,
  head: () =>
    createWorldHead({
      title: "レジャス｜六詠資料｜Deception World",
      description: "六詠第四位、レジャスの人物・能力記録。",
      image: "/manager-lejas.jpeg",
    }),
});
