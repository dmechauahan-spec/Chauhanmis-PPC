// Client Flow Part 5 (frontend) smoke test — run with:
//   npx tsx tests-visual/order-status-dashboard.ts
//
// Covers the new Unified Order Status Dashboard (/order-status-dashboard):
//  1. Nav item present near the top (Overview group), distinct from the
//     main Dashboard.
//  2. Table renders with all 5 status badge states, each a distinct
//     color+icon+label combination (never color alone) — At Risk/Delayed
//     deliberately share the `critical` color per the app's own established
//     amber-avoidance precedent (see dashboard-status-badge.tsx), so this
//     specifically checks icon+label differ between those two, not just
//     that "some critical badge" exists.
//  3. Filters (status, priority, line) narrow the table client-side.
//  4. Empty state when filters match nothing.
//  5. Row click navigates to Order detail.
//  6. Mobile width — wide table scrolls horizontally inside its own
//     container, not the page body; badges stay legible.
//
// Fixture orders (created via direct API calls ahead of this script, since
// several of the 5 states depend on real scheduling-engine/QC-forecast
// math that isn't worth re-deriving through the UI just to seed data):
//   SO-QA-53919A — production logged, no QC yet -> QC Pending
//   SO-QA-53919B — due today, queued behind other orders -> At Risk
//   SO-QA-53919C — freshly scheduled, no activity -> On Track
//   SO-QA-53919D — due today, slow accepted-production rate -> Delayed
//   sku-007      — advanced to DispatchReady -> Completed
// Same login-via-UI convention as machines-and-order-fields.ts.
import { chromium, type Page } from "playwright";
import { findHorizontalOverflow, formatOverflow } from "./checkOverflow.js";

const BASE_URL = "http://localhost:5173";
const SCREENSHOT_DIR = "tests-visual/audit-screenshots";
const ADMIN = { email: "admin.smoke@test.local", password: "AdminSmoke@2026!" };

let failures = 0;
function ok(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}`);
    failures++;
  }
}

async function waitForCondition(fn: () => Promise<boolean>, timeoutMs = 8000, intervalMs = 200): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.getByRole("textbox", { name: /email/i }).fill(ADMIN.email);
  await page.getByRole("textbox", { name: /password/i }).fill(ADMIN.password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 });
}

async function testNavPlacement(page: Page) {
  console.log("\n--- Nav placement (Overview group, near the top) ---");
  const overviewGroup = page.getByText("Overview").locator("xpath=following-sibling::ul[1]");
  const link = overviewGroup.getByRole("link", { name: "Order Status" });
  ok("'Order Status' nav link present in the Overview group", await waitForCondition(() => link.isVisible().catch(() => false)));

  const dashboardLink = overviewGroup.getByRole("link", { name: "Dashboard", exact: true });
  ok("Sits alongside (not instead of) the main Dashboard link", await dashboardLink.isVisible());
}

async function testTableAndBadges(page: Page) {
  console.log("\n--- Table renders with all 5 status badge states ---");
  await page.getByRole("link", { name: "Order Status" }).click();
  await page.waitForURL(/\/order-status-dashboard$/, { timeout: 10000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  ok("Heading visible", await waitForCondition(() => page.getByRole("heading", { name: "Order Status Dashboard" }).isVisible().catch(() => false)));

  const rows = page.locator("table tbody tr");
  ok("Table has multiple order rows", await waitForCondition(async () => (await rows.count()) >= 5));

  const qcPendingRow = page.locator("tr", { hasText: "SO-QA-53919A" });
  const atRiskRow = page.locator("tr", { hasText: "SO-QA-53919B" });
  const onTrackRow = page.locator("tr", { hasText: "SO-QA-53919C" });
  const delayedRow = page.locator("tr", { hasText: "SO-QA-53919D" });
  const completedRow = page.locator("tr", { hasText: "sku-007" });

  ok("QC Pending badge on the production-logged/no-QC order", await qcPendingRow.getByText("QC Pending").isVisible());
  ok("At Risk badge on the due-today/queued-behind order", await atRiskRow.getByText("At Risk").isVisible());
  ok("On Track badge on the untouched freshly-scheduled order", await onTrackRow.getByText("On Track").isVisible());
  ok("Delayed badge on the slow-accepted-rate order", await delayedRow.getByText("Delayed").isVisible());
  ok("Completed badge on the DispatchReady order", await completedRow.getByText("Completed").isVisible());

  // At Risk and Delayed intentionally share the `critical` color (see
  // dashboard-status-badge.tsx) — confirm they're still visually
  // distinguishable via icon, not just relying on the label text.
  const atRiskIconHtml = await atRiskRow.locator("svg").first().innerHTML();
  const delayedIconHtml = await delayedRow.locator("svg").first().innerHTML();
  ok("At Risk and Delayed use different icons despite sharing a color", atRiskIconHtml !== delayedIconHtml);

  // On Track and Completed share the `success` color too — same check.
  const onTrackIconHtml = await onTrackRow.locator("svg").first().innerHTML();
  const completedIconHtml = await completedRow.locator("svg").first().innerHTML();
  ok("On Track and Completed use different icons despite sharing a color", onTrackIconHtml !== completedIconHtml);

  // QC cluster + Line/Machine honesty checks.
  ok("QC Pending row's Line shows the real assigned line (Line 1)", (await qcPendingRow.textContent())?.includes("Line 1") ?? false);
  ok("Completed row (no real schedule row) shows '—' for Line, not a crash", (await completedRow.textContent())?.includes("—") ?? false);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/order-status-dashboard__Admin__1280.png`, fullPage: true });
}

async function testFilters(page: Page) {
  console.log("\n--- Filters ---");
  // Status filter.
  await page.getByRole("combobox", { name: /status/i }).click();
  await page.getByRole("option", { name: "Delayed", exact: true }).click();
  await page.waitForTimeout(300);
  let rows = page.locator("table tbody tr");
  ok("Status filter narrows to only Delayed rows", await waitForCondition(async () => (await rows.count()) === 1));
  ok("The one row left is SO-QA-53919D", (await rows.first().textContent())?.includes("SO-QA-53919D") ?? false);

  await page.getByRole("button", { name: /clear filters/i }).click();
  await page.waitForTimeout(300);
  rows = page.locator("table tbody tr");
  ok("Clearing filters restores every row", await waitForCondition(async () => (await rows.count()) >= 5));

  // Priority filter.
  await page.getByRole("combobox", { name: /priority/i }).click();
  await page.getByRole("option", { name: "High", exact: true }).click();
  await page.waitForTimeout(300);
  rows = page.locator("table tbody tr");
  const priorityFilteredCount = await rows.count();
  ok("Priority filter narrows the table", priorityFilteredCount >= 1 && priorityFilteredCount < 5);
  await page.getByRole("button", { name: /clear filters/i }).click();
  await page.waitForTimeout(300);

  // Line filter.
  await page.getByRole("combobox", { name: /^line$/i }).click();
  await page.getByRole("option", { name: "Line 1 – Hybrid" }).click();
  await page.waitForTimeout(300);
  rows = page.locator("table tbody tr");
  ok("Line filter narrows to only Line 1 orders", await waitForCondition(async () => (await rows.count()) >= 1));
  const lineRowTexts = await rows.allTextContents();
  ok("Every remaining row is actually on Line 1", lineRowTexts.every((t) => t.includes("Line 1")));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/order-status-dashboard-filtered__Admin__1280.png`, fullPage: true });

  // Empty state: an impossible combination (Low priority + Line 1 + At Risk
  // — none of the fixtures satisfy all three at once).
  await page.getByRole("button", { name: /clear filters/i }).click();
  await page.waitForTimeout(300);
  await page.getByRole("combobox", { name: /status/i }).click();
  await page.getByRole("option", { name: "At Risk", exact: true }).click();
  await page.getByRole("combobox", { name: /priority/i }).click();
  await page.getByRole("option", { name: "Low", exact: true }).click();
  await page.waitForTimeout(300);
  ok(
    "Empty state shown for a filter combination matching nothing",
    await waitForCondition(() => page.getByText("No active orders match these filters").isVisible().catch(() => false)),
  );
  await page.screenshot({ path: `${SCREENSHOT_DIR}/order-status-dashboard-empty__Admin__1280.png`, fullPage: true });

  // Two "Clear filters" buttons are legitimately on screen at once here —
  // the toolbar's own (always shown while any filter is active) and the
  // empty state's action button — .first() picks the toolbar one.
  await page.getByRole("button", { name: /clear filters/i }).first().click();
  await page.waitForTimeout(300);
}

async function testRowClickNavigatesToOrder(page: Page) {
  console.log("\n--- Row click -> Order detail ---");
  await page.locator("tr", { hasText: "SO-QA-53919A" }).click();
  ok(
    "Clicking a row navigates to that order's detail page",
    await waitForCondition(async () => page.url().endsWith("/orders/SO-QA-53919A")),
  );
  await page.goBack();
  await page.waitForURL(/\/order-status-dashboard$/, { timeout: 10000 });
}

async function testMobileWidth(page: Page) {
  console.log("\n--- Mobile-width check (375px) ---");
  await page.setViewportSize({ width: 375, height: 1400 });
  await page.goto(`${BASE_URL}/order-status-dashboard`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);

  // The page body itself must not overflow horizontally — the wide table
  // should scroll inside its own bordered container (Table's built-in
  // overflow-auto wrapper), same convention as every other dense table.
  const overflow = await findHorizontalOverflow(page);
  ok("Order Status Dashboard @ 375px — no page-level horizontal overflow", overflow.length === 0);
  if (overflow.length > 0) console.log(formatOverflow(overflow));

  const tableContainer = page.locator("[data-slot='table-container']");
  const isScrollable = await tableContainer.evaluate((el) => el.scrollWidth > el.clientWidth);
  ok("Table's own container scrolls horizontally instead", isScrollable);

  ok("A status badge is still visible/legible at 375px", await page.getByText("QC Pending").first().isVisible());

  await page.screenshot({ path: `${SCREENSHOT_DIR}/order-status-dashboard__Admin__375.png`, fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function main() {
  console.log("launching browser...");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  await loginAsAdmin(page);
  console.log("logged in");

  await testNavPlacement(page);
  await testTableAndBadges(page);
  await testFilters(page);
  await testRowClickNavigatesToOrder(page);
  await testMobileWidth(page);

  await ctx.close();
  await browser.close();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("ERROR running smoke test:", err);
  process.exitCode = 1;
});
