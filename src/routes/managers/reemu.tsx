import { createFileRoute } from "@tanstack/react-router";
import { ManagerStub, REEMU } from "@/components/world/manager-stub";
import { createWorldHead } from "@/lib/world-head";

export const Route = createFileRoute("/managers/reemu")({
  component: () => <ManagerStub profile={REEMU} />,
  head: () =>
    createWorldHead({
      title: "リームー｜六詠資料｜Deception World",
      description: "六詠第六位、リームーの人物・能力記録。",
      image: "/manager-reemu.jpeg",
    }),
});
