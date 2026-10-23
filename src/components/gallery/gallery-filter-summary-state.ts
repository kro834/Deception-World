export type GalleryFilterSummaryState = {
  query: string;
  categoryLabel?: string;
  favoritesOnly: boolean;
  resultCount: number;
  totalCount: number;
};

export function galleryFilterConditions({
  query,
  categoryLabel,
  favoritesOnly,
}: Pick<GalleryFilterSummaryState, "query" | "categoryLabel" | "favoritesOnly">): string {
  const search = query.trim().replace(/\s+/g, " ");
  const conditions = [
    search ? `「${search}」の検索` : "",
    categoryLabel ? `分類「${categoryLabel}」` : "",
    favoritesOnly ? "お気に入りのみ" : "",
  ].filter(Boolean);
  return conditions.length > 0 ? `適用中の条件は${conditions.join("、")}です。` : "";
}

export function galleryFilterResultCount({
  resultCount,
  totalCount,
}: Pick<GalleryFilterSummaryState, "resultCount" | "totalCount">): string {
  return `全${totalCount}作品のうち${resultCount}作品を表示しています。`;
}

export function galleryEmptyMessage({
  query,
  categoryLabel,
  favoritesOnly,
  totalCount,
}: Omit<GalleryFilterSummaryState, "resultCount">): string {
  if (totalCount === 0) return "展示する作品はまだありません。";
  if (query.trim()) {
    const selection =
      categoryLabel && favoritesOnly
        ? "選択中の分類とお気に入り"
        : categoryLabel
          ? "選択中の分類"
          : "お気に入り";
    return categoryLabel || favoritesOnly
      ? `検索語に合う作品が、${selection}の中に見つかりません。検索語を変えるか、絞り込みを解除してお探しください。`
      : "検索語に合う作品が見つかりません。別の言葉や作品番号でお探しください。";
  }
  if (favoritesOnly) {
    return categoryLabel
      ? "この分類にはお気に入りの作品がありません。ほかの分類を選ぶか、絞り込みを解除してお探しください。"
      : "お気に入りの作品がまだありません。作品の「♡ お気に入り」から保存すると、ここでまとめて鑑賞できます。";
  }
  return "この分類には作品がありません。ほかの分類を選ぶか、絞り込みを解除してお探しください。";
}
