/** A decoded image may replace the picture only while its request is current. */
export function createScreeningSelection(load, commit, status, count) {
  let generation = 0;
  return {
    async select(index) {
      const next = ((index % count) + count) % count;
      const request = ++generation;
      status("loading", next);
      let ready = false;
      try {
        ready = await load(next);
      } catch {
        ready = false;
      }
      if (request !== generation) return;
      if (ready) commit(next);
      status(ready ? "ready" : "error", next);
    },
    invalidate() {
      generation += 1;
    },
  };
}
