import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/riders")({
  component: () => <Outlet />,
});
