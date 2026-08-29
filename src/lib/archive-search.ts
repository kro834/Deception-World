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
  model?: string;
  notice?: string;
};

export function createLocalArchiveSearchReply({
  query,
  candidates,
  notice,
}: {
  query: string;
  candidates: readonly ArchiveSearchCandidate[];
  notice?: string;
}): ArchiveSearchReply {
  const trimmed = query.trim();
  const [top] = candidates;
  const compareRequested = /違い|比較|どちら|どっち/u.test(trimmed);
  const anotherRequested = /ほか|他|別の|別候補/u.test(trimmed);
  const reasonRequested = /なぜ|どうして|理由|合って|近い/u.test(trimmed);
  const second = candidates[1];
  const topReference = top?.referenceExcerpt ?? top?.description;
  const secondReference = second?.referenceExcerpt ?? second?.description;
  const reply = !top
    ? "まだ参照できる記録を特定できませんでした。曖昧なまま内容を作らず、人物名、作品名、能力、覚えている台詞や場面のうち、手掛かりを一つだけ足してもらえますか？　次の返答では、その情報と公開記録を照合して内容をまとめます。"
    : compareRequested && second
      ? `公開記録を比べると、『${top.label}』は${topReference} 一方、『${second.label}』は${secondReference} 今の手掛かりには前者がより近いと判断できます。違いは、前者が質問の中心を直接扱い、後者は比較・周辺情報を補う位置づけである点です。下に実際に参照した二つのページを並べます。`
      : anotherRequested && second
        ? `別の参照先としては『${second.label}』が近いです。公開記録では、${secondReference} 最初の候補とは扱う人物・機構・場面の軸が異なるため、別方向の情報を探している場合はこちらが有力です。回答の根拠にしたページは下からそのまま開けます。`
        : reasonRequested
          ? `『${top.label}』を挙げたのは、質問に含まれる人物・作品・能力の手掛かりが、この公開記録と最も強く一致したためです。記録本文では、${topReference} したがって、単に名前が近いだけでなく、質問の内容まで説明できる参照先です。別の観点を探している場合は、手掛かりを一つ足せば再照合できます。`
          : candidates.length === 1
            ? `公開記録を確認しました。質問に最も直接答えるのは『${top.label}』です。記録本文では、${topReference} この内容から、質問の中心はこのページで確認できると判断できます。まず要点をここで把握し、詳細な設定や画像、関連項目が必要なら下の参照ページを開いてください。`
            : `公開記録を照合した結果、質問に最も近いのは『${top.label}』です。記録本文では、${topReference} この内容が現在の質問へ最も直接つながります。ほかにも近い候補はありますが、まずはこの記録を回答の根拠としました。詳細な設定や関連項目は、下の参照ページから続けて確認できます。`;

  const referenceCandidateIds = !top
    ? []
    : compareRequested && second
      ? [top.id, second.id]
      : anotherRequested && second
        ? [second.id]
        : [top.id];

  return {
    reply,
    suggestions: top
      ? [`${top.label}についてもう少し教えて`, "ほかの候補との違いは？", "別の手掛かりで探す"]
      : ["人物名から探す", "能力名から探す", "作品名から探す"],
    focusCandidateId: anotherRequested && second ? second.id : top?.id,
    referenceCandidateIds,
    source: "local",
    notice,
  };
}
