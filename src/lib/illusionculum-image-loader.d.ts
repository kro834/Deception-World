export interface IllusionculumImageLoader {
  load(src: string): Promise<CanvasImageSource>;
  dispose(): void;
}
export function createIllusionculumImageLoader(
  environment?: typeof globalThis,
): IllusionculumImageLoader;
