import { createFileRoute, Outlet } from "@tanstack/react-router";
import { validateDossierOriginSearch } from "@/lib/dossier-origin";

export const Route = createFileRoute("/characters")({
  validateSearch: validateDossierOriginSearch,
  component: () => <Outlet />,
});
