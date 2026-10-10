import { createFileRoute, Outlet } from "@tanstack/react-router";
import { validateDossierOriginSearch } from "@/lib/dossier-origin";

export const Route = createFileRoute("/riders")({
  validateSearch: validateDossierOriginSearch,
  component: () => <Outlet />,
});
