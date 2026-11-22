// PROTOTYPE switchboard: /ring-proto?c=m1|m2|m3|d1|d2|d3 (&id=<rider id>).
import { MenuOrbit } from "./menu-orbit";
import { DossierExploded } from "./dossier-exploded";

export function RingProto({
  concept,
  riderId,
  part,
}: {
  concept: string;
  riderId: string;
  part?: string;
}) {
  switch (concept) {
    case "d1":
      return <DossierExploded riderId={riderId} initialPart={part} />;
    default:
      return <MenuOrbit initialRegion={part} />;
  }
}
