import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { REALM_ROYAL } from "../src/components/final-stage/final-stage-data.ts";

const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const paragraphs = (body) => body.map((text) => `<p>${escape(text)}</p>`).join("");
const articles = (items) =>
  items
    .map(
      (item) =>
        `<section><h4>${escape(item.title ?? item.name)}</h4>${paragraphs(item.body)}</section>`,
    )
    .join("");
const roles = ["武装生成・支援", "重攻撃型", "エネルギー制御型", "超高速機動型", "全機能同時運用"];
const oldRoles = ["王国宣言", "攻勢属性群", "深層属性群", "生成属性群", "終端属性群"];

// Project the canonical dossier into all three static cards and the comparison
// table. Keep the archive's IDs, artwork and CSS-only selection contract intact.
export function syncRealmRoyalProfile(html) {
  for (const [index, [key, form]] of Object.entries(REALM_ROYAL.forms).entries()) {
    const id = key === "royal" ? "royal" : `royal-${key}`;
    let count = 0;
    html = html.replace(/<article\b[^>]*>[\s\S]*?<\/article>/g, (card) => {
      if (!card.match(new RegExp(`id="realm--(?:saga-compare-[ab]-)?saga-detail-${id}"`)))
        return card;
      count++;
      const opening = card.slice(0, card.indexOf(">") + 1);
      const header = card.match(/<header\b[\s\S]*?<\/header>/)?.[0];
      const image = card.match(/<img\b[^>]*class="form-art"[^>]*>/)?.[0];
      if (!header || !image) throw new Error(`Incomplete Realm card: ${id}`);
      const voice = card.includes('class="realm-voice"')
        ? `<div class="realm-voice" role="group" aria-label="変身音声">${form.calls.map((call) => `<span>${escape(call)}</span>`).join("")}</div>`
        : "";
      const specs = form.specs
        .map(
          ({ dt, dd }) =>
            `<div class="spec-item"><span class="text-muted">${escape(dt)}</span><strong class="spec-value">${escape(dd)}</strong></div>`,
        )
        .join("");
      const intro = key === "royal" ? REALM_ROYAL.overview : form.body;
      const body =
        key === "royal"
          ? [...REALM_ROYAL.systems, ...REALM_ROYAL.computing, ...REALM_ROYAL.abilities]
          : REALM_ROYAL.abilities;
      return `${opening}${header}${voice}<div class="detail-overview">${image}<p class="detail-lead">${escape(intro[0])}</p>${paragraphs(intro.slice(1))}<div class="viz-grid">${specs}</div></div><div class="ability-layout"><div class="ability-panel realm-ability-panel">${articles(body)}<h4 class="realm-ability-heading realm-subhead">追加武装</h4>${articles(REALM_ROYAL.arsenal)}<h4 class="realm-ability-heading realm-subhead">必殺技</h4>${articles(REALM_ROYAL.finishers)}</div><aside class="realm-lore-grid operation-panel" aria-label="${escape(form.name)} 運用メモ">${articles(key === "royal" ? REALM_ROYAL.armor : [REALM_ROYAL.multiType])}</aside></div></article>`;
    });
    if (count !== 3) throw new Error(`Expected three Realm cards for ${id}, found ${count}`);
    const values = new Map(form.specs.map(({ dt, dd }) => [dt, dd]));
    const columns = [
      "身長",
      "体重",
      "パンチ力",
      "キック力",
      "ジャンプ力",
      "走力",
      "飛行速度",
      "演算",
      "EMP",
    ];
    const row = new RegExp(
      `(<tr data-form-id="${id}"><th[^>]*>[\\s\\S]*?<\\/th>)[\\s\\S]*?<\\/tr>`,
    );
    if (!row.test(html)) throw new Error(`Missing Realm comparison row: ${id}`);
    html = html.replace(
      row,
      (_, heading) =>
        heading +
        columns.map((name) => `<td>${escape(values.get(name) ?? "—")}</td>`).join("") +
        "</tr>",
    );
    html = html.replaceAll(oldRoles[index], roles[index]);
  }
  return html;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = new URL("../archives/realm-form-archive-standalone.html", import.meta.url);
  writeFileSync(file, syncRealmRoyalProfile(readFileSync(file, "utf8")));
  console.log("[realm-royal] synchronized 15 cards and 5 comparison rows");
}
