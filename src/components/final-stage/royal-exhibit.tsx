import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { REALM_ROYAL, RR_FORM_ORDER, type RrFormKey } from "./final-stage-data";
import { cropFor, PARTS, PLATES, type Part } from "./royal-exhibit-data";
import { RoyalExhibitEffects } from "./royal-exhibit-effects";
import exhibitCss from "./royal-exhibit.css?url";

const partKeys = Object.keys(PARTS) as Part[];
type ImageSet = (source: string, width: number) => { srcSet?: string; sizes?: string };

function Detail({ form, part, imageSet }: { form: RrFormKey; part: Part; imageSet: ImageSet }) {
  const art = REALM_ROYAL.visuals[RR_FORM_ORDER.indexOf(form)];
  const crop = cropFor(form, part, art.width, art.height);
  return (
    <figure className="rr-exhibit-detail" data-form={form} data-part={part}>
      <div className="rr-exhibit-crop">
        <img
          src={art.image}
          {...imageSet(art.image, art.width)}
          width={art.width}
          height={art.height}
          alt={`${art.label}の${REALM_ROYAL.armor[PARTS[part].armor].title}の拡大図`}
          loading="lazy"
          decoding="async"
          style={{
            width: `${crop.width * 100}%`,
            transform: `translate(${-crop.x * 100}%, ${-crop.y * 100}%)`,
          }}
        />
      </div>
      <figcaption>{art.label}</figcaption>
    </figure>
  );
}

function FormSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: RrFormKey;
  options: readonly RrFormKey[];
  onChange: (value: RrFormKey) => void;
}) {
  return (
    <label className="rr-exhibit-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as RrFormKey)}>
        {options.map((key) => (
          <option key={key} value={key}>
            {REALM_ROYAL.forms[key].label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function RoyalExhibit({
  form,
  onFormChange,
  imageSet,
  children,
}: {
  form: RrFormKey;
  onFormChange: (form: RrFormKey) => void;
  imageSet: ImageSet;
  children: ReactNode;
}) {
  const [part, setPart] = useState<Part>("reactor");
  const [compare, setCompare] = useState(false);
  const [reference, setReference] = useState<RrFormKey>("wrath");
  const [cue, setCue] = useState(0);
  const [demonstration, setDemonstration] = useState(false);
  const exhibitRef = useRef<HTMLElement>(null);
  const readingTop = useRef<number | null>(null);
  const alternatives = RR_FORM_ORDER.filter((key) => key !== form);
  const other = reference === form ? alternatives[0] : reference;
  const record = REALM_ROYAL.armor[PARTS[part].armor];
  const art = REALM_ROYAL.visuals[RR_FORM_ORDER.indexOf(form)];
  const mark = PLATES[form][part];
  const choose = (next: Part) => {
    setPart(next);
    setDemonstration(false);
    setCue((counter) => counter + 1);
  };

  // The form record above this exhibit changes length. Keep a reader who used
  // the exhibit selector on that control, including in browsers without scroll anchoring.
  const selectForm = (next: RrFormKey) => {
    readingTop.current = exhibitRef.current?.getBoundingClientRect().top ?? null;
    if (next === other) setReference(form);
    onFormChange(next);
  };
  useLayoutEffect(() => {
    const exhibit = exhibitRef.current;
    const panel = exhibit?.closest<HTMLElement>(".fst-pickup-panel");
    if (exhibit && panel && readingTop.current !== null) {
      panel.scrollTop += exhibit.getBoundingClientRect().top - readingTop.current;
    }
    readingTop.current = null;
  }, [form]);

  return (
    <section
      ref={exhibitRef}
      className="rr-exhibit"
      aria-label="レルムロイヤルの装甲部位展示"
      style={{ "--rr-tint": REALM_ROYAL.forms[form].accent } as CSSProperties}
    >
      <link rel="stylesheet" href={exhibitCss} precedence="royal-exhibit" />
      <div className="rr-exhibit-toolbar">
        <FormSelect
          label="展示フォーム"
          value={form}
          options={RR_FORM_ORDER}
          onChange={selectForm}
        />
        <button
          type="button"
          className="rr-exhibit-compare"
          onClick={() => {
            setDemonstration(true);
            setCue((counter) => counter + 1);
          }}
        >
          <span aria-hidden="true">▷</span> 能力演出を再生
        </button>
        <button
          type="button"
          className="rr-exhibit-compare"
          aria-expanded={compare}
          aria-controls="rr-exhibit-reference"
          onClick={() => setCompare(!compare)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          >
            <rect x="2" y="4" width="6" height="12" rx=".7" />
            <rect x="12" y="4" width="6" height="12" rx=".7" />
          </svg>
          {compare ? "比較を閉じる" : "フォームを比較"}
        </button>
      </div>
      <div className="rr-exhibit-grid">
        <div className="rr-exhibit-portrait-bed">
          <div
            className="rr-exhibit-portrait"
            style={{ aspectRatio: `${art.width} / ${art.height}` }}
          >
            {children}
            <RoyalExhibitEffects
              form={form}
              cue={cue}
              origin={demonstration ? PLATES[form].star : mark}
              reactor={demonstration ? PLATES[form].reactor : undefined}
            />
            {partKeys.map((key) => {
              const { x, y } = PLATES[form][key];
              return (
                <button
                  key={key}
                  type="button"
                  className="rr-exhibit-pin"
                  aria-label={`${REALM_ROYAL.armor[PARTS[key].armor].title}を拡大`}
                  aria-pressed={part === key}
                  onClick={() => choose(key)}
                  style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                >
                  <i aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
        <div className="rr-exhibit-study">
          <div className="rr-exhibit-parts" role="group" aria-label="展示部位">
            {partKeys.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={part === key}
                onClick={() => choose(key)}
              >
                {PARTS[key].label}
              </button>
            ))}
          </div>
          <div className="rr-exhibit-lenses" data-comparing={compare}>
            <Detail form={form} part={part} imageSet={imageSet} />
            <div id="rr-exhibit-reference" hidden={!compare}>
              {compare && <Detail form={other} part={part} imageSet={imageSet} />}
            </div>
          </div>
          {compare && (
            <FormSelect
              label="比較フォーム"
              value={other}
              options={alternatives}
              onChange={setReference}
            />
          )}
          <div className="rr-exhibit-notes" aria-live="polite" aria-atomic="true">
            {demonstration ? (
              <>
                <h4>ROULETTE → ROYALLL</h4>
                <p>
                  盾で受けたエネルギーを胸部のコロネーションリアクターへ。肩のレガリアスターを介し、蓄えた力を武装へ送る。
                </p>
              </>
            ) : (
              <>
                <h4>{record.title}</h4>
                <p>{record.body[0]}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
