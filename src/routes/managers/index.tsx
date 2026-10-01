import { createFileRoute, redirect } from "@tanstack/react-router";

// The list URL one segment up from every manager file: it lands on the World
// page's manager archive, the same place the file's list return goes.
export const Route = createFileRoute("/managers/")({
  beforeLoad: () => {
    throw redirect({ to: "/world", hash: "manager-archive", replace: true });
  },
});
