import type { Page } from "playwright";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlapItem {
  index: number;
  /** `data-gauge`/`data-testid` value if present, else a text-content snippet, else `#<index>`. */
  label: string;
  rect: Rect;
}

export interface OverlapViolation {
  a: OverlapItem;
  b: OverlapItem;
  overlapAreaPx: number;
}

// Sub-pixel tolerance — browsers routinely produce fractional layout values
// (e.g. two adjacent grid cells at x=99.7 and x=99.4), which would register
// as a "0.3px overlap" despite being visually and semantically flush, not
// overlapping. 1px is generous enough to absorb that without hiding a real
// collision.
const TOLERANCE_PX = 1;

function rectsOverlap(a: Rect, b: Rect): number {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (overlapX <= TOLERANCE_PX || overlapY <= TOLERANCE_PX) return 0;
  return overlapX * overlapY;
}

/**
 * Geometric sibling-overlap check — not a visual/screenshot diff, a real
 * getBoundingClientRect()-based assertion. Finds every pair of elements
 * matching `selector` on the current page whose rendered boxes intersect by
 * more than a sub-pixel tolerance.
 *
 * Elements that are legitimately absolutely-positioned overlays (tooltips,
 * dropdowns, modals) will register as "overlapping" their trigger by
 * design — scope `selector` to the specific row/grid/group you actually
 * want checked (e.g. `[data-gauge]`, or `${containerSelector} > *` via
 * checkContainerChildren below) rather than the whole page, so this stays a
 * check for accidental layout collisions, not a ban on all overlays.
 */
export async function findOverlaps(page: Page, selector: string): Promise<OverlapViolation[]> {
  const locator = page.locator(selector);
  const count = await locator.count();

  const items: OverlapItem[] = [];
  for (let i = 0; i < count; i++) {
    const el = locator.nth(i);
    const box = await el.boundingBox();
    // boundingBox() returns null for display:none / detached elements —
    // nothing rendered, nothing that can overlap.
    if (!box || box.width === 0 || box.height === 0) continue;

    const label =
      (await el.getAttribute("data-gauge")) ??
      (await el.getAttribute("data-testid")) ??
      (await el.textContent())?.trim().slice(0, 40) ??
      `#${i}`;

    items.push({ index: i, label, rect: box });
  }

  const violations: OverlapViolation[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const overlapAreaPx = rectsOverlap(items[i].rect, items[j].rect);
      if (overlapAreaPx > 0) {
        violations.push({ a: items[i], b: items[j], overlapAreaPx });
      }
    }
  }
  return violations;
}

/** Convenience wrapper for the "direct children of a container" mode from the spec. */
export async function findOverlapsInContainer(page: Page, containerSelector: string): Promise<OverlapViolation[]> {
  return findOverlaps(page, `${containerSelector} > *`);
}

export function formatViolations(violations: OverlapViolation[], context: string): string {
  const lines = violations.map(
    (v) =>
      `  "${v.a.label}" (${Math.round(v.a.rect.x)},${Math.round(v.a.rect.y)} ${Math.round(v.a.rect.width)}x${Math.round(v.a.rect.height)}) overlaps ` +
      `"${v.b.label}" (${Math.round(v.b.rect.x)},${Math.round(v.b.rect.y)} ${Math.round(v.b.rect.width)}x${Math.round(v.b.rect.height)}) — ${Math.round(v.overlapAreaPx)}px²`,
  );
  return `Overlap detected (${context}):\n${lines.join("\n")}`;
}

/** Throws with a readable message (element labels + rects) if any violation is found. */
export async function assertNoOverlap(page: Page, selector: string, context: string): Promise<void> {
  const violations = await findOverlaps(page, selector);
  if (violations.length > 0) {
    throw new Error(formatViolations(violations, context));
  }
}
