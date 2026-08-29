import { createFileRoute } from "@tanstack/react-router";
import { ManagerStub, SHUZA } from "@/components/world/manager-stub";
import { createWorldHead } from "@/lib/world-head";

export const Route = createFileRoute("/managers/shuza")({
  component: () => <ManagerStub profile={SHUZA} />,
  head: () =>
    createWorldHead({
      title: "シュザ｜六詠資料｜Deception World",
      description: "六詠第三位、シュザの人物・能力記録。",
      image: "/manager-shuza.jpeg",
    }),
});
