export const SAGA_CINEMA_FILMS = [
  {
    title: "邂逅",
    roman: "KAIKŌ",
    part: "第一部",
    slug: "kaiko",
    image: "/saga-cinema-assets/chapter-1.jpg",
    palette: [220, 167, 128],
  },
  {
    title: "覚醒",
    roman: "KAKUSEI",
    part: "第二部",
    slug: "kakusei",
    image: "/saga-cinema-assets/chapter-2.jpg",
    palette: [170, 201, 223],
  },
  {
    title: "激情",
    roman: "GEKIJŌ",
    part: "第三部",
    slug: "gekijo",
    image: "/saga-cinema-assets/chapter-3.jpg",
    palette: [216, 149, 120],
  },
  {
    title: "終末",
    roman: "SHŪMATSU",
    part: "第四部",
    slug: "shumatsu",
    image: "/saga-cinema-assets/chapter-4.jpg",
    palette: [141, 204, 240],
  },
] as const;

export const SAGA_CINEMA_LOGO = "/saga-cinema-assets/saga-logo-original.webp";
export const SAGA_CINEMA_LOGO_SRCSET = `/saga-cinema-assets/saga-logo-640.webp 640w, ${SAGA_CINEMA_LOGO} 1536w`;
// Match the hero grid, its 760px copy cap and the inherited 0/4vw/6vw copy padding.
export const SAGA_CINEMA_LOGO_SIZES =
  "(max-width: 760px) 93.28vw, (max-width: 840px) min(calc(90.3vw - 357px), calc(56.4375vw - 19.6875px)), (max-width: 1100px) min(calc(86.1vw - 357px), calc(52.2375vw - 19.6875px)), (max-width: 1120px) 48.3vw, min(46.2vw, calc(798px - 6.3vw))";
export const SAGA_CINEMA_TITLE = "映画『仮面ライダーサーガ』4部作 公式サイト";
export const cinemaNumber = (index: number) => String(index + 1).padStart(2, "0");
export const cinemaWrap = (index: number) =>
  ((index % SAGA_CINEMA_FILMS.length) + SAGA_CINEMA_FILMS.length) % SAGA_CINEMA_FILMS.length;
export const cinemaPosterAlt = (index: number) =>
  `${SAGA_CINEMA_FILMS[index].part}『${SAGA_CINEMA_FILMS[index].title}』のポスター`;
export const cinemaDownload = (index: number) =>
  `kamen-rider-saga-${SAGA_CINEMA_FILMS[index].slug}.jpg`;

export async function loadCinemaPoster(index: number) {
  const image = new Image();
  if (typeof image.decode === "function") {
    image.src = SAGA_CINEMA_FILMS[index].image;
    await image.decode();
    if (!image.naturalWidth) throw new Error("Poster unavailable");
    return;
  }
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Poster unavailable"));
    image.src = SAGA_CINEMA_FILMS[index].image;
  });
}
