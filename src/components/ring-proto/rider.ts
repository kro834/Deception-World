// PROTOTYPE: the real dossier data, read only.
import { RIDER_DOSSIERS } from "@/components/world/rider-page";

export function protoRider(riderId: string) {
  return RIDER_DOSSIERS.find((rider) => rider.id === riderId) ?? RIDER_DOSSIERS[0];
}
