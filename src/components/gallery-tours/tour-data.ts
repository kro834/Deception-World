import { GALLERY_ARTWORKS, type GalleryArtwork } from "../gallery/gallery-data.ts";

export type GalleryTourStop = { artworkId: string; note: string };
export type GalleryTour = {
  id: string;
  title: string;
  kicker: string;
  description: string;
  accent: string;
  coverId: string;
  stops: readonly GalleryTourStop[];
};

// These routes connect visible colors and compositions, not events in story canon.
export const GALLERY_TOURS: readonly GalleryTour[] = [
  {
    id: "starlight",
    title: "星光をたどる",
    kicker: "LIGHT & ARMOUR",
    description:
      "仮面を縁取る細い光から、胸章の虹色、白い空間へ広がる装飾まで。装甲の表面と背景を行き来しながら、光の見え方をたどります。",
    accent: "#82caff",
    coverId: "g113",
    stops: [
      {
        artworkId: "g05",
        note: "黒い仮面の中に走る青緑の光を追ってみてください。接写された輪郭から、装甲の形が見えてきます。",
      },
      {
        artworkId: "g07",
        note: "白銀の装甲と、背後に浮かぶ星の光輪に注目します。身体の輪郭と背景の円が、異なる形で光を囲んでいます。",
      },
      {
        artworkId: "g08",
        note: "胸の七色の光へ視線を移すと、周囲の黒と金がその色を引き立てています。先ほどの白銀との印象の違いも味わえます。",
      },
      {
        artworkId: "g94",
        note: "白く発光する目と青い装甲を近くで見ます。背景に広がる星光と、表面を走る光の線を見比べてください。",
      },
      {
        artworkId: "g21",
        note: "差し出された手から肩、そして星空へと視線を動かします。金と桃色の光が、手前から奥まで続いています。",
      },
      {
        artworkId: "g90",
        note: "背景が明るい白へ変わると、金の縁取りと背後へ伸びる曲線が見やすくなります。暗い背景の作品との見え方の差を楽しめます。",
      },
      {
        artworkId: "g113",
        note: "最後は三人の装甲を左から右へ見渡します。白銀と紅、金と桃色、白銀と金の配色が、同じ星空の中に並んでいます。",
      },
    ],
  },
  {
    id: "rain-motion",
    title: "雨と動きの輪郭",
    kicker: "RAIN & MOTION",
    description:
      "濡れた路面、雨の森、水飛沫の中に描かれた姿を巡ります。足の置き方や腕の向きに目を向けると、一枚の中にある動きが見えてきます。",
    accent: "#b0b9e9",
    coverId: "g50",
    stops: [
      {
        artworkId: "g25",
        note: "横に構えられた青い剣と、濡れた道路を見比べます。刃の長い線が、地面に近いところを横切っています。",
      },
      {
        artworkId: "g50",
        note: "足を踏み出す姿勢と、肩の大型装備に注目します。雨の降る街の中で、身体の重さを感じさせる構えです。",
      },
      {
        artworkId: "g53",
        note: "ここでは装甲から人物の横顔へ視点が移ります。長い髪とコートの暗い面を、青い稲妻が縁取っています。",
      },
      {
        artworkId: "g54",
        note: "手前へ突き出された拳から、奥にある肩へと目を戻してみてください。雨の森を背景に、紫の結晶の形が重なっています。",
      },
      {
        artworkId: "g55",
        note: "片膝と地面に置いた手が、低い姿勢をつくっています。森に広がる炎と雨の組み合わせにも目を向けてみましょう。",
      },
      {
        artworkId: "g36",
        note: "向き合う腕の動きを、水飛沫が取り囲んでいます。黒と紅、白と緑の配色を手がかりに、二つの姿を追えます。",
      },
      {
        artworkId: "g79",
        note: "最後は街路の低い位置へ視線を移します。石畳に触れる片手と滑るような姿勢を、並ぶ灯りと一緒に見渡してください。",
      },
    ],
  },
  {
    id: "quiet-portraits",
    title: "静かな横顔",
    kicker: "FACES & GESTURES",
    description:
      "後ろ姿、横顔、襟元に添えた手など、小さな仕草に目を向ける展示です。人物とその周囲に残された余白を、ゆっくり眺めます。",
    accent: "#d9bba0",
    coverId: "g111",
    stops: [
      {
        artworkId: "g26",
        note: "夕日の差す川沿いを歩く後ろ姿から始めます。顔の見えない構図の中で、道と身体の向きに視線を沿わせてみてください。",
      },
      {
        artworkId: "g44",
        note: "古い倉庫に佇む人物と、その周囲の空間に注目します。黒いハイネックの服が、背景とどのように重なるかを眺めます。",
      },
      {
        artworkId: "g74",
        note: "白い背景の前では、黒と深緑の上着や襟元の手が際立ちます。大きな動きではなく、指先の位置を見てみましょう。",
      },
      {
        artworkId: "g58",
        note: "向き合う二人の横顔の間にある、小さな余白に目を向けます。赤いリボンと銀髪が、画面の中で異なる色の目印になっています。",
      },
      {
        artworkId: "g88",
        note: "目を閉じた表情と黒いパーカーを眺めた後、周囲の文字や下部のロゴまで視線を広げます。肖像と告知の配置が一枚に重なっています。",
      },
      {
        artworkId: "g107",
        note: "鳥居の下で話す二人を、黒い服と白いコートの対比から見ていきます。木々の光と赤い鳥居が、人物の周りを囲んでいます。",
      },
      {
        artworkId: "g111",
        note: "窓辺から外を見る白髪の横顔で、この展示を結びます。木の窓枠を境に、暗い室内と明るい竹林が広がっています。",
      },
    ],
  },
  {
    id: "boundaries",
    title: "景色の境界",
    kicker: "PLACES & FRAMES",
    description:
      "通路を見下ろす視点から、水面、結晶、浮島へ。人物だけでなく、画面を囲む建物や地面、空の形を手がかりに景色を巡ります。",
    accent: "#a6c6b3",
    coverId: "g70",
    stops: [
      {
        artworkId: "g45",
        note: "商業施設の通路を上から見た構図です。中央の装甲姿だけでなく、周囲の通路が画面をどう区切っているかにも注目します。",
      },
      {
        artworkId: "g16",
        note: "桜色の景色と寺院へ視線を広げます。手前の装甲と、背後に続く建物や空の色を順に見てみてください。",
      },
      {
        artworkId: "g49",
        note: "大きな社の前に立つ姿と、周囲に積もる雪を眺めます。黒と金の装甲が、明るい雪景色の中で輪郭をつくっています。",
      },
      {
        artworkId: "g46",
        note: "ここでは人物が画面から離れ、赤い水面と黒い日輪が中心になります。水面に並ぶ黒い突起と、空にある円を見比べます。",
      },
      {
        artworkId: "g60",
        note: "白い結晶状の空間の中に、四つの色の装甲姿が置かれています。上から見た視点を意識すると、人物同士の位置関係が見えてきます。",
      },
      {
        artworkId: "g70",
        note: "浮島と山並み、赤い噴水が描かれた景色です。重なる文章片も画面の一部として、風景との配置を眺めてください。",
      },
      {
        artworkId: "g112",
        note: "最後は青緑に光る培養槽の並ぶ施設へ。中央と左右の装甲姿、さらに奥の大型の槽へと、視線を順番に移してみましょう。",
      },
    ],
  },
  {
    id: "design-lines",
    title: "仮面から車体へ",
    kicker: "MASKS & MACHINES",
    description:
      "仮面の輪郭、バイクの装甲、作品を飾るロゴをつなぐ展示です。黒い背景に置かれた形を見比べながら、光の線と配色を楽しめます。",
    accent: "#dfc387",
    coverId: "g84",
    stops: [
      {
        artworkId: "g81",
        note: "青白く光る仮面の輪郭と、EXの文字から始めます。黒い余白が広いぶん、少ない線でも形を感じ取れます。",
      },
      {
        artworkId: "g80",
        note: "仮面に加えてロゴが配置された構図です。前の作品と見比べると、文字が加わったことで視線の行き先が変わります。",
      },
      {
        artworkId: "g83",
        note: "金の角と青、桃色の光を持つ仮面に移ります。細長い角から下へ伸びる輪郭を追うと、色の境目も見えてきます。",
      },
      {
        artworkId: "g84",
        note: "同じ暗い背景でも、ここでは車体全体の形が現れます。青い光をたどりながら、前輪から車体の先端、後輪へと見渡します。",
      },
      {
        artworkId: "g85",
        note: "白と金の装甲を持つ車体です。ひとつ前の青いバイクと、面の明るさや青白い光の見え方を比べてみてください。",
      },
      {
        artworkId: "g86",
        note: "ロゴの文字そのものを、ひとつの形として眺めます。青、白、金の光が、文字や周囲の線に沿って配置されています。",
      },
      {
        artworkId: "g89",
        note: "最後は全身の装甲姿、文章、ロゴをまとめたポスターです。上から下まで目を移し、それぞれが占める場所を見てみましょう。",
      },
    ],
  },
];

const toursById = new Map(GALLERY_TOURS.map((tour) => [tour.id, tour]));
const artworksById = new Map(GALLERY_ARTWORKS.map((artwork) => [artwork.id, artwork]));

export function getGalleryTour(id: unknown): GalleryTour | undefined {
  return typeof id === "string" ? toursById.get(id) : undefined;
}

export function getTourArtwork(id: string): GalleryArtwork | undefined {
  return artworksById.get(id);
}

export function normalizeTourSearch(input: Record<string, unknown>): {
  tour?: string;
  work?: string;
} {
  const tour = getGalleryTour(input.tour);
  if (!tour) return {};
  return typeof input.work === "string" && tour.stops.some((stop) => stop.artworkId === input.work)
    ? { tour: tour.id, work: input.work }
    : { tour: tour.id };
}

export function getTourStopIndex(tour: GalleryTour, workId?: string): number {
  return Math.max(
    0,
    tour.stops.findIndex((stop) => stop.artworkId === workId),
  );
}
