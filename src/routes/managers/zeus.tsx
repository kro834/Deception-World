import { createFileRoute } from "@tanstack/react-router";
import { ManagerStub, ZEUS } from "@/components/world/manager-stub";
import { createWorldHead } from "@/lib/world-head";

export const Route = createFileRoute("/managers/zeus")({
  component: () => <ManagerStub profile={ZEUS} />,
  head: () =>
    createWorldHead({
      title: "ゼウス｜六詠資料｜Deception World",
      description: "六詠第一位、主権の管理人ゼウスの人物・能力記録。",
      image: "/manager-zeus-detail.jpeg?v=20260823-2",
    }),
});
