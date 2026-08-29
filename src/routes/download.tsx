import { createFileRoute } from "@tanstack/react-router";
import { createWorldHead, WORLD_ADDON_STYLESHEET_LINK } from "@/lib/world-head";

const MAIN_ARCHIVE_URL = "https://github.com/kro834/Deception-World/archive/refs/heads/main.zip";

export const Route = createFileRoute("/download")({
  component: DownloadPage,
  head: () =>
    createWorldHead({
      title: "サイトデータ｜Deception World",
      description: "Deception Worldの公開中mainソースをZIPで取得できます。",
      stylesheetLinks: [WORLD_ADDON_STYLESHEET_LINK],
    }),
});

function DownloadPage() {
  return (
    <main className="export-page">
      <p>EXPORT</p>
      <h1>Deception World</h1>
      <b>MAIN ARCHIVE</b>
      <a className="export-page-btn" href={MAIN_ARCHIVE_URL}>
        公開中のmainをZIPで保存する
      </a>
      <a className="export-page-alt" href="/api/export">
        ダウンロードを再試行
      </a>
      <small>GitHub上の最新mainを取得します ／ node_modules は含みません</small>
    </main>
  );
}
