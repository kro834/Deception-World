import { createFileRoute, redirect } from "@tanstack/react-router";

// The list URL one segment up from every rider file: it lands on the World
// page's rider list, the same place the file's list return goes.
export const Route = createFileRoute("/riders/")({
  beforeLoad: () => {
    throw redirect({ to: "/world", hash: "riders-return", replace: true });
  },
});
