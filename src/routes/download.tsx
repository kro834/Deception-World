import { createFileRoute, Link } from "@tanstack/react-router";
import {
  createWorldHead,
  DOSSIER_HUD_FONTS_URL,
  WORLD_ADDON_STYLESHEET_LINK,
} from "@/lib/world-head";
import downloadCssUrl from "@/styles-download.css?url";

const MAIN_ARCHIVE_URL = "https://github.com/kro834/Deception-World/archive/refs/heads/main.zip";

export const Route = createFileRoute("/download")({
  component: DownloadPage,
  head: () =>
    createWorldHead({
      title: "ソースコードの取得｜Deception World",
      description:
        "Deception WorldのGitHub上の最新mainソースをZIPで取得できます。公開サイトの配信版とは異なる場合があります。",
      // Addon first: the page sheet wins the cascade; the HUD subset is the
      // dossiers' Michroma (capitals and digits) for the EXPORT / MAIN ARCHIVE labels.
      stylesheetLinks: [
        WORLD_ADDON_STYLESHEET_LINK,
        { rel: "stylesheet", href: DOSSIER_HUD_FONTS_URL },
        { rel: "stylesheet", href: downloadCssUrl },
      ],
    }),
});

function DownloadPage() {
  return (
    <main className="export-page dg-focus-scope" aria-labelledby="export-heading">
      <span className="export-page-sigil" aria-hidden="true">
        <i>DW</i>
      </span>
      <p>EXPORT</p>
      <h1 id="export-heading">Deception World</h1>
      <b>SOURCE CODE / MAIN</b>
      <a className="export-page-btn" href={MAIN_ARCHIVE_URL} aria-describedby="export-scope">
        最新mainのソースをZIPで保存する
      </a>
      <a className="export-page-alt" href="/api/export" aria-describedby="export-retry-note">
        ダウンロードを再試行
      </a>
      {/* One line per sentence (the sheet sets each on its own line), so
          Chromium's phrase breaks and Safari's punctuation breaks agree. */}
      <small id="export-scope">
        <span>GitHub上のソースコードです。</span>
        <span>公開サイトの配信版とは異なる場合があります。</span>
        <span>ギャラリーに投稿した画像・しおり・個人設定・node_modules は含みません。</span>
        <span id="export-retry-note">再試行も同じmainのZIPを取得します。</span>
      </small>
      <nav className="export-page-navigation" aria-label="取得前の確認と資料への移動">
        <Link to="/world" className="export-page-back">
          メインサイトへ戻る
        </Link>
        <Link to="/library" className="export-page-context">
          資料室・しおり
        </Link>
        <a
          className="export-page-context"
          href="https://github.com/kro834/Deception-World/tree/main"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHubで内容を確認（別タブ）
        </a>
      </nav>
    </main>
  );
}
