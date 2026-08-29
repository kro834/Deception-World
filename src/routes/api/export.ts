import { createFileRoute } from "@tanstack/react-router";

const MAIN_ARCHIVE_URL = "https://github.com/kro834/Deception-World/archive/refs/heads/main.zip";

export const Route = createFileRoute("/api/export")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(null, {
          status: 302,
          headers: {
            location: MAIN_ARCHIVE_URL,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
