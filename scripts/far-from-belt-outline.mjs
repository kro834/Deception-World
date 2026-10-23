// FAR FROM SAGA: the エクスサーガドライバー's real outline in the owner's ミドル
// cutout (design/far-from-suit-20261022/middle.webp = design/far-from-entry/
// middle-20261022.webp, 1024 x 1536 px), shared by the scroll suit-up's build
// (scripts/build-far-from-suit.mjs: the stand-in and the driver's plates) and
// the entry transformation's (scripts/build-far-from-entry.mjs: its belt
// plate), so both cut the same belt.
//
/** The driver's real outline (owner, 2026-10-23: 「腰回りのドライバーの切り抜きが
 * 甘い」 — the belt was the old coarse "belt" polygon plus whatever the pieces
 * before it left, so the stand-in carried scale chunks above the belt, ribbon
 * slivers under it and straight edges through the art). Traced over gridded
 * 8-10x crops of the cutout (cutout px): the left and right wing (outer lug,
 * crystal box, strap, inner crystal box; the two sides are not mirror images
 * in the art, so each is its own), the round core with its gold rim, and the
 * rim's spikes. Every edge that borders other armour runs through the art's
 * own dark outline; the silhouette side is the cutout's alpha. */
export const ellipse = (cx, cy, rx, ry, n = 64) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.round((cx + Math.cos(a) * rx) * 100) / 100, Math.round((cy + Math.sin(a) * ry) * 100) / 100];
  });
export const BELT_OUTLINE = [
  // left wing
  [[374,571],[384,566],[389,567.5],[392,559],[394,558],[421,555],[428,560],[429,565],[442,565],[443,560.5],[467,559.5],[471,563],[473,566],[490,566],[490,621],[458,621],[436,621],[418,622],[416,629],[402,634],[388,636],[380,639],[376,642],[368,650],[358,649],[353,646],[353,636],[361,606],[370,583]],
  // right wing
  [[534,566],[551,566],[553,563],[557,560],[582,560],[583,565],[596,565],[597,560],[604,555],[630,557.5],[633,559],[635,567],[640,566],[650,571],[655,582],[662,605],[667,622],[668,638],[667,648],[657,651],[649,644],[647,636],[625,632],[611,630],[609,622],[593,620],[591,625],[563,625],[534,625]],
  // the core: the gold rim, the crown spike above and the point below
  ellipse(512.8, 592, 43.4, 44.4),
  [[504,551],[512.5,533.5],[521,551]],
  [[502,633],[512.5,653.5],[523,633]],
  // the rim's four small shards (upper, lower) each side
  [[481,549],[489,553],[491,560],[484,559]],
  [[544,549],[536,553],[535,560],[542,559]],
  [[468,608],[477,610],[476,618],[468,619]],
  [[481,627],[491,622],[493,631],[489,637],[482,636]],
  [[549,610],[559,611],[559,619],[549,618]],
  [[546,627],[534,622],[532,631],[537,637],[547,636]],
];

