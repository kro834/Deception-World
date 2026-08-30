import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, MessageSquarePlus, Square } from "lucide-react";
import { GuardedLink } from "@/components/load-gate";
import {
  recordArchiveAiHealth,
  resetArchiveAiHealth,
  summarizeArchiveAiHealth,
  type ArchiveHealthAction,
} from "@/lib/archive-ai-health";
import {
  ArchiveApiClientError,
  cancelArchiveApi,
  createArchiveAiRequestId,
  forgetArchiveAiPending,
  listArchiveAiPending,
  postArchiveApi,
  resumeArchiveApi,
  subscribeArchiveAiRecoveryWake,
  type ArchiveApiLifecycle,
} from "@/lib/archive-api-client";
import { absorbArchiveUserIntent, archiveMemoryNoteTexts } from "@/lib/archive-user-memory";
import { isArchiveDelivery } from "@/lib/archive-delivery";
import {
  hasVisibleArchiveText,
  normalizeArchiveInput,
  truncateArchiveInput,
} from "@/lib/archive-input";
import { branchArchiveMessages } from "@/lib/archive-message-branch";
import type { ArchiveSearchReply } from "@/lib/archive-search";
import {
  ARCHIVE_RUNTIME_MODEL_LABEL,
  waitForArchiveThinkingFloor,
  type ArchiveModelPreferences,
  type ArchiveSearchPreference,
} from "@/lib/archive-model-config";
import {
  DREAM_CHAPTER_ENTER_ASSETS,
  EXTREME_SAGA_ENTER_ASSETS,
  REXONANCE_SAGA_ENTER_ASSETS,
  WORLD_ENTER_ASSETS,
} from "@/lib/asset-loader";
import { RELATED_NAV, RIDER_NAV, RIKUEI_NAV, type DossierLink } from "./dossier-nav";
import { ArchiveComposerModelBadge, ArchiveComposerTools } from "./archive-composer-controls";
import { ArchiveConnectionHealth } from "./archive-connection-health";
import { ArchiveComposerEditNotice, ArchiveMessageActions } from "./archive-message-actions";
import { ArchiveRoleplay } from "./archive-roleplay";
import { useLiquidSegmentedDrag } from "./use-liquid-segmented-drag";

export type ArchiveOracleEntry = {
  id: string;
  label: string;
  kicker: string;
  description: string;
  to: string;
  hash?: string;
  aliases: readonly string[];
  assets: readonly string[];
  priority?: number;
};

export type ArchiveOracleResult = {
  entry: ArchiveOracleEntry;
  score: number;
};

type GuideMeta = {
  id: string;
  description: string;
  aliases: readonly string[];
  priority?: number;
};

const assetList = (items: readonly DossierLink[], id: string) =>
  items.find((item) => item.id === id)?.assets ?? [];

const riderGuide: readonly GuideMeta[] = [
  {
    id: "saga",
    description: "月城悠真／シエルと、第一のライダー・サーガの人物、能力、各フォームの資料です。",
    aliases: [
      "サーガ",
      "仮面ライダーサーガ",
      "月城悠真",
      "悠真",
      "シエル",
      "第一のライダー",
      "夢見る者",
    ],
    priority: 94,
  },
  {
    id: "realm",
    description: "ベル・アレインと、第二のライダー・レルムの人物、能力、各フォームの資料です。",
    aliases: [
      "レルム",
      "仮面ライダーレルム",
      "ベルアレイン",
      "ベル・アレイン",
      "ベル",
      "第二のライダー",
    ],
    priority: 92,
  },
  {
    id: "lore",
    description: "ローアと、第三のライダー・ローアの人物、戦闘、能力に関する資料です。",
    aliases: ["ローア", "ロア", "仮面ライダーローア", "第三のライダー"],
    priority: 88,
  },
  {
    id: "vandal",
    description: "レックス・ロワが変身する、第四のライダー・ヴァンダールの資料です。",
    aliases: [
      "ヴァンダール",
      "バンダール",
      "仮面ライダーヴァンダール",
      "レックスロワのライダー",
      "第四のライダー",
    ],
    priority: 88,
  },
  {
    id: "leddic",
    description: "在原華火が変身する、第五のライダー・レディックと関連フォームの資料です。",
    aliases: [
      "レディック",
      "仮面ライダーレディック",
      "在原華火",
      "華火",
      "ナイカミチギリ",
      "第五のライダー",
    ],
    priority: 88,
  },
  {
    id: "argenome",
    description: "紅城真守が変身する、第六のライダー・アルゲノムの資料です。",
    aliases: [
      "アルゲノム",
      "アルジェノム",
      "仮面ライダーアルゲノム",
      "紅城真守",
      "真守",
      "第六のライダー",
    ],
    priority: 88,
  },
  {
    id: "over-zeztz",
    description: "ジェームズ・スミスが変身する、第七のライダー・オーバーゼッツの資料です。",
    aliases: [
      "オーバーゼッツ",
      "オーバーゼッツツ",
      "仮面ライダーオーバーゼッツ",
      "ジェームズスミス",
      "第七のライダー",
    ],
    priority: 88,
  },
  {
    id: "cipher",
    description: "リュシアン・ヴァレールが変身する、第八のライダー・サイファーの機密資料です。",
    aliases: [
      "サイファー",
      "仮面ライダーサイファー",
      "リュシアンヴァレール",
      "八人目のライダー",
      "8人目のライダー",
      "第八のライダー",
      "最期の死者",
    ],
    priority: 91,
  },
];

const managerGuide: readonly GuideMeta[] = [
  {
    id: "zeus",
    description: "主権を継いだ六詠第一位、ゼウスの人物、権限、戦闘資料です。",
    aliases: ["ゼウス", "六詠第一位", "六詠1位", "第一位", "主権の管理人", "最高位神格"],
    priority: 94,
  },
  {
    id: "rex-loi",
    description: "真の選択肢を残す六詠第二位、レックス・ロワの管理人資料です。",
    aliases: ["レックスロワ", "レックス・ロワ", "六詠第二位", "六詠2位", "第二位", "真の選択肢"],
    priority: 92,
  },
  {
    id: "shuza",
    description: "最上位の戦闘演算を担う六詠第三位、シュザの管理人資料です。",
    aliases: ["シュザ", "六詠第三位", "六詠3位", "第三位", "最上位の戦闘演算"],
    priority: 90,
  },
  {
    id: "lejas",
    description: "真実だけで破滅を組み上げる六詠第四位、レジャスの管理人資料です。",
    aliases: ["レジャス", "六詠第四位", "六詠4位", "第四位", "盤面の管理人", "ファルス"],
    priority: 90,
  },
  {
    id: "opus",
    description: "祈願と代価を処理する六詠第五位、オパスの管理人資料です。",
    aliases: ["オパス", "六詠第五位", "六詠5位", "第五位", "祈願と代価"],
    priority: 90,
  },
  {
    id: "reemu",
    description: "責任から逃れる観測者、六詠第六位・リームーの管理人資料です。",
    aliases: ["リームー", "リーム", "六詠第六位", "六詠6位", "第六位", "責任から逃れる観測者"],
    priority: 90,
  },
];

const riderEntries: ArchiveOracleEntry[] = riderGuide.map((guide, index) => ({
  id: `rider-${guide.id}`,
  label: RIDER_NAV.find((item) => item.id === guide.id)?.name ?? guide.id,
  kicker: `RIDER FILE / ${String(index + 1).padStart(2, "0")}`,
  description: guide.description,
  to: `/riders/${guide.id}`,
  aliases: guide.aliases,
  assets: assetList(RIDER_NAV, guide.id),
  priority: guide.priority,
}));

const managerEntries: ArchiveOracleEntry[] = managerGuide.map((guide, index) => ({
  id: `manager-${guide.id}`,
  label:
    RIKUEI_NAV.find((item) => item.id === ["I", "II", "III", "IV", "V", "VI"][index])?.name ??
    guide.id,
  kicker: `RIKUEI / ${["I", "II", "III", "IV", "V", "VI"][index]}`,
  description: guide.description,
  to: `/managers/${guide.id}`,
  aliases: guide.aliases,
  assets: assetList(RIKUEI_NAV, ["I", "II", "III", "IV", "V", "VI"][index]),
  priority: guide.priority,
}));

export const ARCHIVE_ORACLE_ENTRIES: readonly ArchiveOracleEntry[] = [
  {
    id: "opening",
    label: "オープニング",
    kicker: "OPENING / ENTRY",
    description: "映像と音でDeception Worldへ入る、サイトのオープニングです。",
    to: "/",
    aliases: ["オープニング", "最初から", "入口", "タイトル", "opening", "イントロ"],
    assets: [],
    priority: 70,
  },
  {
    id: "world-top",
    label: "Deception World トップ",
    kicker: "WORLD / TOP",
    description: "作品世界の入口と、主要な記録への総合案内です。",
    to: "/world",
    hash: "top",
    aliases: ["ディセプションワールド", "deceptionworld", "メインサイト", "トップ", "作品全体"],
    assets: WORLD_ENTER_ASSETS,
    priority: 86,
  },
  {
    id: "world-story",
    label: "ストーリーと世界観",
    kicker: "WORLD / STORY",
    description: "脚本制、採録制、六詠、レジェンズなど、この世界の基本設定を読めます。",
    to: "/world",
    hash: "story",
    aliases: [
      "ストーリー",
      "物語",
      "世界観",
      "設定",
      "あらすじ",
      "脚本制",
      "採録制",
      "レジェンズとは",
    ],
    assets: WORLD_ENTER_ASSETS,
    priority: 90,
  },
  {
    id: "world-riders",
    label: "八人のライダー一覧",
    kicker: "WORLD / RIDERS",
    description: "八人のライダーを見比べ、それぞれの個別資料へ進める一覧です。",
    to: "/world",
    hash: "riders",
    aliases: [
      "八人のライダー",
      "8人のライダー",
      "ライダー一覧",
      "登場ライダー",
      "全ライダー",
      "誰がいる",
    ],
    assets: WORLD_ENTER_ASSETS,
    priority: 93,
  },
  {
    id: "world-records",
    label: "判明済みエピソード",
    kicker: "WORLD / RECORDS",
    description: "HIDE-AND-SEEKからFARCEまで、判明済みの事件とエピソード記録です。",
    to: "/world",
    hash: "records",
    aliases: [
      "エピソード",
      "事件",
      "記録",
      "レコード",
      "判明済みエピソード",
      "hideandseek",
      "legends",
      "farce",
      "殺す",
    ],
    assets: WORLD_ENTER_ASSETS,
    priority: 91,
  },
  {
    id: "world-managers",
    label: "六詠・管理人一覧",
    kicker: "WORLD / RIKUEI",
    description: "世界を管理する六詠六名の概要と、それぞれの個別資料への入口です。",
    to: "/world",
    hash: "manager-archive",
    aliases: ["六詠", "りくえい", "管理人", "管理人一覧", "六人の管理人", "世界の管理者"],
    assets: WORLD_ENTER_ASSETS,
    priority: 93,
  },
  ...riderEntries,
  ...managerEntries,
  {
    id: "character-terra",
    label: "テラ・アレイン",
    kicker: "RELATED / 01",
    description: "世界の物質的基盤を支える共同当主、テラ・アレインの人物・能力資料です。",
    to: "/characters/terra",
    aliases: ["テラ", "テラアレイン", "テラ・アレイン", "アレイン家", "アースフォーム", "共同当主"],
    assets: assetList(RELATED_NAV, "01"),
    priority: 87,
  },
  {
    id: "character-luna",
    label: "ルナ・アレイン",
    kicker: "RELATED / 02",
    description: "関係と軌道を守る共同当主、ルナ・アレインの人物・能力資料です。",
    to: "/characters/luna",
    aliases: ["ルナ", "ルナアレイン", "ルナ・アレイン", "アレイン家", "ムーンフォーム", "共同当主"],
    assets: assetList(RELATED_NAV, "02"),
    priority: 87,
  },
  {
    id: "dream-top",
    label: "映画『DREAM CHAPTER』",
    kicker: "MOVIE 01 / TOP",
    description: "映画第一作『DREAM CHAPTER』の特設サイトと作品概要です。",
    to: "/dream-chapter",
    hash: "top",
    aliases: ["映画", "ドリームチャプター", "dreamchapter", "映画第一作", "夢の章"],
    assets: DREAM_CHAPTER_ENTER_ASSETS,
    priority: 93,
  },
  {
    id: "dream-posters",
    label: "DREAM CHAPTER ポスター",
    kicker: "MOVIE 01 / POSTERS",
    description: "映画の八種類のポスターを切り替えて鑑賞できるギャラリーです。",
    to: "/dream-chapter",
    hash: "posters",
    aliases: [
      "映画ポスター",
      "ドリームチャプターポスター",
      "ポスター",
      "キービジュアル",
      "ギャラリー",
    ],
    assets: DREAM_CHAPTER_ENTER_ASSETS,
    priority: 86,
  },
  {
    id: "dream-characters",
    label: "DREAM CHAPTER 登場人物",
    kicker: "MOVIE 01 / CHARACTERS",
    description: "シエル、東風谷慶弥、怪作ら、映画の登場人物と人物資料です。",
    to: "/dream-chapter",
    hash: "characters",
    aliases: [
      "映画の登場人物",
      "映画キャラクター",
      "登場人物",
      "キャラクター",
      "東風谷慶弥",
      "慶弥",
      "怪作",
    ],
    assets: DREAM_CHAPTER_ENTER_ASSETS,
    priority: 90,
  },
  {
    id: "dream-dolminence",
    label: "DOLMINENCE 資料",
    kicker: "MOVIE 01 / DOLMINENCE",
    description: "ロードナイト、ロードケイオス、ドレッド、ルパンらの能力・戦闘資料です。",
    to: "/dream-chapter",
    hash: "dolminence",
    aliases: ["ドルミネンス", "dolminence", "ロードナイト", "ロードケイオス", "ドレッド", "ルパン"],
    assets: DREAM_CHAPTER_ENTER_ASSETS,
    priority: 90,
  },
  {
    id: "dream-cases",
    label: "DREAM CHAPTER エピソード",
    kicker: "MOVIE 01 / CASES",
    description: "『交わる』から『叛く』まで、映画を構成する六つのケースです。",
    to: "/dream-chapter",
    hash: "cases",
    aliases: [
      "映画のエピソード",
      "映画の話",
      "ケース",
      "cases",
      "交わる",
      "開く",
      "開ける",
      "明ける",
      "来たる",
      "叛く",
    ],
    assets: DREAM_CHAPTER_ENTER_ASSETS,
    priority: 88,
  },
  {
    id: "rexonance-top",
    label: "レクソナンスサーガ",
    kicker: "SPECIAL / REXONANCE",
    description: "無限出力を実効攻撃へ変える、サーガシステムの次世代到達点の特設サイトです。",
    to: "/rexonance-saga",
    hash: "top",
    aliases: [
      "レクソナンス",
      "レクソナンスサーガ",
      "レゾナンス",
      "rexonance",
      "最強の姿",
      "次世代サーガ",
    ],
    assets: REXONANCE_SAGA_ENTER_ASSETS,
    priority: 98,
  },
  {
    id: "rexonance-performance",
    label: "レクソナンス性能比較",
    kicker: "REXONANCE / PERFORMANCE",
    description: "パンチ、キック、跳躍、走力、演算性能を既存フォームと比較できます。",
    to: "/rexonance-saga",
    hash: "performance",
    aliases: [
      "レクソナンスの性能",
      "レクソナンス性能比較",
      "レクソナンススペック",
      "性能比較",
      "戦闘力比較",
      "倍率",
    ],
    assets: REXONANCE_SAGA_ENTER_ASSETS,
    priority: 97,
  },
  {
    id: "rexonance-p14",
    label: "レクソナンス P14演算コア",
    kicker: "REXONANCE / P14",
    description: "出力変換、位相制御、能力間調停を統合した第14世代演算基盤の資料です。",
    to: "/rexonance-saga",
    hash: "p14",
    aliases: ["レクソナンスp14", "p14", "第14世代演算基盤", "演算コア", "エーテル変換", "変換効率"],
    assets: REXONANCE_SAGA_ENTER_ASSETS,
    priority: 95,
  },
  {
    id: "rexonance-stages",
    label: "レクソナンス 三つの運用段階",
    kicker: "REXONANCE / STAGES",
    description: "レクソナンス、マックス、ウルトラの三段階を切り替えて確認できます。",
    to: "/rexonance-saga",
    hash: "stages",
    aliases: [
      "レクソナンスの形態",
      "レクソナンスマックス",
      "レクソナンスウルトラ",
      "三つの運用段階",
      "三段階",
      "運用段階",
    ],
    assets: REXONANCE_SAGA_ENTER_ASSETS,
    priority: 95,
  },
  {
    id: "rexonance-system",
    label: "トリニティ・レゾナンス",
    kicker: "REXONANCE / SYSTEM",
    description: "超自己進化、絶対秩序、月城悠真の意思を束ねる中核システムです。",
    to: "/rexonance-saga",
    hash: "system",
    aliases: [
      "トリニティレゾナンス",
      "トリニティ・レゾナンス",
      "超自己進化",
      "絶対秩序",
      "レクソナンスの仕組み",
      "中核システム",
    ],
    assets: REXONANCE_SAGA_ENTER_ASSETS,
    priority: 95,
  },
  {
    id: "extreme-top",
    label: "エクスプリームサーガ",
    kicker: "SPECIAL / EXTREME",
    description: "可能性を増殖し、ただ一つの勝利結果へ束ねる至高形態の特設サイトです。",
    to: "/extreme-saga",
    hash: "top",
    aliases: ["エクスプリーム", "エクスプリームサーガ", "extreme", "至高形態", "supreme"],
    assets: EXTREME_SAGA_ENTER_ASSETS,
    priority: 96,
  },
  {
    id: "extreme-performance",
    label: "エクスプリーム性能比較",
    kicker: "EXTREME / COMPARISON",
    description: "エクスプリームの公開性能を、ほかのサーガ形態と比較できます。",
    to: "/extreme-saga",
    hash: "performance",
    aliases: [
      "エクスプリームの性能",
      "エクスプリーム性能比較",
      "エクスプリームスペック",
      "性能比較",
      "戦闘力比較",
    ],
    assets: EXTREME_SAGA_ENTER_ASSETS,
    priority: 95,
  },
  {
    id: "extreme-p14",
    label: "エクスプリーム P14演算コア",
    kicker: "EXTREME / P14",
    description: "勝利経路の増殖と結果固定へ最適化された、エクスプリーム専用P14です。",
    to: "/extreme-saga",
    hash: "p14",
    aliases: ["エクスプリームp14", "p14", "千里眼", "勝利経路", "結果固定", "演算コア"],
    assets: EXTREME_SAGA_ENTER_ASSETS,
    priority: 94,
  },
  {
    id: "extreme-stages",
    label: "エクスプリーム 二つの運用段階",
    kicker: "EXTREME / STAGES",
    description: "エクスプリームとウルトラ、二つの運用段階を切り替えて確認できます。",
    to: "/extreme-saga",
    hash: "stages",
    aliases: [
      "エクスプリームの形態",
      "エクスプリームウルトラ",
      "二つの運用段階",
      "二段階",
      "運用段階",
    ],
    assets: EXTREME_SAGA_ENTER_ASSETS,
    priority: 93,
  },
  {
    id: "extreme-system",
    label: "エクスプリーム中核システム",
    kicker: "EXTREME / SYSTEM",
    description: "可能性の増殖、勝利経路の選別、結果固定を担う中核システムです。",
    to: "/extreme-saga",
    hash: "system",
    aliases: ["エクスプリームの仕組み", "中核システム", "可能性の増殖", "勝利結果", "結果を固定"],
    assets: EXTREME_SAGA_ENTER_ASSETS,
    priority: 92,
  },
  {
    id: "form-archive",
    label: "フォームアーカイブ",
    kicker: "SYSTEM / FORM ARCHIVE",
    description: "サーガ／レルムの各フォームを選択し、詳細、性能、能力、二形態比較を確認できます。",
    to: "/form-archive",
    hash: "archive-switcher",
    aliases: [
      "フォーム",
      "フォーム一覧",
      "フォームアーカイブ",
      "形態一覧",
      "二形態比較",
      "2形態比較",
      "フォーム比較",
      "サーガのフォーム",
      "レルムのフォーム",
    ],
    assets: [],
    priority: 96,
  },
] as const;

export const ARCHIVE_ORACLE_SUGGESTIONS = [
  "このサイトについて教えて",
  "今日の相談に乗って",
  "シエルについて知りたい",
  "文章を一緒に考えて",
  "サーガのフォームを比較したい",
] as const;

function normalizeArchiveOracleText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/[ぁ-ゖ]/gu, (character) => String.fromCharCode(character.charCodeAt(0) + 0x60))
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function bigrams(value: string) {
  const result = new Set<string>();
  if (value.length < 2) return result;
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
}

function similarity(left: string, right: string) {
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  if (!leftPairs.size || !rightPairs.size) return 0;
  let shared = 0;
  leftPairs.forEach((pair) => {
    if (rightPairs.has(pair)) shared += 1;
  });
  return (2 * shared) / (leftPairs.size + rightPairs.size);
}

function matchScore(query: string, candidate: string) {
  const term = normalizeArchiveOracleText(candidate);
  if (!term) return 0;
  if (query === term) return 180;
  if (term.length >= 2 && query.includes(term)) return 76 + Math.min(term.length * 2, 28);
  if (query.length >= 2 && term.includes(query)) return 50 + Math.min(query.length, 18);
  const fuzzy = similarity(query, term);
  return fuzzy >= 0.46 ? Math.round(fuzzy * 42) : 0;
}

function searchArchiveOracle(query: string, limit = 3): ArchiveOracleResult[] {
  const normalizedQuery = normalizeArchiveOracleText(query);
  if (normalizedQuery.length < 2 || limit < 1) return [];

  return ARCHIVE_ORACLE_ENTRIES.map((entry) => {
    const fieldScores = [entry.label, entry.kicker, ...entry.aliases]
      .map((candidate) => matchScore(normalizedQuery, candidate))
      .sort((left, right) => right - left);
    const score =
      (fieldScores[0] ?? 0) +
      (fieldScores[1] ?? 0) * 0.34 +
      (fieldScores[2] ?? 0) * 0.12 +
      (entry.priority ?? 0) * 0.05;
    return { entry, score };
  })
    .filter((result) => result.score >= 30)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.entry.priority ?? 0) - (left.entry.priority ?? 0) ||
        left.entry.label.localeCompare(right.entry.label, "ja"),
    )
    .slice(0, Math.min(limit, 3));
}

type SearchMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  results?: ArchiveOracleResult[];
  suggestions?: string[];
  source?: ArchiveSearchReply["source"] | "error";
  model?: string;
  modelLabel?: string;
  notice?: string;
  requestId?: string;
};

type SearchEditState = {
  messageId: string;
  draftBeforeEdit: string;
};

const SEARCH_FOLLOW_UP_PATTERN =
  /^(それ|その|あれ|これ|一つ目|1つ目|最初|一番上|二つ目|2つ目|2番|二番|後者|前者|三つ目|3つ目|3番|三番|最後|ほか|他|もっと|詳しく|違い|では|じゃあ|なら)/u;
const SEARCH_TOPIC_CHANGE_PATTERN =
  /^(?:それとは別に|それはさておき|別の話(?:だけど|ですが)?|話は変わる(?:けど|が)?|ところで)/u;

function searchMessageId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isArchiveSearchReply(value: unknown): value is ArchiveSearchReply {
  if (!value || typeof value !== "object") return false;
  const reply = value as Partial<ArchiveSearchReply>;
  const common =
    typeof reply.reply === "string" &&
    Array.isArray(reply.suggestions) &&
    (reply.focusCandidateId === undefined || typeof reply.focusCandidateId === "string") &&
    Array.isArray(reply.referenceCandidateIds) &&
    reply.referenceCandidateIds.every((id) => typeof id === "string") &&
    (reply.source === "openai" || reply.source === "local") &&
    Boolean(reply.delivery) &&
    isArchiveDelivery(reply.delivery);
  if (!common) return false;
  if (reply.source === "openai") {
    return (
      reply.delivery?.channel === "online" &&
      reply.delivery.reason === "ok" &&
      typeof reply.requestId === "string" &&
      typeof reply.requestedModel === "string" &&
      typeof reply.providerModel === "string" &&
      typeof reply.providerResponseId === "string" &&
      reply.modelVerified === true
    );
  }
  return reply.delivery?.channel === "local" && reply.modelVerified === false;
}

function archiveLifecycleText(state: ArchiveApiLifecycle | null): string {
  if (state === "submitting") return "思考中";
  if (state === "queued") return "接続待機中";
  if (state === "unknown") return "回答を確認中";
  if (state === "reconnecting") return "再接続中";
  return "思考中";
}

function resolveConversationalSearchQuery(
  question: string,
  messages: readonly SearchMessage[],
): string {
  const trimmed = question.trim();
  const previous = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.results?.length);
  const results = previous?.results ?? [];
  const normalizedQuestion = normalizeArchiveOracleText(trimmed);
  if (SEARCH_TOPIC_CHANGE_PATTERN.test(trimmed)) return trimmed;
  const explicit = results.find(({ entry }) =>
    normalizedQuestion.includes(normalizeArchiveOracleText(entry.label)),
  );
  if (explicit) return truncateArchiveInput(`${explicit.entry.label} ${trimmed}`, 180);
  if (!SEARCH_FOLLOW_UP_PATTERN.test(trimmed)) return trimmed;
  const requestedIndex = /二つ目|2つ目|2番|二番|後者/u.test(trimmed)
    ? 1
    : /三つ目|3つ目|3番|三番|最後/u.test(trimmed)
      ? 2
      : /ほか|他/u.test(trimmed)
        ? 1
        : 0;
  const label = (results[requestedIndex] ?? results.at(-1))?.entry.label;
  return label ? truncateArchiveInput(`${label} ${trimmed}`, 180) : trimmed;
}

export function ArchiveIntelligenceWorkspace({
  active = true,
  onNavigate,
  modelPreferences,
  onModelPreferencesChange,
}: {
  active?: boolean;
  onNavigate?: () => void;
  modelPreferences: ArchiveModelPreferences;
  onModelPreferencesChange: (value: ArchiveModelPreferences) => void;
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchLogRef = useRef<HTMLDivElement>(null);
  const searchFollowLatestRef = useRef(true);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchRecoveryAbortRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef<string | null>(null);
  const searchRequestSessionIdRef = useRef<string | undefined>(undefined);
  const searchSequenceRef = useRef(0);
  const surfaceTransitionTimerRef = useRef<number | null>(null);
  const [surface, setSurface] = useState<"search" | "roleplay">("search");
  const [surfaceTransition, setSurfaceTransition] = useState<"search" | "roleplay" | null>(null);
  const [question, setQuestion] = useState("");
  const [searchMessages, setSearchMessages] = useState<SearchMessage[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [searchLifecycle, setSearchLifecycle] = useState<ArchiveApiLifecycle | null>(null);
  const [selectedSearchMessageId, setSelectedSearchMessageId] = useState<string | null>(null);
  const [searchEdit, setSearchEdit] = useState<SearchEditState | null>(null);
  const [searchHealth, setSearchHealth] = useState(() => summarizeArchiveAiHealth("search", []));
  const [pendingSearchPreference, setPendingSearchPreference] =
    useState<ArchiveSearchPreference | null>(null);
  const [searchRecoveryWake, setSearchRecoveryWake] = useState(0);
  const [personaEpoch, setPersonaEpoch] = useState(0);

  const latestSearchAssistant = [...searchMessages]
    .reverse()
    .find((message) => message.role === "assistant");
  const searchSuggestions = latestSearchAssistant?.suggestions?.length
    ? latestSearchAssistant.suggestions
    : ARCHIVE_ORACLE_SUGGESTIONS;

  const stopSearch = useCallback((cancelServer = false) => {
    searchSequenceRef.current += 1;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    searchRecoveryAbortRef.current?.abort();
    searchRecoveryAbortRef.current = null;
    const requestId = searchRequestIdRef.current;
    const sessionId = searchRequestSessionIdRef.current;
    searchRequestIdRef.current = null;
    searchRequestSessionIdRef.current = undefined;
    if (cancelServer && requestId) {
      void cancelArchiveApi({ client: "search-v1", requestId, sessionId });
    }
    setSearchPending(false);
    setSearchLifecycle(null);
    setPendingSearchPreference(null);
  }, []);

  useEffect(() => () => stopSearch(), [stopSearch]);

  useEffect(() => {
    setSearchHealth(summarizeArchiveAiHealth("search"));
  }, []);

  useEffect(
    () => subscribeArchiveAiRecoveryWake(() => setSearchRecoveryWake((value) => value + 1)),
    [],
  );

  useEffect(() => {
    if (!active || searchAbortRef.current) return;
    const controller = new AbortController();
    let disposed = false;
    void (async () => {
      const pendingRecords = (await listArchiveAiPending()).filter(
        (record) => record.client === "search-v1" && record.url === "/api/archive-search",
      );
      // A user can start a foreground request while a cold WebKit database is
      // still opening. Never attach a second resume loop to that same request.
      if (disposed || searchAbortRef.current || !pendingRecords.length) return;
      searchRequestIdRef.current = pendingRecords[0]?.requestId ?? null;
      searchRequestSessionIdRef.current = pendingRecords[0]?.sessionId;
      searchRecoveryAbortRef.current = controller;
      setSearchPending(true);
      setSearchLifecycle("reconnecting");
      const settled = await Promise.allSettled(
        pendingRecords.map(async (pendingRecord) => {
          const reply = await resumeArchiveApi({
            pending: pendingRecord,
            signal: controller.signal,
            validate: isArchiveSearchReply,
            onState: setSearchLifecycle,
          });
          if (disposed || controller.signal.aborted) return;
          const recoveredResults = reply.referenceCandidateIds
            .map((id) => ARCHIVE_ORACLE_ENTRIES.find((entry) => entry.id === id))
            .filter((entry): entry is ArchiveOracleEntry => Boolean(entry))
            .map((entry) => ({ entry, score: 1 }));
          setSearchMessages((current) =>
            reply.requestId && current.some((message) => message.requestId === reply.requestId)
              ? current
              : [
                  ...current,
                  {
                    id: searchMessageId("search-recovered"),
                    role: "assistant",
                    text: reply.reply,
                    results: recoveredResults,
                    suggestions: reply.suggestions,
                    source: reply.source,
                    model: reply.providerModel ?? reply.model,
                    modelLabel: reply.providerModel
                      ? `${reply.providerModel.toUpperCase()} · VERIFIED`
                      : "LOCAL",
                    notice: reply.notice ?? "再接続前に生成された回答を復元しました。",
                    requestId: reply.requestId,
                  },
                ],
          );
        }),
      );
      if (!disposed) {
        const firstFailedIndex = settled.findIndex((result) => result.status === "rejected");
        if (firstFailedIndex >= 0) {
          const failedRecord = pendingRecords[firstFailedIndex];
          if (failedRecord) void forgetArchiveAiPending(failedRecord.requestId);
          searchRequestIdRef.current = null;
          searchRequestSessionIdRef.current = undefined;
          setSearchPending(false);
          setSearchLifecycle(null);
        } else {
          if (searchRecoveryAbortRef.current === controller) {
            searchRecoveryAbortRef.current = null;
          }
          searchRequestIdRef.current = null;
          searchRequestSessionIdRef.current = undefined;
          setSearchPending(false);
          setSearchLifecycle(null);
        }
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      if (searchRecoveryAbortRef.current === controller) {
        searchRecoveryAbortRef.current = null;
        if (!searchAbortRef.current) {
          searchRequestIdRef.current = null;
          searchRequestSessionIdRef.current = undefined;
          setSearchPending(false);
          setSearchLifecycle(null);
        }
      }
    };
  }, [active, searchRecoveryWake]);

  useEffect(() => {
    if (!searchPending) return;
    const timer = window.setTimeout(() => {
      if (searchAbortRef.current || searchRecoveryAbortRef.current) return;
      setSearchPending(false);
      setSearchLifecycle(null);
    }, 8_000);
    return () => window.clearTimeout(timer);
  }, [searchPending]);

  useEffect(() => {
    if (!active) stopSearch();
  }, [active, stopSearch]);

  useEffect(
    () => () => {
      if (surfaceTransitionTimerRef.current !== null) {
        window.clearTimeout(surfaceTransitionTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const log = searchLogRef.current;
    if (!log || surface !== "search" || !searchFollowLatestRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchMessages, searchPending, surface]);

  useEffect(() => {
    const log = searchLogRef.current;
    if (!log || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (!searchFollowLatestRef.current || surface !== "search") return;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        log.scrollTop = log.scrollHeight;
      });
    });
    observer.observe(log);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [surface]);

  const ask = useCallback(
    async (
      value: string,
      options: {
        replaceMessageId?: string;
        action?: ArchiveHealthAction;
        preserveDraft?: boolean;
      } = {},
    ) => {
      const searchPreferenceAtRequest = modelPreferences.search;
      const maxLength = searchPreferenceAtRequest.execution === "pro" ? 1200 : 600;
      const nextQuestion = normalizeArchiveInput(value).trim();
      if (
        !hasVisibleArchiveText(nextQuestion) ||
        nextQuestion.length > maxLength ||
        searchAbortRef.current
      ) {
        return;
      }

      const existingMessage = options.replaceMessageId
        ? searchMessages.find((message) => message.id === options.replaceMessageId)
        : undefined;
      const nextMessages = options.replaceMessageId
        ? branchArchiveMessages(searchMessages, options.replaceMessageId, nextQuestion)?.slice(-18)
        : [
            ...searchMessages,
            {
              id: searchMessageId("search-user"),
              role: "user" as const,
              text: nextQuestion,
            },
          ].slice(-18);
      if (!nextMessages) return;
      const resolvedQuery = truncateArchiveInput(
        resolveConversationalSearchQuery(nextQuestion, nextMessages.slice(0, -1)),
        180,
      );
      const results = searchArchiveOracle(resolvedQuery, 3);
      searchFollowLatestRef.current = true;
      setSearchMessages(nextMessages);
      absorbArchiveUserIntent({ userText: nextQuestion, surface: "search" });
      if (!options.preserveDraft) setQuestion("");
      setSearchEdit(null);
      setSelectedSearchMessageId(null);
      setSearchPending(true);
      setSearchLifecycle("submitting");
      setPendingSearchPreference(searchPreferenceAtRequest);

      const controller = new AbortController();
      const requestId = createArchiveAiRequestId();
      searchAbortRef.current = controller;
      searchRequestIdRef.current = requestId;
      searchRequestSessionIdRef.current = undefined;
      const thinkingStartedAt = performance.now();
      const sequence = searchSequenceRef.current + 1;
      searchSequenceRef.current = sequence;

      const conversationHistory = trimArchiveConversation(
        nextMessages.map((message) => ({
          role: message.role,
          content: truncateArchiveInput(
            message.role === "assistant" && message.results?.length
              ? `${message.text}\n表示候補: ${message.results
                  .map(({ entry }, index) => `${index + 1}. ${entry.label} [${entry.id}]`)
                  .join(" / ")}`
              : message.text,
            1600,
          ),
        })),
        { maxTurns: 10, maxTotalChars: 8_000, maxCharsPerTurn: 1_600 },
      );
      const sentCharacters = conversationHistory.reduce(
        (total, message) => total + message.content.length,
        0,
      );
      const healthAction = options.action ?? (existingMessage ? "edit_resend" : "send");

      let reply: ArchiveSearchReply;
      try {
        reply = await postArchiveApi({
          url: "/api/archive-search",
          client: "search-v1",
          body: {
            query: resolvedQuery,
            messages: conversationHistory,
            candidates: results.map(({ entry }) => ({
              id: entry.id,
              label: entry.label,
              kicker: entry.kicker,
              description: entry.description,
            })),
            modelPreference: searchPreferenceAtRequest,
            memoryNotes: archiveMemoryNoteTexts(),
          },
          signal: controller.signal,
          validate: isArchiveSearchReply,
          pendingContext: {
            contextId: "search",
            userMessageId: nextMessages.at(-1)?.id,
          },
          requestId,
          onState: setSearchLifecycle,
        });
      } catch (error) {
        if (searchSequenceRef.current !== sequence) return;
        const deliveryReason =
          error instanceof ArchiveApiClientError ? error.reason : "client_network";
        setSearchMessages((current) => [
          ...current,
          {
            id: searchMessageId("search-error"),
            role: "assistant",
            text: "オンライン回答を回収できませんでした。ローカル回答へは置き換えていません。接続を確認し、同じメッセージを再送してください。",
            source: "error",
            modelLabel: "RECONNECT",
            notice: `通信状態: ${deliveryReason}`,
            requestId,
          },
        ]);
        setSearchHealth(
          recordArchiveAiHealth({
            surface: "search",
            action: healthAction,
            channel: "failed",
            reason: deliveryReason,
            latencyMs: performance.now() - thinkingStartedAt,
            turnCount: nextMessages.length,
            context: sentCharacters >= 6_400 ? "high" : sentCharacters >= 4_000 ? "medium" : "low",
            trimmed: conversationHistory.length < nextMessages.length,
          }),
        );
        setSearchPending(false);
        setSearchLifecycle(null);
        setPendingSearchPreference(null);
        if (searchAbortRef.current === controller) searchAbortRef.current = null;
        if (searchRequestIdRef.current === requestId) {
          searchRequestIdRef.current = null;
          searchRequestSessionIdRef.current = undefined;
        }
        return;
      }

      await waitForArchiveThinkingFloor(thinkingStartedAt, controller.signal);

      if (controller.signal.aborted || searchSequenceRef.current !== sequence) return;
      const delivery = reply.delivery ?? {
        channel: reply.source === "openai" ? ("online" as const) : ("local" as const),
        reason: reply.source === "openai" ? ("ok" as const) : ("client_network" as const),
      };
      setSearchHealth(
        recordArchiveAiHealth({
          surface: "search",
          action: healthAction,
          channel: delivery.channel,
          reason: delivery.reason,
          latencyMs: performance.now() - thinkingStartedAt,
          turnCount: nextMessages.length,
          context: sentCharacters >= 6_400 ? "high" : sentCharacters >= 4_000 ? "medium" : "low",
          trimmed: conversationHistory.length < nextMessages.length,
        }),
      );
      const orderedResults = reply.focusCandidateId
        ? [...results].sort((left, right) =>
            left.entry.id === reply.focusCandidateId
              ? -1
              : right.entry.id === reply.focusCandidateId
                ? 1
                : 0,
          )
        : results;
      const resultById = new Map(orderedResults.map((result) => [result.entry.id, result]));
      const referencedResults = reply.referenceCandidateIds
        .map((id) => resultById.get(id))
        .filter((result): result is ArchiveOracleResult => Boolean(result));
      const displayedReferences = referencedResults;
      setSearchMessages((current) =>
        reply.requestId && current.some((message) => message.requestId === reply.requestId)
          ? current
          : [
              ...current,
              {
                id: searchMessageId("search-assistant"),
                role: "assistant",
                text: reply.reply,
                results: displayedReferences,
                suggestions: reply.suggestions,
                source: reply.source,
                model: reply.providerModel ?? reply.model,
                modelLabel: ARCHIVE_RUNTIME_MODEL_LABEL,
                notice: reply.notice,
                requestId: reply.requestId,
              },
            ],
      );
      setSearchPending(false);
      setSearchLifecycle(null);
      setPendingSearchPreference(null);
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
      if (searchRequestIdRef.current === requestId) {
        searchRequestIdRef.current = null;
        searchRequestSessionIdRef.current = undefined;
      }
    },
    [modelPreferences.search, searchMessages],
  );

  const clearSearchConversation = useCallback(() => {
    stopSearch(true);
    setSearchMessages([]);
    setQuestion("");
    setSearchEdit(null);
    setSelectedSearchMessageId(null);
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, [stopSearch]);

  const startNewConversation = useCallback(() => {
    clearSearchConversation();
    setPersonaEpoch((value) => value + 1);
  }, [clearSearchConversation]);

  const beginSearchEdit = useCallback(
    (message: SearchMessage) => {
      if (message.role !== "user") return;
      if (searchPending) stopSearch(true);
      setSearchEdit({ messageId: message.id, draftBeforeEdit: question });
      setSelectedSearchMessageId(null);
      setQuestion(message.text);
      window.requestAnimationFrame(() => {
        const editor = inputRef.current;
        if (!editor) return;
        editor.focus({ preventScroll: true });
        editor.setSelectionRange(editor.value.length, editor.value.length);
      });
    },
    [question, searchPending, stopSearch],
  );

  const cancelSearchEdit = useCallback(() => {
    setQuestion(searchEdit?.draftBeforeEdit ?? "");
    setSearchEdit(null);
    setSelectedSearchMessageId(null);
  }, [searchEdit]);

  const resendSearchMessage = useCallback(
    (message: SearchMessage) => {
      if (message.role !== "user") return;
      if (searchPending) stopSearch(true);
      setSearchEdit(null);
      setSelectedSearchMessageId(null);
      void ask(message.text, {
        replaceMessageId: message.id,
        action: "retry",
        preserveDraft: true,
      });
    },
    [ask, searchPending, stopSearch],
  );

  const attachSearchArchive = useCallback(() => {
    const maxLength = modelPreferences.search.execution === "pro" ? 1200 : 600;
    setQuestion((current) => {
      const marker = "[公開記録を参照] ";
      return current.startsWith(marker)
        ? current
        : truncateArchiveInput(`${marker}${current}`, maxLength);
    });
    window.requestAnimationFrame(() => {
      const editor = inputRef.current;
      if (!editor) return;
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
    });
  }, [modelPreferences.search.execution]);

  const selectSurface = useCallback(
    (nextSurface: "search" | "roleplay") => {
      if (nextSurface === surface) return;
      const page = inputRef.current?.closest<HTMLElement>(".archive-intelligence-page");
      const keyboardActive = Boolean(page?.dataset.keyboard && page.dataset.keyboard !== "closed");
      if (surfaceTransitionTimerRef.current !== null) {
        window.clearTimeout(surfaceTransitionTimerRef.current);
        surfaceTransitionTimerRef.current = null;
      }
      setSurface(nextSurface);
      setSurfaceTransition(keyboardActive ? null : nextSurface);
      if (!keyboardActive) {
        surfaceTransitionTimerRef.current = window.setTimeout(() => {
          surfaceTransitionTimerRef.current = null;
          setSurfaceTransition(null);
        }, 320);
      }
    },
    [surface],
  );

  const handleSurfaceKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextSurface = event.key === "ArrowLeft" || event.key === "Home" ? "search" : "roleplay";
    selectSurface(nextSurface);
    window.requestAnimationFrame(() => {
      document
        .getElementById(
          nextSurface === "search" ? "archive-oracle-search-tab" : "archive-oracle-roleplay-tab",
        )
        ?.focus({ preventScroll: true });
    });
  };

  const surfaceDrag = useLiquidSegmentedDrag({
    values: ["search", "roleplay"] as const,
    value: surface,
    onCommit: selectSurface,
  });
  const searchMaxLength = modelPreferences.search.execution === "pro" ? 1200 : 600;
  const searchEditOverLimit = Boolean(searchEdit && question.length > searchMaxLength);

  return (
    <section
      className="archive-oracle-shell archive-intelligence-workspace"
      data-surface={surface}
      data-surface-transition={surfaceTransition ?? undefined}
      aria-labelledby="archive-oracle-title"
      aria-describedby="archive-oracle-description"
    >
      <span className="archive-oracle-aura" aria-hidden="true" />
      <p id="archive-oracle-description" className="visually-hidden">
        公開記録を会話で探すサーチと、8つのキャラクター人格で対話できる知能端末です。
      </p>
      <p id="archive-oracle-drag-help" className="visually-hidden">
        タップで切り替え。長押しして左右へ動かせます。キーボードは左右矢印を使えます。
      </p>
      <header className="archive-oracle-header">
        <div>
          <p>ARCHIVE INTELLIGENCE</p>
          <h2 id="archive-oracle-title">AIに聞く</h2>
        </div>
        <div
          {...surfaceDrag.railProps}
          className="archive-oracle-view-switch"
          role="tablist"
          aria-label="AI機能を選択"
          aria-describedby="archive-oracle-drag-help"
          onKeyDown={handleSurfaceKeyDown}
        >
          <button
            id="archive-oracle-search-tab"
            className="archive-oracle-view-tab"
            type="button"
            role="tab"
            aria-selected={surface === "search"}
            aria-controls="archive-oracle-search-panel"
            tabIndex={surface === "search" ? 0 : -1}
            onClick={(event) => {
              if (surfaceDrag.shouldSuppressClick()) {
                event.preventDefault();
                return;
              }
              selectSurface("search");
            }}
          >
            <span>サーチ</span>
            <small>SEARCH</small>
          </button>
          <button
            id="archive-oracle-roleplay-tab"
            className="archive-oracle-view-tab"
            type="button"
            role="tab"
            aria-selected={surface === "roleplay"}
            aria-controls="archive-oracle-roleplay-panel"
            tabIndex={surface === "roleplay" ? 0 : -1}
            onClick={(event) => {
              if (surfaceDrag.shouldSuppressClick()) {
                event.preventDefault();
                return;
              }
              selectSurface("roleplay");
            }}
          >
            <span>なりきり</span>
            <small>PERSONA</small>
          </button>
        </div>
        <button
          type="button"
          className="archive-oracle-status"
          tabIndex={-1}
          aria-label="新しい会話。現在のモデルは Grok 4.20"
          onClick={startNewConversation}
        >
          <MessageSquarePlus size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </header>

      <div
        id="archive-oracle-search-panel"
        className="archive-oracle-stage archive-oracle-guide archive-search-conversation"
        data-search-execution={modelPreferences.search.execution}
        role="tabpanel"
        aria-labelledby="archive-oracle-search-tab"
        hidden={surface !== "search"}
        inert={surface !== "search" ? true : undefined}
      >
        <div className="archive-search-heading">
          <div>
            <small>CONVERSATIONAL ARCHIVE SEARCH</small>
            <h3>知りたいことから、記録へ。</h3>
          </div>
          {searchMessages.length ? (
            <button
              type="button"
              onClick={() => {
                clearSearchConversation();
              }}
            >
              新しいサーチ
            </button>
          ) : null}
        </div>

        <div
          ref={searchLogRef}
          className="archive-search-log"
          role="log"
          aria-label="サーチとの会話"
          aria-busy={searchPending}
          onScroll={(event) => {
            const log = event.currentTarget;
            searchFollowLatestRef.current =
              log.scrollHeight - log.scrollTop - log.clientHeight < 140;
          }}
        >
          <ArchiveConnectionHealth
            summary={searchHealth}
            pending={searchPending}
            turnCount={searchMessages.length}
            turnLimit={10}
            onReset={() => setSearchHealth(resetArchiveAiHealth("search"))}
          />
          {!searchMessages.length ? (
            <div className="archive-search-welcome">
              <p>今日は何を調べますか</p>
              <small>挨拶でも、相談でも、作品の記録でも。そのまま聞いてください。</small>
            </div>
          ) : (
            searchMessages.map((message) => {
              const actionsOpen = selectedSearchMessageId === message.id;
              return (
                <article
                  key={message.id}
                  className={`archive-search-message is-${message.role}`}
                  data-source={message.source}
                  data-actions-open={actionsOpen || undefined}
                >
                  <header>
                    <span>{message.role === "assistant" ? "AI" : "YOU"}</span>
                    {message.role === "assistant" && message.source ? (
                      <small>
                        {message.source === "openai"
                          ? (message.modelLabel ?? ARCHIVE_RUNTIME_MODEL_LABEL)
                          : message.source === "local"
                            ? "LOCAL"
                            : (message.modelLabel ?? "RECONNECT")}
                      </small>
                    ) : null}
                  </header>
                  {message.role === "user" ? (
                    <>
                      <button
                        type="button"
                        className="archive-message-text-button"
                        aria-expanded={actionsOpen}
                        onClick={() =>
                          setSelectedSearchMessageId((current) =>
                            current === message.id ? null : message.id,
                          )
                        }
                      >
                        <span>{message.text}</span>
                        <small>タップして編集・再送信</small>
                      </button>
                      {actionsOpen ? (
                        <ArchiveMessageActions
                          onEdit={() => beginSearchEdit(message)}
                          onResend={() => resendSearchMessage(message)}
                          onClose={() => setSelectedSearchMessageId(null)}
                        />
                      ) : null}
                    </>
                  ) : (
                    <p>{message.text}</p>
                  )}
                  {message.notice ? (
                    <small className="archive-search-notice">{message.notice}</small>
                  ) : null}
                  {message.role === "assistant" && message.results?.length ? (
                    <div className="archive-search-references">
                      <p>参照したページ</p>
                      <ol className="archive-oracle-results" aria-label="回答で参照したページ">
                        {message.results.map(({ entry }, index) => (
                          <li key={entry.id}>
                            <GuardedLink
                              to={entry.to}
                              hash={entry.hash}
                              assets={entry.assets}
                              className="archive-oracle-result"
                              beforeNavigate={onNavigate}
                              aria-label={`${entry.label}を開く。${entry.description}`}
                            >
                              <span className="archive-oracle-result-index">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span className="archive-oracle-result-copy">
                                <small>{entry.kicker}</small>
                                <b>{entry.label}</b>
                                <span>{entry.description}</span>
                              </span>
                              <i className="archive-oracle-result-arrow" aria-hidden="true">
                                ↗
                              </i>
                            </GuardedLink>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}

          {searchPending ? (
            <div className="archive-search-thinking" aria-hidden="true">
              <span aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <div>
                <small>{ARCHIVE_RUNTIME_MODEL_LABEL}</small>
                <p>
                  {searchLifecycle === "reconnecting"
                    ? "接続を確認しています"
                    : "考えています"}
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
          {searchPending
            ? (pendingSearchPreference ?? modelPreferences.search).execution === "pro"
              ? `AIが${archiveLifecycleText(searchLifecycle)}です`
              : `AIが${archiveLifecycleText(searchLifecycle)}です`
            : ""}
        </p>

        <div className="archive-oracle-suggestions" aria-label="次のサーチ候補">
          <p>{searchMessages.length ? "CONTINUE SEARCH" : "QUICK QUESTIONS"}</p>
          <div>
            {searchSuggestions.slice(0, 5).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={searchPending}
                onClick={() => {
                  setQuestion(suggestion);
                  inputRef.current?.focus({ preventScroll: true });
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <form
          className="archive-oracle-form"
          role="search"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="visually-hidden" htmlFor="archive-oracle-question">
            サーチへメッセージを送る
          </label>
          {searchEdit ? (
            <ArchiveComposerEditNotice
              overLimit={searchEditOverLimit}
              onCancel={cancelSearchEdit}
            />
          ) : null}
          <section className="archive-composer-model-row" aria-label="現在のサーチモデル">
            <ArchiveComposerModelBadge label={ARCHIVE_RUNTIME_MODEL_LABEL} />
          </section>
          <div className="archive-oracle-input-shell">
            <ArchiveComposerTools
              editorRef={inputRef}
              onNewConversation={clearSearchConversation}
              onAttachArchive={attachSearchArchive}
            />
            <textarea
              ref={inputRef}
              id="archive-oracle-question"
              name="question"
              rows={1}
              value={question}
              maxLength={searchEdit ? undefined : searchMaxLength}
              autoComplete="off"
              enterKeyHint="enter"
              inputMode="text"
              disabled={surface !== "search"}
              placeholder={
                modelPreferences.search.execution === "pro"
                  ? "何でも、詳しく聞いてください…"
                  : "何でも聞いてください…"
              }
              onChange={(event) => setQuestion(event.currentTarget.value)}
            />
            {searchPending ? (
              <button
                type="button"
                className="archive-composer-stop is-stop"
                tabIndex={-1}
                aria-label="サーチの応答生成を停止"
                onClick={() => stopSearch(true)}
              >
                <Square size={15} fill="currentColor" strokeWidth={1.4} aria-hidden="true" />
                <span>停止</span>
              </button>
            ) : (
              <button
                type="button"
                className="archive-composer-send"
                tabIndex={-1}
                disabled={
                  !hasVisibleArchiveText(question) ||
                  question.length > searchMaxLength ||
                  searchEditOverLimit
                }
                aria-label={searchEdit ? "編集してサーチへ再送信" : "サーチへ送信"}
                onClick={() =>
                  void ask(
                    question,
                    searchEdit
                      ? { replaceMessageId: searchEdit.messageId, action: "edit_resend" }
                      : undefined,
                  )
                }
              >
                <ArrowUp
                  className="archive-send-icon"
                  size={20}
                  strokeWidth={2.4}
                  aria-hidden="true"
                  focusable="false"
                />
                <span>送信</span>
              </button>
            )}
          </div>
        </form>

        <p className="archive-oracle-privacy">
          一般的な会話にも対応し、作品情報の参照先は許可済みの公開記録だけを表示します。会話はサーバー経由でAIへ送信される場合がありますが、API保存は無効です。
        </p>
      </div>

      <div
        id="archive-oracle-roleplay-panel"
        className="archive-oracle-roleplay-panel"
        role="tabpanel"
        aria-labelledby="archive-oracle-roleplay-tab"
        hidden={surface !== "roleplay"}
        inert={surface !== "roleplay" ? true : undefined}
      >
        <ArchiveRoleplay
          key={personaEpoch}
          active={active && surface === "roleplay"}
          searchArchive={searchArchiveOracle}
          onNavigate={onNavigate}
          proProfile={modelPreferences.personaProProfile}
          onProProfileChange={(personaProProfile) =>
            onModelPreferencesChange({ ...modelPreferences, personaProProfile })
          }
        />
      </div>
    </section>
  );
}
