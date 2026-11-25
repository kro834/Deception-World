// The side menu is an orbital dial (2026-11-23, owner: 「m1 d1で。」): a row
// is in the layout once its region's planet stands at the focus point. A
// browser check that clicks or measures a menu row first turns the dial to
// the row's region, as a reader would.
const REGION_OF_GROUP = { rikuei: "riders", related: "riders", unmanaged: "riders" };

/** Turn the open menu to the region that holds the first row matching
 * `selector` (a CSS selector, searched inside the side panel). */
export async function showMenuRow(page, selector) {
  await page.locator('#site-side-panel[data-open="true"]').waitFor({ state: "visible" });
  await page.waitForFunction(
    (target) => Boolean(document.querySelector(`#site-side-panel ${target}`)),
    selector.replace(/^\.side-panel\s+/, ""),
  );
  await page.evaluate(
    ({ target, regions }) => {
      const row = document.querySelector(`#site-side-panel ${target}`);
      const group = row?.closest("[data-atlas-group]")?.getAttribute("data-atlas-group");
      if (!group) return;
      document.getElementById(`command-atlas-tab-${regions[group] ?? group}`)?.click();
    },
    { target: selector.replace(/^\.side-panel\s+/, ""), regions: REGION_OF_GROUP },
  );
  await page.waitForFunction(
    (target) => {
      const row = document.querySelector(`#site-side-panel ${target}`);
      return Boolean(row && row.getClientRects().length > 0);
    },
    selector.replace(/^\.side-panel\s+/, ""),
  );
}
