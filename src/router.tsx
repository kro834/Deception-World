import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent, NotFoundComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: NotFoundComponent,
    // A gallery modal owns restoration until its history traversal settles.
    // Never record a frozen body (scrollY = 0) as the reader's return offset.
    scrollRestoration: ({ location }) =>
      location.pathname !== "/gallery" ||
      typeof document === "undefined" ||
      !document.body.hasAttribute("data-gallery-viewer-lock"),
    // Restore Back/Forward positions in one jump. A smooth restore is
    // cancelled by the first layout shift of the returning page.
    scrollRestorationBehavior: "instant",
  });
}
