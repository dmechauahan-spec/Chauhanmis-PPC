import type { Page } from "playwright";

export interface OverflowResult {
  selector: string;
  scrollWidth: number;
  clientWidth: number;
  overflowPx: number;
}

/**
 * Geometric horizontal-overflow check — scrollWidth vs. clientWidth on
 * `document.documentElement` (catches the page as a whole growing wider
 * than the viewport — the #1 mobile failure mode: a fixed-width element
 * forcing a horizontal scrollbar) plus any extra selectors passed in
 * (e.g. a specific card or table wrapper you want to confirm scrolls
 * internally rather than blowing out the page).
 *
 * A small tolerance (2px) absorbs sub-pixel rounding, same reasoning as
 * checkNoOverlap.ts's TOLERANCE_PX.
 */
export async function findHorizontalOverflow(page: Page, extraSelectors: string[] = []): Promise<OverflowResult[]> {
  const results: OverflowResult[] = [];

  const docResult = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  if (docResult.scrollWidth - docResult.clientWidth > 2) {
    results.push({ selector: "document", ...docResult, overflowPx: docResult.scrollWidth - docResult.clientWidth });
  }

  for (const selector of extraSelectors) {
    const el = page.locator(selector).first();
    if ((await el.count()) === 0) continue;
    const box = await el.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }));
    if (box.scrollWidth - box.clientWidth > 2) {
      results.push({ selector, ...box, overflowPx: box.scrollWidth - box.clientWidth });
    }
  }

  return results;
}

export function formatOverflow(results: OverflowResult[]): string {
  return results
    .map((r) => `  ${r.selector}: scrollWidth ${r.scrollWidth} > clientWidth ${r.clientWidth} (+${r.overflowPx}px)`)
    .join("\n");
}
