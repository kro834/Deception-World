import { createFileRoute } from "@tanstack/react-router";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const Route = createFileRoute("/api/export")({
  server: {
    handlers: {
      GET: async () => {
        const file = join(process.cwd(), "public/Deception-World.zip");
        const buf = await readFile(file);
        return new Response(buf, {
          headers: {
            "content-type": "application/zip",
            "content-disposition": 'attachment; filename="Deception-World.zip"',
            "content-length": String(buf.byteLength),
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
