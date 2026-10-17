import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { REXONANCE_SUIT_ATLAS, REXONANCE_SUIT_PIECES, REXONANCE_SUIT_SIZE } from "../src/lib/rexonance-suit.ts";
import { REXONANCE_SUIT_DRIVER } from "../src/lib/rexonance-calls.ts";
import { separateDriverPixels } from "../src/lib/rexonance-unlit.js";

test("driver stand-in matches the live unlit composite within native rounding", async () => {
  const { width, height } = REXONANCE_SUIT_SIZE;
  const pieces = REXONANCE_SUIT_PIECES.filter((p) => REXONANCE_SUIT_DRIVER.includes(p.id)).reverse();
  const layers = await Promise.all(pieces.map(async (p) => ({
    input: await sharp(`public${REXONANCE_SUIT_ATLAS.src}`)
      .extract({ left: p.ax, top: p.ay, width: p.w, height: p.h }).png().toBuffer(),
    left: p.x, top: p.y,
  })));
  const expected = await sharp({ create: { width, height, channels: 4, background: "#00000000" } })
    .composite(layers).raw().toBuffer();
  separateDriverPixels(expected);
  const { data, info } = await sharp("public/rexonance-zenith-20261017/driver-standin.webp")
    .raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, width);
  assert.equal(info.height, height);
  let painted = 0;
  for (let i = 0; i < expected.length; i += 4) {
    assert.equal(data[i + 3], expected[i + 3], `alpha ${i}`);
    if (!expected[i + 3]) continue;
    painted += 1;
    // libvips SIMD compositing rounds differently on Linux x64 and macOS ARM.
    // Keep alpha exact; allow only one 8-bit RGB level, never geometry drift.
    for (let c = 0; c < 3; c++)
      assert.ok(Math.abs(data[i + c] - expected[i + c]) <= 1, `channel ${i + c}: ${data[i + c]} vs ${expected[i + c]}`);
  }
  assert.ok(painted > 5000, "driver is not blank");
});
