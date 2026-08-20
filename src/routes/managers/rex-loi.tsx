import { createFileRoute } from "@tanstack/react-router";
import { ManagerStub, REX_LOI } from "@/components/world/manager-stub";
import "@/styles-world.css";
import "@/styles-world-addon.css";

export const Route = createFileRoute("/managers/rex-loi")({
  component: () => <ManagerStub profile={REX_LOI} />,
});
