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
      <b>ソースZIP</b>
      <a
        className="export-page-btn"
        href="https://github.com/kro834/Deception-World/archive/refs/heads/main.zip"
      >
        GitHubからZIPを保存する
      </a>
      <small>Code → Download ZIP と同じファイルです</small>
    </main>
  );
}
