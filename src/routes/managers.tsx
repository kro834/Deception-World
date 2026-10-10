import { createFileRoute, Outlet } from "@tanstack/react-router";
import { validateDossierOriginSearch } from "@/lib/dossier-origin";

export const Route = createFileRoute("/managers")({
  validateSearch: validateDossierOriginSearch,
  component: () => <Outlet />,
});
