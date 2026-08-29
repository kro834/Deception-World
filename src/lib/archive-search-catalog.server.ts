import type { ArchiveSearchCandidate } from "./archive-search";

type CatalogRow = readonly [id: string, label: string, kicker: string, description: string];

/**
 * Server-owned mirror of the public navigation records. Client supplied labels
 * and descriptions are never forwarded to the model or echoed by fallbacks.
 */
const ARCHIVE_SEARCH_CATALOG = [
  [
    "opening",
    "オープニング",
    "OPENING / ENTRY",
    "映像と音でDeception Worldへ入る、サイトのオープニングです。",
  ],
  [
    "world-top",
    "Deception World トップ",
    "WORLD / TOP",
    "作品世界の入口と、主要な記録への総合案内です。",
  ],
  [
    "world-story",
    "ストーリーと世界観",
    "WORLD / STORY",
    "脚本制、採録制、六詠、レジェンズなど、この世界の基本設定を読めます。",
  ],
  [
    "world-riders",
    "八人のライダー一覧",
    "WORLD / RIDERS",
    "八人のライダーを見比べ、それぞれの個別資料へ進める一覧です。",
  ],
  [
    "world-records",
    "判明済みエピソード",
    "WORLD / RECORDS",
    "HIDE-AND-SEEKからFARCEまで、判明済みの事件とエピソード記録です。",
  ],
  [
    "world-managers",
    "六詠・管理人一覧",
    "WORLD / RIKUEI",
    "世界を管理する六詠六名の概要と、それぞれの個別資料への入口です。",
  ],
  [
    "rider-saga",
    "サーガ",
    "RIDER FILE / 01",
    "月城悠真／シエルと、第一のライダー・サーガの人物、能力、各フォームの資料です。",
  ],
  [
    "rider-realm",
    "レルム",
    "RIDER FILE / 02",
    "ベル・アレインと、第二のライダー・レルムの人物、能力、各フォームの資料です。",
  ],
  [
    "rider-lore",
    "ローア",
    "RIDER FILE / 03",
    "ローアと、第三のライダー・ローアの人物、戦闘、能力に関する資料です。",
  ],
  [
    "rider-vandal",
    "ヴァンダール",
    "RIDER FILE / 04",
    "レックス・ロワが変身する、第四のライダー・ヴァンダールの資料です。",
  ],
  [
    "rider-leddic",
    "レディック",
    "RIDER FILE / 05",
    "在原華火が変身する、第五のライダー・レディックと関連フォームの資料です。",
  ],
  [
    "rider-argenome",
    "アルゲノム",
    "RIDER FILE / 06",
    "紅城真守が変身する、第六のライダー・アルゲノムの資料です。",
  ],
  [
    "rider-over-zeztz",
    "オーバーゼッツ",
    "RIDER FILE / 07",
    "ジェームズ・スミスが変身する、第七のライダー・オーバーゼッツの資料です。",
  ],
  [
    "rider-cipher",
    "サイファー",
    "RIDER FILE / 08",
    "リュシアン・ヴァレールが変身する、第八のライダー・サイファーの機密資料です。",
  ],
  [
    "manager-zeus",
    "ゼウス",
    "RIKUEI / I",
    "主権を継いだ六詠第一位、ゼウスの人物、権限、戦闘資料です。",
  ],
  [
    "manager-rex-loi",
    "レックス・ロワ",
    "RIKUEI / II",
    "真の選択肢を残す六詠第二位、レックス・ロワの管理人資料です。",
  ],
  [
    "manager-shuza",
    "シュザ",
    "RIKUEI / III",
    "最上位の戦闘演算を担う六詠第三位、シュザの管理人資料です。",
  ],
  [
    "manager-lejas",
    "レジャス",
    "RIKUEI / IV",
    "真実だけで破滅を組み上げる六詠第四位、レジャスの管理人資料です。",
  ],
  [
    "manager-opus",
    "オパス",
    "RIKUEI / V",
    "祈願と代価を処理する六詠第五位、オパスの管理人資料です。",
  ],
  [
    "manager-reemu",
    "リームー",
    "RIKUEI / VI",
    "責任から逃れる観測者、六詠第六位・リームーの管理人資料です。",
  ],
  [
    "character-terra",
    "テラ・アレイン",
    "RELATED / 01",
    "世界の物質的基盤を支える共同当主、テラ・アレインの人物・能力資料です。",
  ],
  [
    "character-luna",
    "ルナ・アレイン",
    "RELATED / 02",
    "関係と軌道を守る共同当主、ルナ・アレインの人物・能力資料です。",
  ],
  [
    "dream-top",
    "映画『DREAM CHAPTER』",
    "MOVIE 01 / TOP",
    "映画第一作『DREAM CHAPTER』の特設サイトと作品概要です。",
  ],
  [
    "dream-posters",
    "DREAM CHAPTER ポスター",
    "MOVIE 01 / POSTERS",
    "映画の八種類のポスターを切り替えて鑑賞できるギャラリーです。",
  ],
  [
    "dream-characters",
    "DREAM CHAPTER 登場人物",
    "MOVIE 01 / CHARACTERS",
    "シエル、東風谷慶弥、怪作ら、映画の登場人物と人物資料です。",
  ],
  [
    "dream-dolminence",
    "DOLMINENCE 資料",
    "MOVIE 01 / DOLMINENCE",
    "ロードナイト、ロードケイオス、ドレッド、ルパンらの能力・戦闘資料です。",
  ],
  [
    "dream-cases",
    "DREAM CHAPTER エピソード",
    "MOVIE 01 / CASES",
    "『交わる』から『叛く』まで、映画を構成する六つのケースです。",
  ],
  [
    "rexonance-top",
    "レクソナンスサーガ",
    "SPECIAL / REXONANCE",
    "無限出力を実効攻撃へ変える、サーガシステムの次世代到達点の特設サイトです。",
  ],
  [
    "rexonance-performance",
    "レクソナンス性能比較",
    "REXONANCE / PERFORMANCE",
    "パンチ、キック、跳躍、走力、演算性能を既存フォームと比較できます。",
  ],
  [
    "rexonance-p14",
    "レクソナンス P14演算コア",
    "REXONANCE / P14",
    "出力変換、位相制御、能力間調停を統合した第14世代演算基盤の資料です。",
  ],
  [
    "rexonance-stages",
    "レクソナンス 三つの運用段階",
    "REXONANCE / STAGES",
    "レクソナンス、マックス、ウルトラの三段階を切り替えて確認できます。",
  ],
  [
    "rexonance-system",
    "トリニティ・レゾナンス",
    "REXONANCE / SYSTEM",
    "超自己進化、絶対秩序、月城悠真の意思を束ねる中核システムです。",
  ],
  [
    "extreme-top",
    "エクスプリームサーガ",
    "SPECIAL / EXTREME",
    "可能性を増殖し、ただ一つの勝利結果へ束ねる至高形態の特設サイトです。",
  ],
  [
    "extreme-performance",
    "エクスプリーム性能比較",
    "EXTREME / COMPARISON",
    "エクスプリームの公開性能を、ほかのサーガ形態と比較できます。",
  ],
  [
    "extreme-p14",
    "エクスプリーム P14演算コア",
    "EXTREME / P14",
    "勝利経路の増殖と結果固定へ最適化された、エクスプリーム専用P14です。",
  ],
  [
    "extreme-stages",
    "エクスプリーム 二つの運用段階",
    "EXTREME / STAGES",
    "エクスプリームとウルトラ、二つの運用段階を切り替えて確認できます。",
  ],
  [
    "extreme-system",
    "エクスプリーム中核システム",
    "EXTREME / SYSTEM",
    "可能性の増殖、勝利経路の選別、結果固定を担う中核システムです。",
  ],
  [
    "form-archive",
    "フォームアーカイブ",
    "SYSTEM / FORM ARCHIVE",
    "サーガ／レルムの各フォームを選択し、詳細、性能、能力、二形態比較を確認できます。",
  ],
] as const satisfies readonly CatalogRow[];

const catalogById = new Map<string, ArchiveSearchCandidate>(
  ARCHIVE_SEARCH_CATALOG.map(([id, label, kicker, description]) => [
    id,
    { id, label, kicker, description },
  ]),
);

export function canonicalizeArchiveSearchCandidates(
  candidates: readonly Pick<ArchiveSearchCandidate, "id">[],
): ArchiveSearchCandidate[] {
  const seen = new Set<string>();
  const trusted: ArchiveSearchCandidate[] = [];
  for (const candidate of candidates) {
    const canonical = catalogById.get(candidate.id);
    if (!canonical || seen.has(canonical.id)) continue;
    seen.add(canonical.id);
    trusted.push({ ...canonical });
  }
  return trusted.slice(0, 3);
}
