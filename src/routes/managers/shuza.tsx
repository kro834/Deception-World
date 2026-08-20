import { createFileRoute } from "@tanstack/react-router";
import { ManagerStub, SHUZA } from "@/components/world/manager-stub";
import "@/styles-world.css";
import "@/styles-world-addon.css";

export const Route = createFileRoute("/managers/shuza")({
  component: () => <ManagerStub profile={SHUZA} />,
});
