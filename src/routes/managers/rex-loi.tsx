import { createFileRoute } from "@tanstack/react-router";
import { ManagerStub, REX_LOI } from "@/components/world/manager-stub";
import { createWorldHead } from "@/lib/world-head";

export const Route = createFileRoute("/managers/rex-loi")({
  component: () => <ManagerStub profile={REX_LOI} />,
  head: () =>
    createWorldHead({
      title: "レックス・ロワ｜六詠資料｜Deception World",
      description: "六詠第二位、レックス・ロワの人物・能力記録。",
      image: "/manager-rex-loi.jpeg",
    }),
});
