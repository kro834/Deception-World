import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/export")({
  server: {
    handlers: {
      GET: async () => {
        return Response.redirect(
          "https://github.com/kro834/Deception-World/archive/refs/heads/main.zip",
          302,
        );
      },
    },
  },
});
