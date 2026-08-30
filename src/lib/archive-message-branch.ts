export type BranchableArchiveMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

/** Replace one user turn and discard every later branch. */
export function branchArchiveMessages<T extends BranchableArchiveMessage>(
  messages: readonly T[],
  messageId: string,
  revisedText: string,
): T[] | null {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index < 0 || messages[index].role !== "user" || !revisedText.trim()) return null;
  return [...messages.slice(0, index), { ...messages[index], text: revisedText } as T];
}
