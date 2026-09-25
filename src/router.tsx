import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent, NotFoundComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: NotFoundComponent,
    scrollRestoration: true,
    // Restore Back/Forward positions in one jump. A smooth restore is
    // cancelled by the first layout shift of the returning page.
    scrollRestorationBehavior: "instant",
  });
}
