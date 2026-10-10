export interface RexonanceCountTemplate {
  prefix: string;
  suffix: string;
  width: number;
  decimals: number;
  grouped: boolean;
  value: number;
}

export function countTemplate(text: string): RexonanceCountTemplate | null;

export function formatCount(template: RexonanceCountTemplate, current: number): string;

export function mountRexonanceResonance(
  page: HTMLElement | null,
  environment?: typeof globalThis,
): () => void;
