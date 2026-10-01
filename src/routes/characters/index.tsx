import { createFileRoute, redirect } from "@tanstack/react-router";

// The list URL one segment up from every character file: it lands on the
// World page's OTHER archive tab, the same place the file's list return goes.
export const Route = createFileRoute("/characters/")({
  beforeLoad: () => {
    throw redirect({ to: "/world", hash: "manager-archive-other", replace: true });
  },
});
