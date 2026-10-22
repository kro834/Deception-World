import { FAR_FROM_SAGA } from "@/components/final-stage/final-stage-data";
import {
  P14_RECORD,
  P16_LINEUP,
  P16_OS_FLOW,
  P16_PENDING_SLOTS,
  comparisonColumn,
} from "./far-from-comparison-data";

/* #p16 — the frame of the 『P16』 chapter.

   The owner has published P16's place in the spec (認識・制御, beside
   Paranormal Realizer Ultra and Neural Resonancer Ultra) and what SA-GA OS
   6.1 does with recognition and control; P16's own specification is not
   published yet. So the chapter shows the spec line, the same line in the
   Extreme and Rexonance records, the OS's documented flow in the record's
   own words, and a 準備中 slot for everything about P16 itself. */

const isProcessor = (unit: string) => /^『P\d+/.test(unit);

export function FarFromP16() {
  const recognition = FAR_FROM_SAGA.specs.find((row) => row.dt === "認識・制御")?.dd ?? "";

  return (
    <>
      <div className="ffs-p16-overview rxs-reveal">
        <figure className="ffs-p16-chip" aria-hidden="true">
          <span className="ffs-p16-chip-frame">
            <i />
            <i />
            <i />
            <i />
            <b>P16</b>
          </span>
          <figcaption>ビジュアル準備中</figcaption>
        </figure>
        <div className="ffs-p16-copy">
          <small lang="en">RECOGNITION / CONTROL</small>
          <h3>認識・制御の構成</h3>
          <p>
            ファーフロムサーガのスペックでは、認識・制御の欄に次の3機構が記載されています。P16の役割と仕様は準備中です。
          </p>
          <ul className="ffs-p16-units" aria-label="認識・制御">
            {recognition.match(/『[^』]+』/g)?.map((unit) => (
              <li key={unit} data-processor={isProcessor(unit) || undefined}>
                {unit}
              </li>
            ))}
          </ul>
          <dl className="ffs-p16-slots" aria-label="P16の仕様">
            {P16_PENDING_SLOTS.map((slot) => (
              <div key={slot}>
                <dt>{slot}</dt>
                <dd>準備中</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <section className="ffs-p16-lineup rxs-reveal" aria-labelledby="ffs-p16-lineup-title">
        <header>
          <small lang="en">LINEUP</small>
          <h3 id="ffs-p16-lineup-title">各サーガの記載</h3>
          <p>認識・制御にあたる機構が、各サーガのスペックにどう記載されているかを並べています。</p>
        </header>
        <ol>
          {P16_LINEUP.map((entry) => {
            const column = comparisonColumn(entry.key);
            return (
              <li
                key={entry.key}
                style={{ ["--ffs-col-accent" as string]: column.accent }}
                data-current={entry.key === "farFrom" || undefined}
              >
                <p>
                  <b>{column.name}</b>
                  <small>{entry.field}</small>
                </p>
                <ul>
                  {entry.units.map((unit) => (
                    <li key={unit} data-processor={isProcessor(unit) || undefined}>
                      {unit}
                    </li>
                  ))}
                </ul>
                {entry.key === "rexonance" ? (
                  <p className="ffs-p16-record">
                    <small>P14（レクソナンスサーガの設定資料）</small>
                    <q>{P14_RECORD}</q>
                  </p>
                ) : null}
                {entry.key === "farFrom" ? (
                  <p className="ffs-p16-record">
                    <small>P16</small>
                    <span>仕様とP14との違いは準備中です。</span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="ffs-p16-flow rxs-reveal" aria-labelledby="ffs-p16-flow-title">
        <header>
          <small lang="en">SA-GA OS 6.1</small>
          <h3 id="ffs-p16-flow-title">認識・制御の流れ</h3>
          <p>
            ファーフロムビットと『SA-GA OS
            6.1』の記載から、観測した情報が判断に届くまでを順に引用しています。
          </p>
        </header>
        <ol>
          {P16_OS_FLOW.map((item) => (
            <li key={item.step}>
              <span aria-hidden="true">{item.step}</span>
              <h4>{item.title}</h4>
              <q>{item.quote}</q>
              {item.terms ? (
                <ul aria-label="反映先">
                  {item.terms.map((term) => (
                    <li key={term}>{term}</li>
                  ))}
                </ul>
              ) : null}
              <small>{item.source}</small>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
