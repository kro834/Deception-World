import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { REALM_ROYAL, RR_FORM_ORDER, type RrFormKey } from "./final-stage-data";
import { cropFor, PARTS, PLATES, type Part } from "./royal-exhibit-data";
import { RoyalExhibitEffects } from "./royal-exhibit-effects";
import exhibitCss from "./royal-exhibit.css?url";

const partKeys = Object.keys(PARTS) as Part[];
type ImageSet = (source: string, width: number) => { srcSet?: string; sizes?: string };

function RegaliaCrest() {
  return (
    <svg
      className="rr-exhibit-crest"
      viewBox="-24 -24 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        r="21"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".34"
        strokeWidth=".9"
        strokeDasharray="10 3.2 2 3.2"
      />
      <path
        className="rr-exhibit-crest-star"
        fill="none"
        stroke="rgb(var(--rr-regalia-rgb))"
        strokeWidth="1.05"
        d="M0 -19 L2.4 -6.2 L13.4 -13.4 L6.2 -2.4 L19 0 L6.2 2.4 L13.4 13.4 L2.4 6.2 L0 19 L-2.4 6.2 L-13.4 13.4 L-6.2 2.4 L-19 0 L-6.2 -2.4 L-13.4 -13.4 L-2.4 -6.2Z"
      />
      <path
        className="rr-exhibit-crest-crown"
        fill="rgba(255, 243, 210, 0.14)"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
        d="M-11 6.5 L-13.8 -3.8 L-6.4 0.4 L0 -9.5 L6.4 0.4 L13.8 -3.8 L11 6.5Z M-9.5 9.6 H9.5"
      />
      <circle cx="0" cy="-11.6" r="1.45" fill="#fffdf2" />
      <circle cx="0" cy="2.2" r="1.5" fill="rgb(var(--rr-regalia-rgb))" />
    </svg>
  );
}

function CoronationHalo() {
  return (
    <svg
      className="rr-exhibit-coronation"
      viewBox="-180 -210 360 420"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none">
        <circle
          className="rr-coronation-ring-outer"
          cx="0"
          cy="-26"
          r="152"
          stroke="rgb(var(--rr-regalia-rgb))"
          strokeWidth="1.2"
          strokeDasharray="44 10 4 10 14 10"
        />
        <circle
          className="rr-coronation-ring-inner"
          cx="0"
          cy="-26"
          r="128"
          stroke="var(--rr-brass-bright)"
          strokeWidth="1.45"
          strokeDasharray="68 14 5 14"
        />
        <path
          className="rr-coronation-arch"
          stroke="var(--rr-brass-bright)"
          strokeWidth="1.6"
          d="M-142 62 A154 154 0 0 1 142 62"
        />
        <path
          className="rr-coronation-spires"
          stroke="rgb(var(--rr-regalia-rgb))"
          strokeWidth="1.25"
          strokeLinejoin="round"
          d="M-38 -158 L-48 -182 L-22 -170 L0 -198 L22 -170 L48 -182 L38 -158Z M0 -146 L4.5 -126 L20 -138 L9 -121 L28 -116 L9 -111 L20 -94 L4.5 -106 L0 -86 L-4.5 -106 L-20 -94 L-9 -111 L-28 -116 L-9 -121 L-20 -138 L-4.5 -126Z"
        />
      </g>
    </svg>
  );
}

function Detail({
  form,
  part,
  lockCue,
  imageSet,
}: {
  form: RrFormKey;
  part: Part;
  lockCue: number;
  imageSet: ImageSet;
}) {
  const art = REALM_ROYAL.visuals[RR_FORM_ORDER.indexOf(form)];
  const crop = cropFor(form, part, art.width, art.height);
  return (
    <figure className="rr-exhibit-detail rr-exhibit-lens" data-form={form} data-part={part}>
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
        <span key={`${part}-${lockCue}`} className="rr-exhibit-lock" aria-hidden="true" />
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
      <span className="rr-exhibit-select-bevel">
        <select value={value} onChange={(event) => onChange(event.target.value as RrFormKey)}>
          {options.map((key) => (
            <option key={key} value={key}>
              {REALM_ROYAL.forms[key].label}
            </option>
          ))}
        </select>
        <svg
          className="rr-exhibit-select-chevron"
          viewBox="0 0 12 12"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2.5 4.25 L6 7.75 L9.5 4.25"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
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
      data-form={form}
      data-coronation={demonstration ? "true" : undefined}
      data-selected-part={part}
      aria-label="レルムロイヤルの装甲部位展示"
      style={{ "--rr-tint": REALM_ROYAL.forms[form].accent } as CSSProperties}
    >
      <link rel="stylesheet" href={exhibitCss} precedence="royal-exhibit" />
      <div className="rr-exhibit-toolbar">
        <div className="rr-exhibit-toolbar-regalia">
          <RegaliaCrest />
          <FormSelect
            label="展示フォーム"
            value={form}
            options={RR_FORM_ORDER}
            onChange={selectForm}
          />
        </div>
        <div className="rr-exhibit-toolbar-actions">
          <button
            type="button"
            className="rr-exhibit-compare rr-exhibit-coronate-trigger"
            aria-pressed={demonstration}
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
              focusable="false"
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
      </div>
      <div className="rr-exhibit-grid">
        <div className="rr-exhibit-portrait-bed">
          {demonstration && <CoronationHalo key={`coronation-${form}-${cue}`} />}
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
              const isSelected = part === key;
              return (
                <button
                  key={key}
                  type="button"
                  className={isSelected ? "rr-exhibit-pin is-selected" : "rr-exhibit-pin"}
                  aria-label={`${REALM_ROYAL.armor[PARTS[key].armor].title}を拡大`}
                  aria-pressed={isSelected}
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
          <div
            className={compare ? "rr-exhibit-lenses is-compare" : "rr-exhibit-lenses"}
            data-comparing={compare}
          >
            <Detail form={form} part={part} lockCue={cue} imageSet={imageSet} />
            <div id="rr-exhibit-reference" hidden={!compare}>
              {compare && <Detail form={other} part={part} lockCue={cue} imageSet={imageSet} />}
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
