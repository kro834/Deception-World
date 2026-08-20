import { createFileRoute } from "@tanstack/react-router";
import { ManagerStub, REEMU } from "@/components/world/manager-stub";
import "@/styles-world.css";
import "@/styles-world-addon.css";

export const Route = createFileRoute("/managers/reemu")({
  component: () => <ManagerStub profile={REEMU} />,
});
