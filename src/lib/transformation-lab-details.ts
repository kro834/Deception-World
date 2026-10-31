import type { LabRider, LabZoom } from "./transformation-lab-state.js";
import { rexonanceEntries } from "./rexonance-profile.ts";
import { FAR_FROM_SAGA } from "../components/final-stage/final-stage-data.ts";
import { ILLUSIONCULUM_SAGA } from "../components/illusionculum-saga/illusionculum-data.ts";
import { META_UNITAS_SAGA } from "../components/meta-unitas-saga/meta-unitas-data.ts";

export type LabPartRecord = { title: string; description: string; href: string };
export const LAB_PART_LABELS: Record<LabZoom, string> = {
  full: "全身",
  head: "頭部",
  reactor: "中枢",
  legs: "脚部",
};
const sentence = (body: string, count = 1) =>
  body
    .split(/(?<=。)/u)
    .slice(0, count)
    .join("");
const record = (title: string, body: string, href: string, count = 1): LabPartRecord => ({
  title,
  description: sentence(body, count),
  href,
});
const rex = (section: string, name: string) => {
  const entry = rexonanceEntries(section).find((e) => e.name === name);
  if (!entry) throw new Error(`Missing published Rexonance mechanism: ${name}`);
  return entry;
};
const rxArmor = rex("装甲・外観", "ASTRA-16 Ultra");
const rxDrive = rex("超光速機動・推進制御機構", "REXONANCE DRIVE");
const rxSelf = rex("能力", "REXONANCE DEUS");
const icArmor = ILLUSIONCULUM_SAGA.armour[0];
const muArmor = META_UNITAS_SAGA.armor[0];
const muHelix = META_UNITAS_SAGA.armor.find((a) => a.name === "UNITAS HELIX")!;
const muHalo = META_UNITAS_SAGA.armor.find((a) => a.name === "UNITAS HALO")!;
// These are related published records for the selected view, not newly named
// anatomical components. Where no separate head/leg mechanism is published,
// show the documented armor or control system instead of inventing one.
export const LAB_PART_RECORDS: Record<LabRider, Record<LabZoom, LabPartRecord>> = {
  rexonance: {
    full: record(rxArmor.name, rxArmor.body, "/riders/saga#form-records", 2),
    head: record(rxArmor.name, rxArmor.body, "/riders/saga#form-records", 2),
    reactor: record(rxSelf.name, rxSelf.body, "/riders/saga#form-records", 2),
    legs: record(rxDrive.name, rxDrive.body, "/riders/saga#form-records", 2),
  },
  "far-from": {
    full: record(FAR_FROM_SAGA.bits.title, FAR_FROM_SAGA.bits.body[0], "/far-from-saga#system", 2),
    head: record(FAR_FROM_SAGA.os.title, FAR_FROM_SAGA.os.body[0], "/far-from-saga#system", 2),
    reactor: record(
      FAR_FROM_SAGA.theories[0].title,
      FAR_FROM_SAGA.theories[0].body[0],
      "/far-from-saga#theories",
      2,
    ),
    legs: record(
      FAR_FROM_SAGA.theories[0].title,
      FAR_FROM_SAGA.theories[0].body[1],
      "/far-from-saga#theories",
      2,
    ),
  },
  illusionculum: {
    full: record(icArmor.title, icArmor.body[0], "/illusionculum-saga#armour", 2),
    head: record(icArmor.title, icArmor.body[1], "/illusionculum-saga#armour"),
    reactor: record(
      ILLUSIONCULUM_SAGA.arsenal[0].title,
      ILLUSIONCULUM_SAGA.arsenal[0].body[0],
      "/illusionculum-saga#arsenal",
      2,
    ),
    legs: record(
      ILLUSIONCULUM_SAGA.arsenal[1].title,
      ILLUSIONCULUM_SAGA.arsenal[1].body[0],
      "/illusionculum-saga#arsenal",
      2,
    ),
  },
  "meta-unitas": {
    full: record(muArmor.name, muArmor.body[0], "/meta-unitas-saga#armor", 2),
    head: record(muHalo.name, muHalo.body[0], "/meta-unitas-saga#armor", 2),
    reactor: record(muHelix.name, muHelix.body[0], "/meta-unitas-saga#armor", 2),
    legs: record(muArmor.name, muArmor.body[1], "/meta-unitas-saga#armor", 2),
  },
};
export function labPartRecord(rider: LabRider, zoom: LabZoom): LabPartRecord {
  return LAB_PART_RECORDS[rider][zoom];
}
