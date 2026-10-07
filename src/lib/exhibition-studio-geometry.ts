import { ExtrudeGeometry, Path, PerspectiveCamera, Shape, Vector3 } from "three";

/** Real dimensions in metres; the original image always retains its full UV rectangle. */
export function getExhibitionDimensions(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("The exhibition requires positive artwork dimensions.");
  }
  const aspect = width / height;
  const printWidth = aspect >= 1 ? 1.65 : 1.65 * aspect;
  const printHeight = printWidth / aspect;
  const matBorder = 0.065;
  const railWidth = 0.025;
  return {
    aspect,
    printWidth,
    printHeight,
    matBorder,
    railWidth,
    innerWidth: printWidth + matBorder * 2,
    innerHeight: printHeight + matBorder * 2,
    outerWidth: printWidth + (matBorder + railWidth) * 2,
    outerHeight: printHeight + (matBorder + railWidth) * 2,
    frameDepth: 0.046,
    frameBevel: 0.0012,
    wallGap: 0.032,
    centreHeight: 1.53,
    glassThickness: 0.002,
  };
}

export type ExhibitionDimensions = ReturnType<typeof getExhibitionDimensions>;

/** Camera fit is independent of the DOM/GPU and can be checked by projecting the frame corners. */
export function getExhibitionCamera(
  dimensions: ExhibitionDimensions,
  viewportWidth: number,
  viewportHeight: number,
  view: "front" | "oblique" | "room",
) {
  const aspect = Math.max(1, viewportWidth) / Math.max(1, viewportHeight);
  const fov = 39;
  const angle = view === "oblique" ? 0.48 : view === "room" ? 0.16 : 0;
  const verticalFov = (fov * Math.PI) / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  let distance = Math.max(
    (dimensions.outerHeight * 1.48) / (2 * Math.tan(verticalFov / 2)),
    (dimensions.outerWidth * 1.4) / (2 * Math.tan(horizontalFov / 2)),
  );
  if (view === "room") distance = Math.max(distance, 4.35);
  const target: readonly [number, number, number] = [
    0,
    view === "room" ? 1.27 : dimensions.centreHeight - 0.11,
    0.04,
  ];
  const position: [number, number, number] = [0, 0, 0];
  const camera = new PerspectiveCamera(fov, aspect, 0.025, 40);
  // Extremely wide original art needs the off-centre photographic composition included in
  // the fit. Project the actual bevelled 3D envelope, not only a 2D aspect-ratio estimate.
  for (let attempt = 0; attempt < 12; attempt++) {
    position[0] = Math.sin(angle) * distance;
    position[1] = target[1] + 0.1;
    position[2] = Math.cos(angle) * distance;
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.updateMatrixWorld(true);
    let maximum = 0;
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [dimensions.wallGap, dimensions.wallGap + dimensions.frameDepth]) {
          const projected = new Vector3(
            x * (dimensions.outerWidth / 2 + dimensions.frameBevel),
            dimensions.centreHeight + y * (dimensions.outerHeight / 2 + dimensions.frameBevel),
            z,
          ).project(camera);
          maximum = Math.max(maximum, Math.abs(projected.x), Math.abs(projected.y));
        }
      }
    }
    if (maximum <= 0.86) break;
    distance *= (maximum / 0.86) * 1.015;
  }
  return { position, target, fov, aspect, distance };
}

function polygon(points: ReadonlyArray<readonly [number, number]>) {
  const shape = new Shape();
  points.forEach(([x, y], index) => (index === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  return shape;
}

/** Four separate 45 degree miter joints, not a flat border painted over the artwork. */
export function createMiteredFrameGeometry(dimensions: ExhibitionDimensions) {
  const ox = dimensions.outerWidth / 2;
  const oy = dimensions.outerHeight / 2;
  const ix = dimensions.innerWidth / 2;
  const iy = dimensions.innerHeight / 2;
  const corners: Array<Array<readonly [number, number]>> = [
    [
      [-ox, oy],
      [-ix, iy],
      [ix, iy],
      [ox, oy],
    ],
    [
      [ox, oy],
      [ix, iy],
      [ix, -iy],
      [ox, -oy],
    ],
    [
      [ox, -oy],
      [ix, -iy],
      [-ix, -iy],
      [-ox, -oy],
    ],
    [
      [-ox, -oy],
      [-ix, -iy],
      [-ix, iy],
      [-ox, oy],
    ],
  ];
  return corners.map(
    (points) =>
      new ExtrudeGeometry(polygon(points), {
        depth: dimensions.frameDepth - dimensions.frameBevel * 2,
        bevelEnabled: true,
        bevelThickness: dimensions.frameBevel,
        bevelSize: dimensions.frameBevel,
        bevelSegments: 3,
        curveSegments: 1,
        steps: 1,
      }),
  );
}

export function createCottonMatGeometry(dimensions: ExhibitionDimensions) {
  const { innerWidth, innerHeight, printWidth, printHeight } = dimensions;
  // A physically cut mat aperture. No part of the original rectangle is covered.
  const shape = polygon([
    [-innerWidth / 2, -innerHeight / 2],
    [innerWidth / 2, -innerHeight / 2],
    [innerWidth / 2, innerHeight / 2],
    [-innerWidth / 2, innerHeight / 2],
  ]);
  const aperture = new Path();
  const x = printWidth / 2 + 0.0025;
  const y = printHeight / 2 + 0.0025;
  aperture.moveTo(-x, -y);
  aperture.lineTo(-x, y);
  aperture.lineTo(x, y);
  aperture.lineTo(x, -y);
  aperture.closePath();
  shape.holes.push(aperture);
  return new ExtrudeGeometry(shape, {
    depth: 0.001,
    bevelEnabled: true,
    bevelThickness: 0.001,
    bevelSize: 0.001,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
}
