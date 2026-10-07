/** A viewing deck is made once; filters and favorites never reorder it afterward. */
export function shuffleGalleryDeck<T extends { id: string }>(
  works: readonly T[],
  previousId?: string | null,
  random: () => number = Math.random,
): T[] {
  const deck = [...new Map(works.map((work) => [work.id, work])).values()];
  for (let index = deck.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [deck[index], deck[swap]] = [deck[swap], deck[index]];
  }
  // A new round should visibly start elsewhere, without retrying random draws.
  if (deck.length > 1 && deck[0].id === previousId) [deck[0], deck[1]] = [deck[1], deck[0]];
  return deck;
}

export function availableGalleryDeck<T extends { id: string }>(
  session: readonly T[],
  available: readonly T[],
): T[] {
  const current = new Map(available.map((work) => [work.id, work]));
  return session.flatMap((work) => {
    const found = current.get(work.id);
    return found ? [found] : [];
  });
}
