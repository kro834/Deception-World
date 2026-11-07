export type ResearchSourceKind = "case" | "person";
export type ResearchSourceRef = {
  kind: ResearchSourceKind;
  id: string;
  title: string;
  paragraphId: string;
};
export type ResearchAnchor = { exact: string; prefix: string; suffix: string };
export type ResearchQuote = {
  id: string;
  caseNo?: string;
  paragraph: number;
  text: string;
  source?: ResearchSourceRef;
  anchor?: ResearchAnchor;
};
export type ResearchNote = { id: string; quoteIds: string[]; thought: string };
export type ResearchData = { version: number; quotes: ResearchQuote[]; notes: ResearchNote[] };
export type ResearchSource = {
  kind: ResearchSourceKind;
  id: string;
  title: string;
  paragraphs: readonly { id: string; text: string }[];
};
export type ResearchResolution =
  | {
      status: "resolved";
      source: ResearchSource;
      paragraph: { id: string; text: string };
      start: number;
      end: number;
    }
  | { status: "missing" | "ambiguous" };
export const DREAM_RESEARCH_KEY: string;
export function emptyResearch(): ResearchData;
export function validateResearch(
  value: unknown,
  cases?: readonly { no: string; paragraphs: readonly string[] }[],
): ResearchData;
export function readResearch(
  storage: Pick<Storage, "getItem">,
  cases?: readonly { no: string; paragraphs: readonly string[] }[],
): { data: ResearchData; error: string };
export function writeResearch(storage: Pick<Storage, "setItem">, data: ResearchData): boolean;
export function removeResearchQuote(data: ResearchData, id: string): ResearchData;
export function createResearchAnchor(
  text: string,
  start: number,
  end: number,
): ResearchAnchor | null;
export function resolveResearchQuote(
  quote: ResearchQuote,
  sources: readonly ResearchSource[],
): ResearchResolution;
