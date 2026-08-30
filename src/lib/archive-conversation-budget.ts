import { truncateArchiveInput } from "./archive-input.ts";

export type BoundedConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export function trimArchiveConversation(
  messages: readonly BoundedConversationTurn[],
  {
    maxTurns,
    maxTotalChars,
    maxCharsPerTurn,
  }: {
    maxTurns: number;
    maxTotalChars: number;
    maxCharsPerTurn: number;
  },
): BoundedConversationTurn[] {
  const turnLimit = Math.max(0, Math.floor(maxTurns));
  const totalLimit = Math.max(0, Math.floor(maxTotalChars));
  const perTurnLimit = Math.max(0, Math.floor(maxCharsPerTurn));
  if (!turnLimit || !totalLimit || !perTurnLimit) return [];

  const bounded = messages
    .map((message) => ({
      role: message.role,
      content: truncateArchiveInput(message.content.trim(), perTurnLimit),
    }))
    .filter((message) => message.content)
    .slice(-turnLimit);
  const result: BoundedConversationTurn[] = [];
  let remaining = totalLimit;

  for (let index = bounded.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const message = bounded[index];
    const content = truncateArchiveInput(message.content, remaining);
    if (!content) continue;
    result.unshift({ ...message, content });
    remaining -= content.length;
  }

  return result;
}
