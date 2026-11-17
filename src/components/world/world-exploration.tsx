import { GuardedLink } from "@/components/load-gate";
import { AssemblyComparisonLink } from "@/components/special/assembly-comparison-link";
import { FAR_FROM_SAGA_ENTER_ASSETS, REXONANCE_SAGA_ENTER_ASSETS } from "@/lib/asset-loader";
import { posterImage } from "@/lib/thumbnail-images";

const entrances = [
  {
    to: "/world-map",
    tone: "atlas",
    name: "人物・世界",
    detail: "公開記録から関係を辿る",
    image: "/deception-world-poster-delivery.webp",
  },
  {
    to: "/saga-cinema",
    tone: "cinema",
    name: "物語",
    detail: "映画四部作を鑑賞する",
    image: "/episode-03-deception-world-delivery-600.webp",
  },
  {
    to: "/library",
    tone: "library",
    name: "展示・資料",
    detail: "しおりと記録から探す",
    image: "/gallery/g03-480.webp",
  },
] as const;

// Use the same transparent figures as the two runways, without loading their
// renderer modules or atlas metadata when someone visits World.
const scenes = [
  {
    to: "/rexonance-saga",
    hash: "assembly",
    name: "レクソナンス",
    art: "/rexonance-suit-20261023/figure.webp",
    width: 571,
    assets: REXONANCE_SAGA_ENTER_ASSETS,
  },
  {
    to: "/far-from-saga",
    hash: "suitup",
    name: "ファーフロム",
    art: "/far-from-suit-20261023/figure.webp",
    width: 693,
    assets: FAR_FROM_SAGA_ENTER_ASSETS,
  },
] as const;

export function WorldExploration() {
  return (
    <nav className="world-exploration" aria-label="世界の探索" id="world-exploration">
      <section className="world-assembly-feature" aria-labelledby="world-assembly-title">
        <header className="world-assembly-heading">
          <h2 id="world-assembly-title">
            <GuardedLink to="/transformation-lab" assets={[]}>
              変身・フォーム研究室 <span aria-hidden="true">↗</span>
            </GuardedLink>
          </h2>
          <AssemblyComparisonLink rider="rexonance" />
        </header>
        <div className="world-assembly-scenes">
          {scenes.map(({ to, hash, name, art, width, assets }) => (
            <GuardedLink
              key={to}
              to={to}
              hash={hash}
              assets={assets}
              className="world-assembly-scene"
              aria-label={`${name}の変身シーンへ`}
            >
              <img
                src={art}
                width={width}
                height="1040"
                alt=""
                loading="lazy"
                decoding="async"
                fetchPriority="low"
              />
              <span>
                {name} <i aria-hidden="true">↘</i>
              </span>
            </GuardedLink>
          ))}
        </div>
      </section>
      <div className="world-exploration-index">
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
            <span>
              <strong>{entry.name}</strong>
              <small>{entry.detail}</small>
            </span>
            <b aria-hidden="true">↗</b>
          </GuardedLink>
        ))}
      </div>
    </nav>
  );
}
