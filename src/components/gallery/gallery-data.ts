import { GALLERY_ASSETS } from "./gallery-assets.ts";

export type GalleryCategory = "scenes" | "portraits" | "places";
export type GalleryArtwork = {
  id: string;
  title: string;
  alt: string;
  category: GalleryCategory;
  width: number;
  height: number;
  thumb: string;
  medium: string;
  full: string;
  srcSet: string;
};

// Exhibition labels describe the supplied pictures, not new story canon.
const galleryDetails: Array<[string, string, GalleryCategory]> = [
  ["夕街を駆ける", "夕焼けの荒れた商店街を駆ける青と金の装甲姿", "scenes"],
  ["廃墟に差す星光", "夕暮れの廃墟の壁に立つ青緑と桃色と金の装甲姿", "portraits"],
  ["夕空の対峙", "崩れた街で青緑の装甲姿と紫の浮遊する姿が向き合う場面", "scenes"],
  ["金と紫の双影", "夕暮れの廃墟に立つ金の装甲姿と、傍らで低く構える紫の装甲姿", "scenes"],
  ["蒼い仮面", "青緑に発光する黒い仮面と胸部装甲の接写", "portraits"],
  ["白銀の輪郭", "青い光をまとった白銀の仮面と装甲の上半身", "portraits"],
  ["星の光輪", "星の光輪を背にした白銀と青と金の装甲姿", "portraits"],
  ["虹彩の胸章", "星の光輪を背に、胸に七色の光を宿す黒と金の装甲姿", "portraits"],
  ["星光の装甲", "白く光る目と青い星光を備えた黒と金の装甲の接写", "portraits"],
  ["伸ばした手", "星空の中でこちらに手を伸ばす金と桃色の装甲姿", "portraits"],
  ["聖堂の星光", "大きな聖堂に佇む金と桃色と青の装甲姿", "portraits"],
  ["閃光の飛び蹴り", "崩れた街で色鮮やかな閃光をまとい、飛び蹴りを放つ装甲姿", "scenes"],
  ["雪中の二刀", "雪の積もる廃墟で二本の剣を構える金と桃色の装甲姿", "scenes"],
  ["双剣の佇まい", "崩れた建物を背に二本の剣を持って立つ装甲姿", "portraits"],
  ["金色の間", "金色の宮殿の中で並ぶ金髪の人物と銀髪の人物", "portraits"],
  ["桜の都", "桜色の景色と寺院を背に立つ、胸に七色の光を宿す装甲姿", "places"],
  ["橋上の激突", "吊り橋の上で青い装甲姿が七色の胸章を持つ装甲姿に拳を放つ場面", "scenes"],
  [
    "黄金の招き",
    "琥珀色のデジタル空間で手を伸ばす、肩に大型装備を備えた黒と金の装甲姿",
    "portraits",
  ],
  ["虹光の招き", "青いデジタル空間で手を伸ばす七色の胸章を持つ装甲姿", "portraits"],
  ["蒼星の招き", "星空を背にこちらへ手を伸ばす青と金の装甲姿", "portraits"],
  ["星彩の招き", "星空を背にこちらへ手を伸ばす金と桃色の装甲姿", "portraits"],
  ["高架の双剣", "夜の高架道路で二本の剣を持つ装甲姿を上から見た構図", "scenes"],
  ["倉庫の白金", "暗い倉庫で長い青緑の刃を持つ白と金の装甲姿", "portraits"],
  ["倉庫の翠金", "暗い倉庫の通路を歩く青緑と金の装甲姿と長い剣", "portraits"],
  ["路上の星剣", "濡れた道路で青い剣を横に構える星光の装甲姿", "scenes"],
  ["夕景の後ろ姿", "夕日の差す川沿いの道を歩く黒い服の人物の後ろ姿", "portraits"],
  ["交差する刃", "倉庫で黒と金の剣士と赤い剣士の紫と赤の刃が交差する場面", "scenes"],
  ["拳と掌", "倉庫で青い装甲姿の攻撃を青緑の装甲姿が掌で受け止める場面", "scenes"],
  ["並び立つ紅と翠", "金色の光環を背に倉庫で並び立つ赤と青緑の装甲姿", "portraits"],
  ["星流の蹴撃", "星空で青と桃色の光の渦をまとって蹴りを放つ装甲姿", "scenes"],
  [
    "ネオンの攻防",
    "ゲームセンターで桃色と青の装甲姿の蹴りを黒と金の装甲姿が受け止める場面",
    "scenes",
  ],
  [
    "夜遊園地の対峙",
    "赤く光る観覧車の前で黒と紅の棘を持つ装甲姿と青と金の装甲姿が向き合う場面",
    "scenes",
  ],
  ["夜を歩く棘", "夜の遊園地でこちらへ歩く黒と紅と深緑の鋭い装甲姿", "portraits"],
  ["焼け空の蒼", "オレンジ色の夕空と崩れた街を背に立つ青い星光の装甲姿", "portraits"],
  ["焼け空の虹", "オレンジ色の夕空と崩れた街を背に立つ七色の胸章を持つ装甲姿", "portraits"],
  [
    "水飛沫の攻防",
    "噴水の水しぶきの中で黒と紅の装甲姿の攻撃を白と緑と金の装甲姿が受け止める場面",
    "scenes",
  ],
  ["紅晶の剣士", "黒と赤の背景で赤い剣を持つ紅い結晶状の装甲姿", "portraits"],
  ["紅と蒼の剣士", "黒と赤の背景で赤い剣を持つ白銀と赤と青の装甲姿", "portraits"],
  ["星彩の着地", "虹色の光が差す街で片膝をつき、地面に手を置く金と青と桃色の装甲姿", "scenes"],
  ["桜路の剣閃", "桜の咲く街路で赤い剣士と黒と金の剣士が刃を振るう場面", "scenes"],
  ["廃都の白帽", "崩れた街を見下ろす電線の束に座る、白い帽子と白いコートの人物", "portraits"],
  ["廃墟の笑み", "崩れた街で両腕を広げて笑う黒髪と黒い服の人物", "portraits"],
  ["紫の静刃", "紫の煙を背に、刃を正面に立てて持つ黒と金の装飾を備えた剣士", "portraits"],
  ["倉庫の人影", "古い倉庫に佇む黒いハイネックの服を着た黒髪の人物", "portraits"],
  ["俯瞰の白銀", "商業施設の通路に立つ白銀と青の装甲姿を上から見た構図", "places"],
  ["紅い日食", "黒い突起の並ぶ赤い水面の上に、赤く縁取られた黒い日輪が浮かぶ風景", "places"],
  ["晴天の二人", "青空を背に並ぶ黒と金の装甲姿と白銀の装甲姿", "portraits"],
  ["深紅の電流", "赤い電流を拳に集め、低く構える白銀と赤の装甲姿", "scenes"],
  ["雪の社", "雪の積もる大きな社の前に立つ、肩に大型装備を備えた黒と金の装甲姿", "places"],
  ["雨中の重装", "雨の降る街でこちらへ足を踏み出す、肩に大型装備を備えた黒と金の装甲姿", "scenes"],
  ["紅晶の仮面", "赤い光の輪を背にした白銀と紅い結晶状の仮面の接写", "portraits"],
  ["月夜の照準", "青い月光の竹林で銃を構える白銀と青の装甲姿", "scenes"],
  ["雷雨の横顔", "雨の降る森で青い稲妻をまとう、長い黒髪と黒いコートの人物", "portraits"],
  ["紫晶の拳", "雨の降る森でこちらへ拳を突き出す紫の結晶状の装甲姿", "scenes"],
  ["炎雨の着地", "炎と雨の広がる森で片膝をつき、地面に手を置く黒と金の重装甲姿", "scenes"],
  ["赤い月と黒装", "赤い月と高層都市を背に、屋上に立つ黒いマントと黒い装甲の姿", "portraits"],
  ["月下の浮遊", "満月と夜の都市の上空に浮かび、長い翼状の装飾を広げる青と金の装甲姿", "scenes"],
  [
    "ふたりの横顔",
    "赤いリボンを付けた黒髪の人物と短い銀髪の人物が、近い距離で向き合う横顔",
    "portraits",
  ],
  ["四人の戦士", "燃えるような空と黒い日輪を背に並ぶ、紫と赤と白銀と金の四人の装甲姿", "portraits"],
  ["鏡面の四彩", "白い結晶状の空間で青と紫と赤と緑の四人の装甲姿を上から見た構図", "places"],
  ["光を背に進む", "強い光と崩れる建物を背に足を踏み出す七色の胸章を持つ装甲姿", "scenes"],
  ["廃墟を這う蒼", "崩れた街の地面で低く構え、手を伸ばす青と金の装甲姿", "scenes"],
  ["届きそうな手", "暗い空間で互いに向かって手を伸ばす黒い服の二人", "scenes"],
  ["七色の灯", "青い光の差す鉄格子の前で七色の炎のような光を手に宿す黒髪の人物", "portraits"],
  [
    "黄金の剣閃",
    "琥珀色のデジタル空間で青い剣を横に構える、肩に大型装備を備えた黒と金の装甲姿",
    "scenes",
  ],
];

export const GALLERY_CATEGORIES = [
  { id: "all", label: "すべて" },
  { id: "scenes", label: "情景・戦闘" },
  { id: "portraits", label: "人物" },
  { id: "places", label: "場所・世界観" },
] as const;

if (galleryDetails.length !== GALLERY_ASSETS.length)
  throw new Error("Gallery images and labels must stay aligned.");

export const GALLERY_ARTWORKS: readonly GalleryArtwork[] = GALLERY_ASSETS.map((asset, index) => {
  const [title, alt, category] = galleryDetails[index];
  const variants = [...asset.variants].sort((first, second) => first.width - second.width);
  const thumb = variants[0];
  const medium = variants.find((variant) => variant.width >= 900) ?? variants.at(-1)!;
  const full = variants.at(-1)!;
  const displayVariants = [
    ...new Map([thumb, medium].map((variant) => [variant.width, variant])).values(),
  ];
  return {
    id: asset.id,
    title,
    alt,
    category,
    width: asset.width,
    height: asset.height,
    thumb: thumb.path,
    medium: medium.path,
    full: full.path,
    srcSet: displayVariants.map((variant) => `${variant.path} ${variant.width}w`).join(", "),
  };
});
