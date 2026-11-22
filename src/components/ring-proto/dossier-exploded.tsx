// PROTOTYPE d1 「分解図」: the dossier as an exploded-view instrument.
// The figure stays at the centre; the file's parts orbit it. Choosing a part
// turns the orbit so the part meets the reading side, and its content springs
// open there. The figure answers: its facts fly out as callouts for 人物紹介,
// and its art changes to the chosen form for 変身記録.
import { useState } from "react";
import { protoRider } from "./rider";
import { ProtoChapter, ProtoForms, ProtoIdentity, ProtoQuotes, ProtoTopbar } from "./dossier-parts";
import { dossierImage } from "@/lib/dossier-images";

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
          {part === "profile" ? <ProtoQuotes rider={rider} /> : null}
          {part === "identity" ? <ProtoIdentity rider={rider} /> : null}
          {part === "index"
            ? rider.sections.map((section) => <ProtoChapter key={section.no} section={section} />)
            : null}
          {part === "forms" ? <ProtoForms rider={rider} active={form} onPick={setForm} /> : null}
        </div>
      </section>
    </main>
  );
}
