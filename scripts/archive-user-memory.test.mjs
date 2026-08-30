import assert from "node:assert/strict";
import test from "node:test";
import {
  extractArchiveIntentNotes,
  parseArchiveUserMemory,
  serializeUntrustedArchiveMemory,
} from "../src/lib/archive-user-memory.ts";

test("intent extraction keeps greetings out and captures standing preferences", () => {
  assert.deepEqual(extractArchiveIntentNotes("こんにちは", { surface: "search" }), []);
  const remembered = extractArchiveIntentNotes("これからは短く答えて", { surface: "search" });
  assert.ok(remembered.some((note) => note.kind === "preference"));
  assert.ok(remembered.some((note) => note.kind === "style"));
  const unsafe = extractArchiveIntentNotes("password は abc12345", { surface: "search" });
  assert.equal(unsafe.length, 0);
});

test("memory notes stay bounded and serializable for the model", () => {
  const parsed = parseArchiveUserMemory({
    version: 1,
    notes: [
      { id: "a", kind: "style", text: "回答は短く", hits: 2, updatedAt: 1 },
      { id: "b", kind: "topic", text: "シエルについて調べている", hits: 1, updatedAt: 2 },
    ],
  });
  assert.equal(parsed.notes.length, 2);
  const blob = serializeUntrustedArchiveMemory(parsed.notes.map((note) => note.text));
  assert.match(blob, /USER INTENT MEMORY/);
  assert.match(blob, /回答は短く/);
});
