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
