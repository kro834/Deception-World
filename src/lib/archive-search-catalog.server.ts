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

/**
 * Curated extracts from the linked public records. Keeping this material on
 * the server means SEARCH answers from repository-owned page content instead
 * of trusting browser-supplied descriptions or inventing unseen details.
 */
const ARCHIVE_SEARCH_REFERENCE_EXCERPTS: Readonly<Record<string, string>> = {
  opening:
    "Deception Worldへ入るための映像・音響演出です。タイトルから作品世界へ遷移する導入を担い、本編の資料を読む前に世界観の温度と緊張感を体験できます。",
  "world-top":
    "Deception World全体の入口です。世界観、判明済みエピソード、八人のライダー、六詠・管理人、関連人物や特設記録へ移動するための総合案内をまとめています。",
  "world-story":
    "この世界では、出来事が脚本として先に固定される『脚本制』と、起きた事実が後から記録される『採録制』が衝突します。六詠やレジェンズを含む物語の前提と、登場人物が決められた結末へ抗う構造を扱う記録です。",
  "world-riders":
    "サーガ、レルム、ローア、ヴァンダール、レディック、アルゲノム、オーバーゼッツ、サイファーの八人を一覧化しています。変身者と立場を見比べ、各ライダーの個別資料へ進めます。",
  "world-records":
    "HIDE-AND-SEEK、LEGENDS、FARCEなど、現在までに判明した事件とエピソードを時系列に沿って確認できます。人物単体ではなく、物語上の出来事や因果を探す際の参照先です。",
  "world-managers":
    "世界を管理する六詠六名を、順位、担当する権限、人物像とともに一覧化しています。ゼウスからリームーまでを比較し、それぞれの個別資料へ進めます。",
  "rider-saga":
    "月城悠真は19歳の青年で、主人公シエルに選ばれ、人類殲滅を強要された過去を持ちます。怪作の夢で呪縛から解放された後は、拒絶の力とサーガシステムを用い、奪われた世界を取り戻す側へ転じました。",
  "rider-realm":
    "ベル・アレインはREALMS元日本支部リーダーで、レルムズドライバー唯一の完全適合者です。明るく人当たりがよい一方、戦況、情報、人員配置、被害予測を同時に管理し、必要なら自ら最前線で決断を引き受けます。",
  "rider-lore":
    "ローアはサーガ世界の管理人で、かつてシエルを殺害しました。現在は弱体化して彼らと共闘していますが、正面戦闘を嫌い、不意打ちや物陰からの接近を好む卑怯さと、善意まで自ら踏みにじる矛盾を抱えます。",
  "rider-vandal":
    "ヴァンダールへ変身するレックス・ロワは六詠第二位の秩序の神です。世界そのものではなく支配だけを終わらせ、他者の選択を残す思想を持ち、管理権限を肉弾戦と裁定へ変換します。",
  "rider-leddic":
    "レディックへ変身する在原華火は24歳の捜査一課警部補です。本人が意識しない規格外の幸運で事件の核心へ到達し、柔道、空手、剣道、捕縛術と、能力を設計外へ転用する悪知恵を組み合わせます。",
  "rider-argenome":
    "アルゲノムへ変身する紅城真守は、幻想郷を救った紅魔館の執事です。『病を頂戴する』義賊として、ゲーマドライバーとガシャコンエッジを用い、索敵、無音接近、高速機動、駆除を一つの流れへ統合します。",
  "rider-over-zeztz":
    "ジェームズ・スミスは28歳、CODE英国支部のコードナンバー・セヴンです。普段は陽気で軽口を好みますが、任務に支障が出ると感情を切り離して最適解を選び、改良型ゼッツシステムで近接、銃器、潜入、解析を一人で担います。",
  "rider-cipher":
    "リュシアン・ヴァレールは30歳の特務情報官で、REALMS所属を伏せてSCARSへ潜入しています。味方から敵と誤解される状況自体を防壁にし、身分の証明より潜入任務の維持を優先する第八のライダーです。",
  "manager-zeus":
    "ゼウスは六詠第一位、『主権』を継いだ若い神です。普段は気さくで面倒事を嫌いますが、第一位として判断する瞬間には、いつもの口調のまま拒否する余地だけを消す絶対性を示します。",
  "manager-rex-loi":
    "レックス・ロワは六詠第二位で、秩序と選択を重んじます。力を持つ者の責任を自らへ課し、世界を壊すのではなく、他者の道を閉ざす支配だけを破壊する管理人です。",
  "manager-shuza":
    "シュザは六詠第三位として最上位の戦闘演算を担います。相手の欲望、行動、戦況を演算し、管理人の中でも直接戦闘へ特化した判断と実行を行う存在です。",
  "manager-lejas":
    "レジャスは六詠第四位で、虚偽を足さず、真実だけを配置して相手の選択と盤面を破滅へ導く管理人です。出来事を捏造するのではなく、提示順序と認識を操作する点が特徴です。",
  "manager-opus":
    "オパスは六詠第五位で、他者へ委ねられた祈願と、その実現に必要な代価を処理します。善悪を裁かず、警告後も願いが撤回されなければ、失われるものを算出して奇跡を成立させます。",
  "manager-reemu":
    "リームーは六詠第六位の観測者です。見ていないことにして責任の発生を避けようとする一方、知覚、防御、弱点解析を統合する天智とキジンソードで高速近接戦闘を行います。",
  "character-terra":
    "テラ・アレインは世界の物質的基盤を支える共同当主です。アレイン家と世界の安定に関わり、人物像、立場、物質へ作用する能力と関連形態を個別資料で確認できます。",
  "character-luna":
    "ルナ・アレインは関係と軌道を守る共同当主です。アレイン家のもう一方の軸として、人物像、他者との繋がり、軌道へ作用する能力と関連形態を扱います。",
  "dream-top":
    "映画第一作『DREAM CHAPTER』の作品概要と、悪夢をめぐる物語への入口です。ポスター、登場人物、DOLMINENCE、Case 1からCase 6までの各記録を一つの特設サイトにまとめています。",
  "dream-posters":
    "『DREAM CHAPTER』の八種類のポスターを切り替えて鑑賞できるギャラリーです。作品の場面や登場人物を、文章資料とは異なるキービジュアルから確認できます。",
  "dream-characters":
    "シエル、東風谷慶弥、怪作を中心とする映画の登場人物資料です。それぞれの人物像、立場、能力、映画内での関係性を、作品側の文脈で確認できます。",
  "dream-dolminence":
    "ロードナイト、ロードケイオス、ドレッド、ルパンらDOLMINENCE側の能力と戦闘資料をまとめています。映画に登場する敵対・関連存在の特徴を探すための記録です。",
  "dream-cases":
    "『交わる』から『叛く』まで、映画を構成する六つのCaseを収録しています。特定の場面、台詞、事件の流れを人物資料ではなくエピソード単位で追う際に使えます。",
  "rexonance-top":
    "レクソナンスサーガは、レックス・ロワ、ゼウス、月城悠真の三者を独立したまま超共鳴させ、無限出力を実際に届く攻撃へ変換するサーガシステムの最終到達形態です。",
  "rexonance-performance":
    "レクソナンスのパンチ、キック、跳躍、走力、演算性能を既存フォームと同じ軸で比較します。単純な最大出力だけでなく、攻撃へ変換され実際に届く実効性能を読むための資料です。",
  "rexonance-p14":
    "P14は出力変換、位相制御、能力間調停を一体化した第14世代演算基盤です。同じエーテル量からP1の9倍相当を引き出し、損失を合計7%まで抑え、急な負荷変動へ99.4%で追従します。",
  "rexonance-stages":
    "レクソナンス、マックス、ウルトラの三段階を切り替える資料です。P14の加速、全神飾の連続実装、出力の再配分など、段階ごとに拡張される運用目的を比較できます。",
  "rexonance-system":
    "トリニティ・レゾナンスは、ゼウス由来の超自己進化、レックス由来の絶対秩序、月城悠真の最終意思を束ねます。進化を止めず、同時に破綻させない循環が中核です。",
  "extreme-top":
    "エクスプリームサーガは成立可能な戦闘経路を増殖し、その中からただ一つの勝利結果へ収束・固定する至高形態です。MIDDLEとULTRAで、可能性生成と最終裁定の役割を分けます。",
  "extreme-performance":
    "エクスプリームの公開性能を他のサーガ形態と比較します。公開値と未公表値を区別しながら、基礎スペック、演算、可能性生成、結果固定の差を確認できます。",
  "extreme-p14":
    "エクスプリーム専用P14は、勝利経路の増殖と結果固定へ最適化された演算コアです。多数の成立可能性を展開する系統と、選ばれた一つを現実へ固定する系統を直列に接続します。",
  "extreme-stages":
    "エクスプリームとウルトラの二段階を比較します。前者が複数の可能性を生成し、後者が勝利へ至る結果を選別・固定するという役割の違いを確認できます。",
  "extreme-system":
    "中核システムは可能性の増殖、勝利経路の選別、結果固定を順に処理します。単に火力を上げるのではなく、成立する未来を増やしてから一つの勝利へ束ねる設計です。",
  "form-archive":
    "サーガとレルムの各フォームを選択し、設定、性能、能力、装備を確認できる比較アーカイブです。二つの形態を同じ項目で並べ、数値と役割の違いを読み取れます。",
};

const catalogById = new Map<string, ArchiveSearchCandidate>(
  ARCHIVE_SEARCH_CATALOG.map(([id, label, kicker, description]) => [
    id,
    {
      id,
      label,
      kicker,
      description,
      referenceExcerpt: ARCHIVE_SEARCH_REFERENCE_EXCERPTS[id] ?? description,
    },
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
