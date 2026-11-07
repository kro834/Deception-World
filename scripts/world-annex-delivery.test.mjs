import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { createServer } from "vite";

test("the deferred annex serves its complete HTML to a reader before hydration", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const server = await createServer({
    root,
    configFile: false,
    resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
    appType: "custom",
    server: { middlewareMode: true, ws: false, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { WorldAnnexRecords } = await server.ssrLoadModule(
      "/src/components/world/world-annex-sections.tsx",
    );
    const { LoadGateProvider } = await server.ssrLoadModule("/src/components/load-gate.tsx");
    const router = createRouter({
      routeTree: createRootRoute({ component: () => null }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
      isServer: true,
    });
    await router.load();
    const html = renderToString(
      h(RouterContextProvider, { router }, h(LoadGateProvider, null, h(WorldAnnexRecords))),
    );
    for (const id of [
      "cast-roster",
      "world-brief",
      "episode-notes",
      "glossary",
      "quotes",
      "wa-episode-04",
      "wa-person-bell",
    ]) {
      assert.ok(html.includes(`id="${id}"`), id);
    }
    assert.ok(html.includes("しかし、賞賛と許容は同義ではありません"));
    assert.equal((html.match(/<details class="wa-profile"/g) ?? []).length, 14);
    assert.doesNotMatch(html, /Switched to client rendering|資料の読み込みに失敗/);
  } finally {
    await server.close();
  }
});
