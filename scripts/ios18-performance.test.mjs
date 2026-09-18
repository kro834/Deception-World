import assert from "node:assert/strict";
import test from "node:test";
import {
  prefersIOS18Rendering,
  prefersLightweightRendering,
} from "../src/lib/rendering-profile.js";

test("iOS 18.7.7 and desktop-mode iPadOS 18 use lightweight decoration", () => {
  for (const userAgent of [
    "iPhone; CPU iPhone OS 18_7_7 like Mac OS X",
    "iPad; CPU OS 18_7 like Mac OS X",
    "Macintosh; Intel Mac OS X 10_15 Version/18.7 Safari/605.1.15",
  ]) {
    const device = { userAgent, maxTouchPoints: 5, hardwareConcurrency: 8 };
    assert.equal(prefersIOS18Rendering(device), true);
    assert.equal(prefersLightweightRendering(device), true);
  }
});
test("newer iOS, desktop Safari and unknown versions retain existing policy", () => {
  for (const device of [
    { userAgent: "iPhone; CPU iPhone OS 26_0 like Mac OS X" },
    {
      userAgent: "iPhone; CPU iPhone OS 18_6 like Mac OS X Version/26.0 Mobile/15E148 Safari/604.1",
    },
    {
      userAgent: "iPhone; CPU iPhone OS 18_7 like Mac OS X Version/27.0 Mobile/15E148 Safari/604.1",
    },
    { userAgent: "Macintosh Version/27.0 Safari/605.1.15", maxTouchPoints: 5 },
    { userAgent: "Macintosh Version/18.7 Safari/605.1.15", maxTouchPoints: 0 },
    { userAgent: "iPhone" },
    {},
  ])
    assert.equal(prefersIOS18Rendering(device), false);
});
