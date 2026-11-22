// PROTOTYPE: the dossier's reading blocks, shared by d1-d3. The copy is the
// rider record as written; form records link to the real page so the suit-up
// engines stay untouched.
import { PhrasedText } from "@/components/world/dossier-reader";
import { dossierImage } from "@/lib/dossier-images";
import { protoRider } from "./rider";

type Rider = ReturnType<typeof protoRider>;

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

export function ProtoQuotes({ rider }: { rider: Rider }) {
  return (
    <div className="rp-quotes">
      {rider.quotes.map((quote) => (
        <q key={quote}>{quote}</q>
      ))}
    </div>
  );
}

export function ProtoFacts({ rider }: { rider: Rider }) {
  return (
    <dl className="rp-facts">
      {rider.facts.map((fact) => (
        <div key={fact.dt}>
          <dt>{fact.dt}</dt>
          <dd>{fact.dd}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProtoIdentity({ rider }: { rider: Rider }) {
  return (
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
  );
}

export function ProtoChapter({ section }: { section: Rider["sections"][number] }) {
  return (
    <article className="rp-card rp-chapter">
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
  );
}

export function ProtoForms({
  rider,
  active,
  onPick,
}: {
  rider: Rider;
  active?: number;
  onPick?: (index: number) => void;
}) {
  return (
    <>
      {rider.forms.map((entry, index) => (
        <a
          className="rp-card rp-card-link rp-form"
          key={`${entry.name}-${entry.sub ?? ""}`}
          href={`/riders/${rider.id}#form-records`}
          data-on={index === active}
          onMouseEnter={() => onPick?.(index)}
          onFocus={() => onPick?.(index)}
        >
          <span className="rp-card-art">
            <img src={entry.img} {...dossierImage(entry.img)} alt="" loading="lazy" />
          </span>
          <h2>{entry.displayName ?? entry.name}</h2>
          {entry.sub ? <small>{entry.sub}</small> : null}
          {entry.quote ? <q>{entry.quote}</q> : null}
        </a>
      ))}
    </>
  );
}
