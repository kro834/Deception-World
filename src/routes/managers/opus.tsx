import { createFileRoute } from "@tanstack/react-router";
import { ManagerStub, OPUS } from "@/components/world/manager-stub";
import { DOSSIER_STYLESHEET_LINKS, createWorldHead } from "@/lib/world-head";

export const Route = createFileRoute("/managers/opus")({
  component: () => <ManagerStub profile={OPUS} />,
  head: () =>
    createWorldHead({
      title: "オパス｜六詠資料｜Deception World",
      description: "六詠第五位、オパスの人物・能力記録。",
      image: "/manager-opus.jpeg",
      stylesheetLinks: DOSSIER_STYLESHEET_LINKS,
    }),
});
