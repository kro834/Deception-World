import { getInquiryGuide, INQUIRY_GUIDES } from "@/lib/inquiry-guides";
import { Link } from "@tanstack/react-router";
import { pathArt } from "@/lib/record-art";
import { RecordArtFrame } from "./record-art";

export function LibraryInquiry({
  guide,
  onGuideChange,
}: {
  guide?: string;
  onGuideChange: (id: string) => void;
}) {
  const selected = getInquiryGuide(guide);
  return (
    <section className="library-inquiry" aria-labelledby="inquiry-title" id="inquiry">
      <header className="inquiry-heading">
        <p className="inquiry-eyebrow">FOLLOW A QUESTION</p>
        <h2 id="inquiry-title">問いから辿る</h2>
        <p>名前をまだ知らなくても、気になる問いから。人物や世界の記録を、三つの入口で辿ります。</p>
      </header>
      <div className="inquiry-choices" role="group" aria-label="辿りたい問い">
        {INQUIRY_GUIDES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`inquiry-choice inquiry-color-${item.color}`}
            aria-pressed={selected?.id === item.id}
            aria-controls="inquiry-guide"
            onClick={() => onGuideChange(selected?.id === item.id ? "" : item.id)}
          >
            <span className="inquiry-choice-art" aria-hidden="true">
              {item.stops.map((stop) => {
                const art = pathArt(stop.to, stop.hash);
                return art.src ? (
                  <img
                    key={stop.id}
                    src={art.src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    style={art.pos ? { objectPosition: art.pos } : undefined}
                  />
                ) : null;
              })}
            </span>
            <span className="inquiry-choice-label">問い {String(index + 1).padStart(2, "0")}</span>
            <span className="inquiry-choice-title">{item.question}</span>
            <span className="inquiry-choice-intro">{item.intro}</span>
            <span className="inquiry-choice-action">
              {selected?.id === item.id ? "案内をたたむ" : "この問いを辿る"}
              <span aria-hidden="true">{selected?.id === item.id ? "−" : "↗"}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {selected ? `${selected.question}の案内を表示しました。続く3つの資料から選べます。` : ""}
      </p>
      <div id="inquiry-guide" className="inquiry-guide">
        {selected ? (
          <div className={`inquiry-route inquiry-color-${selected.color}`}>
            <header className="inquiry-route-heading">
              <p className="inquiry-eyebrow">THREE ENTRANCES</p>
              <h3>{selected.question}</h3>
              <p>番号は案内の順番です。物語の時系列や読了を示すものではありません。</p>
            </header>
            <ol className="inquiry-stops">
              {selected.stops.map((stop, index) => (
                <li key={stop.id} className="inquiry-stop">
                  <span className="inquiry-stop-number" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <article className="inquiry-stop-body">
                    <RecordArtFrame
                      art={pathArt(stop.to, stop.hash)}
                      title={stop.title}
                      className="is-stop"
                    />
                    <p className="inquiry-stop-label">
                      入口 {index + 1} / {stop.sourceLabel}
                    </p>
                    <h4>{stop.title}</h4>
                    <p className="inquiry-look-for">{stop.lookFor}</p>
                    <blockquote>
                      <p>{stop.excerpt}</p>
                      <cite>{stop.sourceLabel}より</cite>
                    </blockquote>
                    <Link
                      className="inquiry-source-link"
                      to={stop.to}
                      search={{ guide: selected.id }}
                      hash={stop.hash}
                      aria-label={`${stop.sourceLabel}を読む`}
                    >
                      元資料を読む <span aria-hidden="true">↗</span>
                    </Link>
                  </article>
                </li>
              ))}
            </ol>
            <p className="inquiry-return-note">
              資料にある「問いの案内へ戻る」から、この案内へ戻れます。気になる入口から開いてください。
            </p>
          </div>
        ) : (
          <p className="inquiry-start-note">
            気になる問いを選ぶと、見どころと元資料への道案内が開きます。
          </p>
        )}
      </div>
    </section>
  );
}
