import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/form-archive")({
  component: SagaFormArchive,
  head: () => ({
    meta: [
      { title: "仮面ライダーサーガ｜フォームアーカイブ" },
      {
        name: "description",
        content: "仮面ライダーサーガのフォーム一覧・スペック・比較アーカイブ。",
      },
    ],
  }),
});

function SagaFormArchive() {
  return (
    <main className="form-archive-page">
      <iframe
        title="仮面ライダーサーガ フォームアーカイブ"
        src="/saga-form-archive-standalone.html"
        sandbox="allow-scripts allow-downloads"
        referrerPolicy="no-referrer"
      />
    </main>
  );
}
