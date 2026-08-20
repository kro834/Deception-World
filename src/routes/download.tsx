import { createFileRoute } from "@tanstack/react-router";
import "@/styles-world-addon.css";

export const Route = createFileRoute("/download")({
  component: DownloadPage,
});

function DownloadPage() {
  return (
    <main className="export-page">
      <p>EXPORT</p>
      <h1>Deception World</h1>
      <b>サイトZIP</b>
      <a className="export-page-btn" href="/Deception-World.zip" download="Deception-World.zip">
        完全版ZIPを保存する
      </a>
      <a className="export-page-alt" href="/Deception-World-source.zip" download="Deception-World-source.zip">
        ソースのみ（約247KB）
      </a>
      <a className="export-page-alt" href="/api/export" download="Deception-World.zip">
        うまくいかないときはこちら
      </a>
      <small>完全版は約39MB ／ ソースZIPは画像なし ／ node_modules は含みません</small>
    </main>
  );
}
