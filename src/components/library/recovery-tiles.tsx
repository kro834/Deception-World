import { Link } from "@tanstack/react-router";
import { LIBRARY_ENTRIES } from "@/lib/library-data";
import { pathArt } from "@/lib/record-art";
import { recordImage } from "@/lib/record-images";
import { useLibraryStore } from "./library-store";
import recoveryCss from "@/styles-recovery-tiles.css?url";

export function RecoveryTiles() {
  const { saved } = useLibraryStore();
  const recent = saved.recent
    .map((visit) => LIBRARY_ENTRIES.find((entry) => entry.id === visit.id))
    .find((entry) => entry && entry.path !== "/world");
  const tiles = [
    {
      key: "world",
      to: "/world",
      title: "ワールド",
      kicker: "物語の拠点",
      art: "/poster-card-03-delivery.webp",
    },
    {
      key: "library",
      to: recent?.path ?? "/library",
      hash: recent?.hash,
      title: recent?.title ?? "資料室・しおり",
      kicker: "一覧・しおり",
      context: recent ? "最近読んだ資料" : undefined,
      art: recent
        ? pathArt(recent.path, recent.hash).src
        : "/rider-saga-rexonance-thumbnail-20260827-400.webp",
    },
    {
      key: "search",
      to: "/search",
      title: "全文検索",
      kicker: "語句から探す",
      art: "/episode-03-deception-world-delivery-600.webp",
    },
  ];
  return (
    <nav className="recovery-tiles" aria-label="次に開く資料">
      <link rel="stylesheet" href={recoveryCss} precedence="default" />
      {tiles.map((tile) => (
        <Link
          key={tile.key}
          to={tile.to}
          hash={tile.hash}
          data-recent={tile.context ? "true" : undefined}
          aria-label={tile.context ? `${tile.context}：${tile.title}` : undefined}
        >
          {tile.art ? (
            <img
              {...recordImage(tile.art)}
              sizes="(max-width: 760px) 29vw, 240px"
              loading="lazy"
              decoding="async"
              alt=""
            />
          ) : null}
          <small>{tile.context ?? tile.kicker}</small>
          <b>{tile.title}</b>
        </Link>
      ))}
    </nav>
  );
}
