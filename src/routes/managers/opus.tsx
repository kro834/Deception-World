import { createFileRoute } from "@tanstack/react-router";
import { ManagerStub, OPUS } from "@/components/world/manager-stub";
import "@/styles-world.css";
import "@/styles-world-addon.css";

export const Route = createFileRoute("/managers/opus")({
  component: () => <ManagerStub profile={OPUS} />,
});
