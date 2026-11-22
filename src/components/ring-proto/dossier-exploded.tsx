// PROTOTYPE d1 「分解図」: the dossier as an exploded-view instrument.
// The figure stays at the centre; the file's parts orbit it. Choosing a part
// turns the orbit so the part meets the reading side, and its content springs
// open there. The figure answers: its facts fly out as callouts for 人物紹介,
// and its art changes to the chosen form for 変身記録.
import { useState } from "react";
import { protoRider } from "./rider";
import { PhrasedText } from "@/components/world/dossier-reader";
import { dossierImage } from "@/lib/dossier-images";

export function ProtoTopbar() {
  return (
    <header className="rp-topbar">
      <a className="rp-back" href="/world#riders-return">
        <i aria-hidden="true">←</i>
        <span>ライダー一覧へ戻る</span>
      </a>
      <button type="button" className="rp-trigger" aria-label="メニューを開く">
        <i aria-hidden="true" />
      </button>
    </header>
  );
}

export function DossierExploded({
  riderId,
  initialPart,
}: {
  riderId: string;
  initialPart?: string;
}) {
  const rider = protoRider(riderId);
  const parts = [
    { id: "profile", label: "人物紹介" },
    { id: "identity", label: "関連記録" },
    { id: "index", label: "人物資料" },
    ...(rider.forms.length ? [{ id: "forms", label: "変身記録" }] : []),
  ];
  const n = parts.length;
  const [turn, setTurn] = useState(
    Math.max(
      0,
      parts.findIndex((part) => part.id === initialPart),
    ),
  );
  const [form, setForm] = useState(0);
  const active = ((turn % n) + n) % n;
  const part = parts[active].id;
  const choose = (index: number) =>
    setTurn((value) => {
      let delta = (((index - value) % n) + n) % n;
      if (delta > n / 2) delta -= n;
      return value + delta;
    });
  const identityArt = rider.nightmare?.img ?? rider.partner?.image ?? rider.civilianImg;
  const formArt = rider.forms[form]?.img ?? rider.img;
  const art = part === "forms" ? formArt : part === "identity" ? identityArt : rider.civilianImg;
  const arts = [...new Set([rider.civilianImg, identityArt, ...rider.forms.map((f) => f.img)])];

  return (
    <main
      className="rp-doc rp-d1"
      data-part={part}
      style={{ ["--tone" as string]: rider.tone, ["--step" as string]: `${360 / n}deg` }}
    >
      <ProtoTopbar />
      <header className="rp-d1-identity">
        <h1>{rider.civilian.name}</h1>
        <p># {rider.epithet}</p>
      </header>
      <section className="rp-d1-stage" style={{ ["--turn" as string]: turn }}>
        <i className="rp-d1-halo" aria-hidden="true" />
        <span className="rp-d1-numeral" aria-hidden="true">
          {rider.no}
        </span>
        <div className="rp-d1-figure">
          {arts.map((src) => (
            <img
              key={src}
              src={src}
              {...dossierImage(src)}
              alt={src === rider.civilianImg ? `${rider.civilian.name}の変身前ビジュアル` : ""}
              data-on={src === art}
              loading={src === rider.civilianImg ? "eager" : "lazy"}
              decoding="async"
            />
          ))}
        </div>
        <dl className="rp-d1-facts">
          {rider.facts.map((fact, index) => (
            <div key={fact.dt} style={{ ["--i" as string]: index }}>
              <dt>{fact.dt}</dt>
              <dd>{fact.dd}</dd>
            </div>
          ))}
        </dl>
        <i className="rp-d1-track" aria-hidden="true" />
        <div className="rp-d1-orbit" role="tablist" aria-label={`${rider.civilian.name}の資料`}>
          {parts.map((entry, index) => (
            <span className="rp-d1-spoke" key={entry.id} style={{ ["--i" as string]: index }}>
              <button
                type="button"
                role="tab"
                id={`rp-d1-tab-${entry.id}`}
                aria-selected={index === active}
                aria-controls="rp-d1-panel"
                tabIndex={index === active ? 0 : -1}
                className="rp-d1-node"
                onClick={() => choose(index)}
                onKeyDown={(event) => {
                  const move =
                    event.key === "ArrowRight" || event.key === "ArrowDown"
                      ? 1
                      : event.key === "ArrowLeft" || event.key === "ArrowUp"
                        ? -1
                        : 0;
                  if (!move) return;
                  event.preventDefault();
                  setTurn((value) => value + move);
                  document
                    .getElementById(`rp-d1-tab-${parts[(((index + move) % n) + n) % n].id}`)
                    ?.focus();
                }}
              >
                <span>{entry.label}</span>
              </button>
            </span>
          ))}
        </div>
      </section>
      <section className="rp-d1-read">
        <div
          className="rp-d1-panel"
          id="rp-d1-panel"
          role="tabpanel"
          aria-labelledby={`rp-d1-tab-${part}`}
          key={part}
        >
          {part === "profile" ? (
            <div className="rp-quotes">
              {rider.quotes.map((quote) => (
                <q key={quote}>{quote}</q>
              ))}
            </div>
          ) : null}
          {part === "identity" ? (
            <>
              <article className="rp-card">
                <p className="rp-kicker">{rider.civilian.kicker}</p>
                <small>変身前の姿</small>
                <h2>{rider.civilian.name}</h2>
                <p>{rider.civilian.body}</p>
                {rider.civilian.cv ? <p>CV {rider.civilian.cv}</p> : null}
              </article>
              {rider.partner ? (
                <article className="rp-card">
                  <p className="rp-kicker">{rider.partner.kicker}</p>
                  <small>{rider.partner.tag}</small>
                  <h2>{rider.partner.name}</h2>
                  <q>{rider.partner.call}</q>
                  {rider.partner.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                  ))}
                </article>
              ) : null}
              {rider.nightmare ? (
                <a className="rp-card rp-card-link" href={`/riders/${rider.id}#identity-records`}>
                  <span className="rp-card-art">
                    <img src={rider.nightmare.img} {...dossierImage(rider.nightmare.img)} alt="" />
                  </span>
                  <h2>{rider.nightmare.name}</h2>
                  <q>{rider.nightmare.quote}</q>
                </a>
              ) : null}
            </>
          ) : null}
          {part === "index"
            ? rider.sections.map((section) => (
                <article className="rp-card rp-chapter" key={section.no}>
                  <span className="rp-chapter-no" aria-hidden="true">
                    {section.no}
                  </span>
                  <p className="rp-kicker">{section.kicker}</p>
                  <h2>
                    <PhrasedText text={section.title} />
                  </h2>
                  {section.body.map((paragraph) => (
                    <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                  ))}
                </article>
              ))
            : null}
          {part === "forms"
            ? rider.forms.map((entry, index) => (
                <a
                  className="rp-card rp-card-link rp-form"
                  key={`${entry.name}-${entry.sub ?? ""}`}
                  href={`/riders/${rider.id}#form-records`}
                  data-on={index === form}
                  onMouseEnter={() => setForm(index)}
                  onFocus={() => setForm(index)}
                >
                  <span className="rp-card-art">
                    <img src={entry.img} {...dossierImage(entry.img)} alt="" loading="lazy" />
                  </span>
                  <h2>{entry.displayName ?? entry.name}</h2>
                  {entry.sub ? <small>{entry.sub}</small> : null}
                  {entry.quote ? <q>{entry.quote}</q> : null}
                </a>
              ))
            : null}
        </div>
      </section>
    </main>
  );
}
