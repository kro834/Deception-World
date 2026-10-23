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
    { to: "/world", title: "ワールド", code: "WORLD", art: "/poster-card-03-delivery.webp" },
    {
      to: recent?.path ?? "/library",
      hash: recent?.hash,
      title: recent?.title ?? "資料室・しおり",
      code: recent ? "CONTINUE" : "LIBRARY",
      context: recent ? "最近読んだ資料" : undefined,
      art: recent
        ? pathArt(recent.path, recent.hash).src
        : "/rider-saga-rexonance-thumbnail-20260827-400.webp",
    },
    {
      to: "/search",
      title: "資料を探す",
      code: "SEARCH",
      art: "/episode-03-deception-world-delivery-600.webp",
    },
  ];
  return (
    <nav className="recovery-tiles" aria-label="次に開く資料">
      <link rel="stylesheet" href={recoveryCss} precedence="default" />
      {tiles.map((tile) => (
        <Link
          key={tile.code}
          to={tile.to}
          hash={tile.hash}
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
          <small>{tile.context ?? tile.code}</small>
          <b>{tile.title}</b>
        </Link>
      ))}
    </nav>
  );
}
