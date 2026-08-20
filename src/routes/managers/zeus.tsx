import { createFileRoute } from "@tanstack/react-router";
import { ManagerStub, ZEUS } from "@/components/world/manager-stub";
import "@/styles-world.css";
import "@/styles-world-addon.css";

export const Route = createFileRoute("/managers/zeus")({
  component: () => <ManagerStub profile={ZEUS} />,
});
