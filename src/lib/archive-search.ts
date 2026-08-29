export type ArchiveSearchCandidate = {
  id: string;
  label: string;
  kicker: string;
  description: string;
};

export type ArchiveSearchConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ArchiveSearchReply = {
  reply: string;
  suggestions: string[];
  focusCandidateId?: string;
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
  const reply = !top
    ? "まだ記録を特定できませんでした。人物名、作品名、能力、見たい場面のうち、覚えている手掛かりを一つだけ足してもらえますか？"
    : compareRequested && second
      ? `『${top.label}』は${top.description} 一方、『${second.label}』は${second.description} 今の手掛かりには前者が近いですが、どちらを開きたいか選べます。`
      : anotherRequested && second
        ? `別の候補なら『${second.label}』が近いです。${second.description} 最初の候補と違う方向を探しているなら、こちらを確認してみてください。`
        : reasonRequested
          ? `『${top.label}』を挙げたのは、今の言葉がこの記録の人物・作品・内容に最も近かったためです。${top.description} 違う観点を探しているなら、手掛かりを一つ足せば絞り直せます。`
          : candidates.length === 1
            ? `見つけました。いちばん近いのは『${top.label}』です。${top.description} この記録を開けば、探している内容まで進めそうです。`
            : `候補を${candidates.length}件まで絞りました。いちばん近いのは『${top.label}』です。${top.description} 違っていれば、下の候補から選ぶか、覚えている言葉をもう一つ教えてください。`;

  return {
    reply,
    suggestions: top
      ? [`${top.label}についてもう少し教えて`, "ほかの候補との違いは？", "別の手掛かりで探す"]
      : ["人物名から探す", "能力名から探す", "作品名から探す"],
    focusCandidateId: top?.id,
    source: "local",
    notice,
  };
}
