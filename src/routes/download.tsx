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
    <main className="export-page">
      <span className="export-page-sigil" aria-hidden="true">
        <i>DW</i>
      </span>
      <p>EXPORT</p>
      <h1>Deception World</h1>
      <b>SOURCE CODE / MAIN</b>
      <a className="export-page-btn" href={MAIN_ARCHIVE_URL}>
        最新mainのソースをZIPで保存する
      </a>
      <a className="export-page-alt" href="/api/export">
        ダウンロードを再試行
      </a>
      <small>
        GitHub上のソースコードです。公開サイトの配信版とは異なる場合があります。
        ギャラリーに投稿した画像・しおり・個人設定・node_modules は含みません。
      </small>
      <Link to="/world" className="export-page-back">
        メインサイトへ戻る
      </Link>
    </main>
  );
}
