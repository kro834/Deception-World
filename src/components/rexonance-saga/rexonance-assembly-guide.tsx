import { useEffect, useState, type RefObject } from "react";

const LOAD_COPY: Record<string, string> = {
  waiting: "表示設定に合わせて変身演出を準備します。",
  loading: "装甲の素材を読み込んでいます。",
  preparing: "装甲とナノマシンの配置を準備しています。",
  ready: "準備完了。下へ進むと装着、上へ戻ると分解します。",
  error: "素材を読み込めませんでした。接続を確認して再試行できます。",
  static: "現在は完成図を表示しています。動きを減らす設定や省エネ表示では、変身アニメーションを省略します。",
};

export function RexonanceAssemblyGuide({
  runwayRef,
}: {
  runwayRef: RefObject<HTMLDivElement | null>;
}) {
  const [load, setLoad] = useState("waiting");
  useEffect(() => {
    const runway = runwayRef.current;
    if (!runway) return;
    const update = () => setLoad(runway.dataset.rznLoad || "waiting");
    update();
    const observer = new MutationObserver(update);
    observer.observe(runway, { attributes: true, attributeFilter: ["data-rzn-load"] });
    return () => observer.disconnect();
  }, [runwayRef]);
  return (
    <section id="assembly" className="rxs-assembly-heading" aria-labelledby="rxs-assembly-title">
      <div>
        <p className="rxs-assembly-eyebrow">SUIT-UP / INTERACTIVE ASSEMBLY</p>
        <h2 id="rxs-assembly-title">装甲が、身体になる。</h2>
        <p>
          スクロールの速さで、装着の速さが変わる。装甲の接近から固定、出力の起動までを、自分のペースで。
        </p>
        <p className="rxs-assembly-status" role="status" aria-live="polite" aria-atomic="true">
          {LOAD_COPY[load] || LOAD_COPY.waiting}
        </p>
      </div>
      <div className="rxs-assembly-controls">
        {load === "error" ? (
          <button
            type="button"
            onClick={() => runwayRef.current?.dispatchEvent(new Event("rexonance:assembly-retry"))}
          >
            素材を再読み込み
          </button>
        ) : null}
        <a href="#stages">形態を見る</a>
      </div>
    </section>
  );
}

export function RexonanceAssemblyReplay() {
  return (
    <div className="rxs-assembly-footer">
      <p>装甲の接近、固定、起動。気になる瞬間は、スクロールを戻してもう一度。</p>
      <div className="rxs-assembly-controls">
        <a href="#assembly">もう一度、装着を体験</a>
        <a href="#stages">三つの形態へ</a>
      </div>
    </div>
  );
}
