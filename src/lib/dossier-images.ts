// Shared delivery choice for navigation warmup and visible image elements.
export const dossierImageSources = [
  "/civilian-yuma-20260826.jpeg",
  "/civilian-bell-20260826.jpeg",
  "/civilian-lore.jpeg",
  "/civilian-vandal.jpeg",
  "/civilian-leddic.jpeg",
  "/civilian-argenome.jpeg",
  "/civilian-cipher.jpeg",
  "/episode-01-hide-and-seek.jpeg",
  "/episode-02-legends.jpeg",
  "/episode-03-deception-world.jpeg",
  "/episode-04-kill.jpeg",
  "/episode-05-farce.jpeg",
] as const;
const sources = new Set<string>(dossierImageSources);
const managerSources = new Set([
  "/manager-zeus-detail.jpeg",
  "/manager-lejas.jpeg",
  "/manager-opus.jpeg",
  "/manager-rex-loi.jpeg",
  "/manager-shuza.jpeg",
  "/manager-reemu.jpeg",
]);
export function dossierImage(source: string) {
  const path = source.split("?")[0];
  if (sources.has(path)) return { srcSet: path.replace(/\.jpeg$/, "-delivery.webp") };
  if (managerSources.has(path)) return { srcSet: path.replace(/\.jpeg$/, ".webp") };
  return {};
}
