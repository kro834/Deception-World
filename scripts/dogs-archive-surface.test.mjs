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
  // 2026-10-30 v8 (albedo tiles on the skin, a blended face mask)
  assert.equal(family("Skin | v8 curl chains"), "skin");
  assert.equal(family("Skin | v8 crescent combs"), "skin");
  assert.equal(family("Skin | v8 veined membrane"), "skin");
  assert.equal(family("Rune | v8 face mask"), "lattice");
  // 2026-10-30 v12 (projected atlas; prefixes kept)
  assert.equal(family("Skin | v12 painted Serp"), "skin");
  assert.equal(family("Skin | v12 painted Serp.001"), "skin");
  assert.equal(family("Skin | v12 painted Serp.002"), "skin");
  assert.equal(family("Bone | v12 painted Serp"), "bone");
  assert.equal(family("Skin | v12 painted Head"), "skin");
  assert.equal(family("Bone | v12 painted Head"), "bone");
  assert.equal(family("Mouth | v12 painted Head"), "mouth");
  // v17: translucent green glass parts (the big arms' ladder rungs and inner hooks)
  assert.equal(family("Glass | arm ladder"), "glass");
  assert.equal(family("Glass | v17 arm ladder"), "glass");
  assert.equal(family("Bone | v17 fan zipper"), "bone");
  // v18: glossy black horns around the face
  assert.equal(family("Horn | face crown"), "horn");
  assert.equal(family("Horn | v18 face crown"), "horn");
  // Unknown names fall back to skin; a bare face material is the lattice.
  assert.equal(family("Membrane"), "skin");
  assert.equal(family("Face lattice leaf"), "lattice");
});
