// GET/HEAD-only loopback preview. No rebuild or release migration command.
// Importing the server retains its normal embedded database initialization.
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Readable } from "node:stream";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = resolve(root, ".vercel/output/static");
const handler = (
  await import(pathToFileURL(resolve(root, ".vercel/output/functions/__server.func/index.mjs")))
).default;
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".webp": "image/webp",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
};
const port = 8082;
createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const path = resolve(publicRoot, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(publicRoot + sep)) {
      if (path !== publicRoot) {
        res.writeHead(403);
        res.end();
        return;
      }
    }
    const file = await stat(path).catch(() => null);
    if (file?.isFile()) {
      res.writeHead(200, {
        "content-type": mime[extname(path)] ?? "application/octet-stream",
        "content-length": file.size,
      });
      if (req.method === "HEAD") res.end();
      else createReadStream(path).pipe(res);
      return;
    }
    const response = await handler.fetch(
      new Request(url, { method: req.method, headers: req.headers }),
    );
    const responseHeaders = Object.fromEntries(response.headers);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) responseHeaders["set-cookie"] = cookies;
    res.writeHead(response.status, responseHeaders);
    if (response.body && req.method !== "HEAD") Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end("Production preview failed");
  }
}).listen(port, "127.0.0.1", () => console.log(`Production preview: http://127.0.0.1:${port}`));
