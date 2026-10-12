export type CityBlock = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  tilt?: number;
  yaw?: number;
  shade?: number;
};
type Route = (s: number) => { x: number; z: number; heading: number };

// Buildings are rigid local coordinate systems, not independent samples of a
// curved road. A bend must not warp windows, cornices or a building's floorplan.
export function cityArchitecture(
  routeAt: Route,
  damageAt: (s: number) => number,
  random: () => number,
) {
  const concrete: CityBlock[] = [],
    masonry: CityBlock[] = [],
    steel: CityBlock[] = [],
    glass: CityBlock[] = [],
    rooms: CityBlock[] = [],
    darkRooms: CityBlock[] = [],
    lamps: CityBlock[] = [],
    housings: CityBlock[] = [],
    poles: CityBlock[] = [],
    rubble: CityBlock[] = [],
    embers: CityBlock[] = [];
  const rootAt = (s: number, offset: number) => {
    const p = routeAt(s),
      c = Math.cos(p.heading),
      sn = Math.sin(p.heading);
    return (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      shade = 1,
      tilt = 0,
    ) => ({
      x: p.x + c * (offset + x) + sn * z,
      y,
      z: p.z + sn * (offset + x) - c * z,
      w,
      h,
      d,
      shade,
      tilt,
      yaw: -p.heading,
    });
  };
  for (const side of [-1, 1]) {
    for (let row = 0; row < 2; row++) {
      for (let b = 0; b < 22; b++) {
        const s = b * 14 + random() * 2,
          damage = damageAt(s);
        const offset = side * (16.8 + row * 19 + random() * 1.4);
        const at = rootAt(s, offset),
          style = b % 3;
        const w = 8 + random() * 5,
          d = 10 + random() * 2.8;
        const floors = 5 + Math.floor(random() * (row ? 13 : 9) * (1 - damage * 0.45));
        const facing = -side,
          facadeX = facing * w * 0.5;
        const wall = style === 1 ? masonry : concrete;
        const tint = 0.65 + random() * 0.32;
        const ruinSide = random() > 0.5 ? -1 : 1;
        for (let f = 0; f < floors; f++) {
          const y = f * 3.25;
          const ruined = f > floors * (1 - damage * 0.75) && random() < 0.3 + damage * 0.55;
          // Intact horizontal slabs carry weight; only a collapsed corner
          // exposes the next floor. No globally floating scaffold shelves.
          concrete.push(
            at(
              ruined ? -ruinSide * w * 0.14 : 0,
              y + 0.14,
              0,
              w * (ruined ? 0.65 : 1),
              0.3,
              d,
              tint,
              ruined ? ruinSide * 0.025 : 0,
            ),
          );
          for (const cx of [-w * 0.46, w * 0.46]) {
            for (const z of [-d * 0.45, d * 0.45]) {
              if (ruined && cx * ruinSide > 0 && random() < 0.6) continue;
              concrete.push(at(cx, y + 1.72, z, 0.46, 3.2, 0.48, tint * 0.9));
            }
          }
          // Four genuinely recessed rooms per street-facing floor.
          const bay = d / 4;
          for (let j = 0; j < 4; j++) {
            const z = -d / 2 + bay * (j + 0.5);
            const missing = ruined && random() < 0.6 + damage * 0.25;
            if (missing) {
              steel.push(
                at(facadeX, y + 1.1, z - bay * 0.35, 0.045, 2.3, 0.045, 0.55, 0.25 * side),
              );
              continue;
            }
            const sill = style === 2 ? 0.85 : 0.68,
              openingH = 2.1;
            wall.push(at(facadeX, y + sill / 2 + 0.22, z, 0.46, sill, bay, tint));
            wall.push(at(facadeX, y + 3.02, z, 0.48, 0.46, bay, tint * 0.91));
            const sillTop = 0.22 + sill,
              lintelBottom = 2.79;
            wall.push(
              at(
                facadeX,
                y + (sillTop + lintelBottom) * 0.5,
                z - bay * 0.47,
                0.48,
                lintelBottom - sillTop,
                0.24,
                tint,
              ),
            );
            const paneX = facadeX - facing * 0.18,
              backX = facadeX - facing * 1.35;
            const lit = f < floors - 1 && random() < 0.17 * (1 - damage * 0.7);
            // Visible ceiling / side return make the light a room, not a decal.
            darkRooms.push(at(backX, y + 1.8, z, 0.16, 2.5, bay * 0.81, 0.5));
            concrete.push(at(facadeX - facing * 0.73, y + 2.83, z, 1.6, 0.12, bay * 0.8, 0.36));
            concrete.push(
              at(facadeX - facing * 0.73, y + 1.7, z - bay * 0.39, 1.6, 2.3, 0.12, 0.3),
            );
            if (lit) {
              rooms.push(
                at(
                  backX + facing * 0.095,
                  y + 1.82,
                  z,
                  0.025,
                  1.85,
                  bay * 0.74,
                  0.24 + random() * 0.55,
                ),
              );
              // Curtains/blinds and a horizontal desk cut into the warm room.
              steel.push(at(backX + facing * 0.15, y + 1.1, z, 0.12, 0.14, bay * 0.7, 0.32));
              for (let slat = 0; slat < 3; slat++)
                steel.push(
                  at(
                    paneX - facing * 0.06,
                    y + 2.18 + slat * 0.16,
                    z,
                    0.035,
                    0.035,
                    bay * 0.75,
                    0.5,
                  ),
                );
            }
            const brokenGlass = random() < damage * 0.35;
            if (!brokenGlass)
              glass.push(at(paneX, y + 1.8, z, 0.022, openingH, bay * 0.76, 0.6 + random() * 0.35));
            // Narrow metal mullions, deep concrete sill, drips / service pipes.
            for (const dz of [-bay * 0.39, 0, bay * 0.39])
              steel.push(
                at(facadeX + facing * 0.045, y + 1.83, z + dz, 0.1, openingH, 0.065, 0.75),
              );
            for (const dy of [0.76, 2.86])
              steel.push(at(facadeX + facing * 0.07, y + dy, z, 0.12, 0.07, bay * 0.84, 0.8));
            concrete.push(
              at(facadeX + facing * 0.16, y + 0.65, z, 0.8, 0.1, bay * 0.93, tint * 0.88),
            );
            if (f % 3 === 1 && j === 3) {
              housings.push(at(facadeX + facing * 0.38, y + 0.32, z, 0.7, 0.45, 0.88, 0.6));
              for (let l = 0; l < 4; l++)
                steel.push(
                  at(facadeX + facing * 0.75, y + 0.18 + l * 0.095, z, 0.025, 0.035, 0.76, 0.8),
                );
            }
          }
          // Front / rear returns close the silhouette, with a smaller window.
          for (const end of [-1, 1]) {
            if (ruined && end === ruinSide) continue;
            const z = end * d * 0.49;
            wall.push(at(0, y + 0.6, z, w, 0.92, 0.38, tint * 0.82));
            wall.push(at(0, y + 2.95, z, w, 0.53, 0.4, tint));
            for (let c = -1; c <= 1; c++) {
              wall.push(at(c * w * 0.32, y + 1.77, z, w * 0.12, 2.5, 0.4, tint));
              glass.push(
                at(c * w * 0.32 + w * 0.15, y + 1.8, z - end * 0.1, w * 0.15, 1.77, 0.04, 0.58),
              );
            }
          }
          if (f % 3 === 0 && style === 1)
            concrete.push(
              at(facadeX + facing * 0.16, y + 3.17, 0, 0.76, 0.13, d + 0.3, tint * 0.96),
            );
        }
        const roof = floors * 3.25;
        if (damage < 0.6) {
          concrete.push(at(w * 0.18, roof + 1.25, d * 0.18, w * 0.37, 2.5, d * 0.32, tint * 0.65));
          housings.push(at(-w * 0.2, roof + 0.42, -d * 0.15, 2.3, 0.8, 1.7, 0.6));
          steel.push(at(w * 0.27, roof + 4, 0, 0.05, 6.4, 0.05, 0.7));
          steel.push(at(w * 0.27, roof + 5.6, 0, 2.6, 0.045, 0.06, 0.7));
        } else {
          for (let r = 0; r < 7; r++)
            steel.push(
              at(
                (random() - 0.5) * w,
                roof + random() * 1.5,
                (random() - 0.5) * d,
                0.04,
                2 + random() * 2,
                0.04,
                0.6,
                (random() - 0.5) * 0.6,
              ),
            );
        }
        // Ground-level shutter and shop canopy give a human scale to the street.
        if (row === 0 && b % 2 === 0 && damage < 0.7) {
          housings.push(at(facadeX + facing * 0.25, 1.4, d * 0.12, 0.32, 2.55, 3.8, 0.62));
          for (let slat = 0; slat < 13; slat++)
            steel.push(
              at(facadeX + facing * 0.44, 0.22 + slat * 0.185, d * 0.12, 0.08, 0.035, 3.8, 0.72),
            );
          housings.push(at(facadeX + facing * 0.65, 3.05, d * 0.12, 1.6, 0.16, 4.3, 0.56));
        }
      }
    }
    for (let i = 0; i < 450; i++) {
      const s = random() * 290,
        damage = damageAt(s),
        size = 0.18 + random() * (0.6 + damage * 3.9);
      const at = rootAt(s, side * (6.7 + random() * 8.5));
      rubble.push(
        at(
          0,
          size * 0.19,
          0,
          size,
          size * (0.16 + random() * 0.27),
          size * (0.5 + random() * 0.6),
          0.55 + random() * 0.4,
          (random() - 0.5) * 0.85,
        ),
      );
      if (i % 15 === 0 && damage > 0.4) embers.push(at(0, 0.2, 0, size * 0.4, 0.035, size * 0.22));
    }
    for (let i = 0; i < 15; i++) {
      const s = 10 + i * 19,
        at = rootAt(s, side * 9.6),
        broken = i > 6 && i % 2 === 0;
      poles.push(
        at(0, broken ? 1.6 : 3.45, 0, 0.13, 6.9, 0.13, 0.8, broken ? side * 1.17 : side * 0.018),
      );
      if (broken) continue;
      poles.push(at(-side * 0.75, 6.88, 0, 0.09, 1.65, 0.09, 0.8, (side * Math.PI) / 2));
      housings.push(at(-side * 1.65, 6.8, 0, 0.94, 0.18, 0.48, 0.8));
      lamps.push(at(-side * 1.65, 6.695, 0, 0.78, 0.025, 0.34));
    }
  }
  return {
    concrete,
    masonry,
    steel,
    glass,
    rooms,
    darkRooms,
    lamps,
    housings,
    poles,
    rubble,
    embers,
  };
}
