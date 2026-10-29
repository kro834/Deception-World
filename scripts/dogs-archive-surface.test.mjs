import assert from "node:assert/strict";
import test from "node:test";
import { MeshStandardMaterial } from "three";
import { guardianSurfaceFamily } from "../src/lib/dogs-archive/surface.ts";

const family = (name) => guardianSurfaceFamily(new MeshStandardMaterial({ name }));

test("material families follow the name prefix, so bone named after its lattice is still bone", () => {
  // 2026-10-28 delivery
  assert.equal(family("Bone | v2 clay"), "bone");
  assert.equal(family("Skin | v2 clay"), "skin");
  assert.equal(family("Skin | localized damp tissue"), "skin");
  assert.equal(family("Rune | forehead fan lattice"), "lattice");
  assert.equal(family("Mouth | deep forest cavity"), "mouth");
  // 2026-10-29 deliveries (v3, v5, v6)
  assert.equal(family("Bone | v3 lattice"), "bone");
  assert.equal(family("Skin | v3 ink"), "skin");
  assert.equal(family("Skin | v6 ink comb"), "skin");
  assert.equal(family("Rune | v3 whorl core"), "core");
  assert.equal(family("Rune | v3 face lattice"), "lattice");
  // Unknown names fall back to skin; a bare face material is the lattice.
  assert.equal(family("Membrane"), "skin");
  assert.equal(family("Face lattice leaf"), "lattice");
});
