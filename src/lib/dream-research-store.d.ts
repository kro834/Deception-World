export type ResearchQuote = { id: string; caseNo: string; paragraph: number; text: string };
export type ResearchNote = { id: string; quoteIds: string[]; thought: string };
export type ResearchData = { version: number; quotes: ResearchQuote[]; notes: ResearchNote[] };
export const DREAM_RESEARCH_KEY: string;
export function emptyResearch(): ResearchData;
export function validateResearch(
  value: unknown,
  cases: readonly { no: string; paragraphs: readonly string[] }[],
): ResearchData;
export function readResearch(
  storage: Pick<Storage, "getItem">,
  cases: readonly { no: string; paragraphs: readonly string[] }[],
): { data: ResearchData; error: string };
export function writeResearch(storage: Pick<Storage, "setItem">, data: ResearchData): boolean;
export function removeResearchQuote(data: ResearchData, id: string): ResearchData;
