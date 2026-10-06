import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent, NotFoundComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: NotFoundComponent,
    // A gallery modal owns restoration until its history traversal settles.
    // Never restore the frozen body's offset (scrollY = 0) over the reader's position.
    scrollRestoration: ({ location }) =>
      location.pathname !== "/gallery" ||
      typeof document === "undefined" ||
      !document.body.hasAttribute("data-gallery-viewer-lock"),
    // Restore Back/Forward positions in one jump. A smooth restore is
    // cancelled by the first layout shift of the returning page.
    scrollRestorationBehavior: "instant",
  });
}
