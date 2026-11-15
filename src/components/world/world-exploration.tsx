import { GuardedLink } from "@/components/load-gate";
import { posterImage } from "@/lib/thumbnail-images";

const entrances = [
  {
    to: "/world-map",
    code: "PORTAL 01 // ATLAS",
    tone: "atlas",
    name: "人物・世界",
    detail: "公開記録から関係を辿る",
    image: "/deception-world-poster-delivery.webp",
  },
  {
    to: "/transformation-lab",
    code: "PORTAL 02 // LAB",
    tone: "lab",
    name: "変身・フォーム研究室",
    detail: "変身の工程を操作して比較する",
    image: "/rider-saga-rexonance-thumbnail-20260827.jpeg",
  },
  {
    to: "/saga-cinema",
    code: "PORTAL 03 // CINEMA",
    tone: "cinema",
    name: "物語",
    detail: "映画四部作を鑑賞する",
    image: "/episode-03-deception-world-delivery-600.webp",
  },
  {
    to: "/library",
    code: "PORTAL 04 // LIBRARY",
    tone: "library",
    name: "展示・資料",
    detail: "しおりと記録から探す",
    image: "/gallery/g03-480.webp",
  },
] as const;

export function WorldExploration() {
  return (
    <nav className="world-exploration" aria-label="世界の探索" id="world-exploration">
      {entrances.map((entry) => (
        <GuardedLink
          key={entry.to}
          to={entry.to}
          assets={[]}
          data-portal={entry.tone}
          className="world-exploration-card"
        >
          <img
            src={entry.image}
            {...posterImage(entry.image)}
            alt=""
            loading="lazy"
            decoding="async"
            width="320"
            height="400"
          />
          <i className="world-exploration-rim" aria-hidden="true" />
          <em className="world-exploration-code" aria-hidden="true">
            {entry.code}
          </em>
          <span>
            <strong>{entry.name}</strong>
            <small>{entry.detail}</small>
          </span>
          <b aria-hidden="true">↗</b>
        </GuardedLink>
      ))}
    </nav>
  );
}
