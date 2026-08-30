import {
  localArchiveDelivery,
  type ArchiveDelivery,
  type ArchiveDeliveryReason,
} from "./archive-delivery.ts";
import { normalizeArchiveClassifierText } from "./archive-input.ts";

export type ArchiveSearchCandidate = {
  id: string;
  label: string;
  kicker: string;
  description: string;
  /** Server-owned extract from the destination page. Never accepted from the browser. */
  referenceExcerpt?: string;
};

export type ArchiveSearchConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ArchiveSearchReply = {
  reply: string;
  suggestions: string[];
  focusCandidateId?: string;
  referenceCandidateIds: string[];
  source: "openai" | "local";
  requestId?: string;
  requestedModel?: string;
  providerModel?: string;
  providerResponseId?: string;
  openaiRequestId?: string;
  modelVerified?: boolean;
  model?: string;
  notice?: string;
  delivery?: ArchiveDelivery;
};

const LOCAL_GREETING_PATTERN =
  /^[\s\p{P}\p{S}]*(?:おは(?:よう)?(?:ございます)?|こんにちは|こんばんは|やあ|よう|はじめまして|ただいま)[\s\p{P}\p{S}]*$/u;
const LOCAL_THANKS_PATTERN =
  /^[\s\p{P}\p{S}]*(?:ありがとう(?:ございます)?|どうも|助かった|感謝)[\s\p{P}\p{S}]*$/u;
const LOCAL_CAPABILITY_PATTERN =
  /(?:何ができる|なにができる|できること|使い方|あなたは誰|君は誰|きみは誰|サーチとは)/u;
const LOCAL_SELF_HARM_PATTERN =
  /(?:死にたい|消えたい|自殺(?:したい|する)?|自分を傷つけ|自傷|生きていたくない|今すぐ(?:死ぬ|消える))/u;
const LOCAL_ASSISTANT_WELLBEING_PATTERN =
  /^(?:元気(?:ですか)?|調子(?:は|どう)(?:ですか)?)[\s、。!！?？〜～]*$/u;
const LOCAL_DISTRESS_PATTERN = /(?:疲れた|しんどい|つらい|辛い|苦しい|落ち込|不安|眠れない)/u;
const LOCAL_ARCHIVE_INTENT_PATTERN =
  /(?:Deception World|デセプションワールド|このサイト|サイト内|公開記録|記録ページ|この作品|仮面ライダーサーガ|仮面ライダーレルム|ローア|ヴァンダール|レディック|アルゲノム|オーバーゼッツ|サイファー|シエル|月城悠真|東風谷慶弥|暁慶弥|怪作|ベル・アレイン|無神千桐|ジェームズ・スミス|マキャベル|拒絶の悪夢|レクソナンス|ドリームチャプター|六詠)/iu;

function createLocalGeneralSearchReply(
  query: string,
  notice?: string,
  deliveryReason: ArchiveDeliveryReason = "client_network",
): ArchiveSearchReply {
  const classified = normalizeArchiveClassifierText(query);
  const delivery = localArchiveDelivery(deliveryReason);
  if (LOCAL_GREETING_PATTERN.test(classified)) {
    return {
      reply:
        "おはようございます。今日は何を一緒に考えましょうか？　ちょっとした雑談や相談、文章づくり、一般的な質問でも大丈夫です。Deception Worldについてなら、答えに使った公開記録もあわせて案内できます。",
      suggestions: ["今日の相談に乗って", "このサイトについて教えて", "文章を一緒に考えて"],
      referenceCandidateIds: [],
      source: "local",
      delivery,
    };
  }
  if (LOCAL_THANKS_PATTERN.test(classified)) {
    return {
      reply:
        "どういたしまして。話の続きでも、まったく別の質問でも構いません。思いついた言葉のまま送ってください。",
      suggestions: ["もう少し続ける", "別の質問をする", "作品の記録を探す"],
      referenceCandidateIds: [],
      source: "local",
      delivery,
    };
  }
  if (LOCAL_CAPABILITY_PATTERN.test(classified)) {
    return {
      reply:
        "私はこのサイトの会話AIです。普段の質問、考えの整理、文章案、雑談や相談に答えられます。Deception Worldの人物・能力・作品を尋ねられたときは、公開記録を確認して要点をまとめ、実際に参照したページだけを回答の下へ表示します。",
      suggestions: ["相談に乗って", "文章を考えて", "シエルについて教えて"],
      referenceCandidateIds: [],
      source: "local",
      delivery,
    };
  }
  if (LOCAL_SELF_HARM_PATTERN.test(classified)) {
    return {
      reply:
        "今は一人で抱えず、まず危険な物や場所から離れて、近くにいる信頼できる人へ『今すぐそばにいてほしい』と伝えてください。今すぐ自分を傷つける可能性があるなら、この会話を待たずに地域の緊急通報・救急へ連絡するか、近くの人に代わりに連絡してもらってください。あなたの安全が最優先です。可能なら、今ひとりか、すぐ手を伸ばせる危険な物があるかだけ教えてください。",
      suggestions: ["今ひとりです", "近くの人に連絡します", "危険な物から離れました"],
      referenceCandidateIds: [],
      source: "local",
      delivery,
    };
  }
  if (LOCAL_ASSISTANT_WELLBEING_PATTERN.test(classified)) {
    return {
      reply:
        "元気です。声をかけてくれてありがとうございます。今日は雑談でも、相談でも、調べたいことでも大丈夫です。何から話しましょうか？",
      suggestions: ["少し雑談したい", "相談に乗って", "質問がある"],
      referenceCandidateIds: [],
      source: "local",
      delivery,
    };
  }
  if (LOCAL_DISTRESS_PATTERN.test(classified)) {
    return {
      reply:
        "話してくれてありがとうございます。すぐに結論を出さなくても大丈夫です。何があったのか、いちばん負担になっているところから少しずつ聞かせてください。考えの整理や、次にできそうな小さな一歩を一緒に探します。",
      suggestions: ["少し話を聞いて", "状況を整理したい", "気分転換を考えたい"],
      referenceCandidateIds: [],
      source: "local",
      delivery,
    };
  }
  return {
    reply:
      "もちろん、公開記録に限らず普通の質問や相談にも答えられます。ただ、現在はAI回線を利用できないため、この内容へ正確な一般回答を生成できませんでした。少し時間を置いて同じ質問をもう一度送るか、考えたい背景や目的を一つ添えてください。接続が戻り次第、会話の流れを踏まえて答えます。",
    suggestions: ["もう一度聞く", "目的を補足する", "サイトの記録を探す"],
    referenceCandidateIds: [],
    source: "local",
    notice,
    delivery,
  };
}

export function createLocalArchiveSearchReply({
  query,
  candidates,
  notice,
  deliveryReason = "client_network",
}: {
  query: string;
  candidates: readonly ArchiveSearchCandidate[];
  notice?: string;
  deliveryReason?: ArchiveDeliveryReason;
}): ArchiveSearchReply {
  const trimmed = normalizeArchiveClassifierText(query);
  const delivery = localArchiveDelivery(deliveryReason);
  const [top] = candidates;
  const compareRequested = /違い|比較|どちら|どっち/u.test(trimmed);
  const anotherRequested = /ほか|他|別の|別候補/u.test(trimmed);
  const reasonRequested = /なぜ|どうして|理由|合って|近い/u.test(trimmed);
  const second = candidates[1];
  const topReference = top?.referenceExcerpt ?? top?.description;
  const secondReference = second?.referenceExcerpt ?? second?.description;
  const archiveIntent = LOCAL_ARCHIVE_INTENT_PATTERN.test(trimmed);
  if (!archiveIntent) return createLocalGeneralSearchReply(query, notice, deliveryReason);
  if (!top) {
    return {
      reply:
        "Deception Worldの公開記録についての質問として受け取りましたが、今の手掛かりだけでは参照先を一つに絞れませんでした。人物名、作品名、能力、覚えている台詞や場面のうち、分かるものを一つだけ足してください。確認できる記録だけを使って、要点と参照ページをまとめます。",
      suggestions: ["人物名を補足する", "能力名を補足する", "覚えている場面を書く"],
      referenceCandidateIds: [],
      source: "local",
      notice,
      delivery,
    };
  }

  const reply =
    compareRequested && second
      ? `公開記録を比べると、『${top.label}』は${topReference} 一方、『${second.label}』は${secondReference} 今の手掛かりには前者がより近いと判断できます。違いは、前者が質問の中心を直接扱い、後者は比較・周辺情報を補う位置づけである点です。下に実際に参照した二つのページを並べます。`
      : anotherRequested && second
        ? `別の参照先としては『${second.label}』が近いです。公開記録では、${secondReference} 最初の候補とは扱う人物・機構・場面の軸が異なるため、別方向の情報を探している場合はこちらが有力です。回答の根拠にしたページは下からそのまま開けます。`
        : reasonRequested
          ? `『${top.label}』を挙げたのは、質問に含まれる人物・作品・能力の手掛かりが、この公開記録と最も強く一致したためです。記録本文では、${topReference} したがって、単に名前が近いだけでなく、質問の内容まで説明できる参照先です。別の観点を探している場合は、手掛かりを一つ足せば再照合できます。`
          : candidates.length === 1
            ? `公開記録を確認しました。質問に最も直接答えるのは『${top.label}』です。記録本文では、${topReference} この内容から、質問の中心はこのページで確認できると判断できます。まず要点をここで把握し、詳細な設定や画像、関連項目が必要なら下の参照ページを開いてください。`
            : `公開記録を照合した結果、質問に最も近いのは『${top.label}』です。記録本文では、${topReference} この内容が現在の質問へ最も直接つながります。ほかにも近い候補はありますが、まずはこの記録を回答の根拠としました。詳細な設定や関連項目は、下の参照ページから続けて確認できます。`;

  const referenceCandidateIds =
    compareRequested && second
      ? [top.id, second.id]
      : anotherRequested && second
        ? [second.id]
        : [top.id];

  return {
    reply,
    suggestions: top
      ? [`${top.label}についてもう少し教えて`, "ほかの候補との違いは？", "別の手掛かりで探す"]
      : ["人物名から探す", "能力名から探す", "作品名から探す"],
    focusCandidateId: anotherRequested && second ? second.id : top.id,
    referenceCandidateIds,
    source: "local",
    notice,
    delivery,
  };
}
