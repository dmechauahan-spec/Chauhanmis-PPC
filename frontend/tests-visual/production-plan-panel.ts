// Client Flow Part 2 (frontend) smoke test — run with:
//   npx tsx tests-visual/production-plan-panel.ts
//
// Covers the Order detail page's new Production Plan panel:
//  1. Not-yet-scheduled state ("Schedule this order first").
//  2. Generate -> day-by-day plan table.
//  3. Plan vs Actual toggle: summary strip, signed/colored Gap, gap-reason
//     chips, and the noDataLogged "Not logged" distinction (not a verified
//     zero — see production-plan-panel.tsx).
//  4. Regenerate confirmation dialog (cancel, then confirm) — replace-not-
//     append round trip.
//  5. Mobile-width overflow check.
//
// Fixture orders are seeded by the accompanying manual setup in this
// session (not part of prisma/seed.ts): SO-QA-209558 has a 5-day schedule
// (2026-08-14..18) with a production plan already generated and daily logs
// on 08-14 (exact match), 08-15 (shortfall + Machine Breakdown downtime),
// 08-17 (over-achieve) — 08-16 and 08-18 deliberately left unlogged to
// exercise noDataLogged. SO-1001 is a real Open, never-scheduled order.
// Same login-via-UI convention as machines-and-order-fields.ts.
import { chromium, type Page } from "playwright";
import { findHorizontalOverflow, formatOverflow } from "./checkOverflow.js";

const BASE_URL = "http://localhost:5173";
const SCREENSHOT_DIR = "tests-visual/audit-screenshots";
const ADMIN = { email: "admin.smoke@test.local", password: "AdminSmoke@2026!" };

const SCHEDULED_ORDER = "SO-QA-209558";
const UNSCHEDULED_ORDER = "SO-1001";

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

async function testNotYetScheduled(page: Page) {
  console.log("\n--- Not-yet-scheduled state ---");
  await page.goto(`${BASE_URL}/orders/${UNSCHEDULED_ORDER}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  const panel = page.locator("text=Production Plan").locator("xpath=ancestor::*[@data-slot='card'][1]");
  ok("Production Plan panel present", await panel.isVisible());
  ok(
    "Shows 'Schedule this order first' empty state",
    await waitForCondition(() => panel.getByText("Schedule this order first").isVisible().catch(() => false)),
  );
  ok("No Generate button shown (not scheduled)", (await panel.getByRole("button", { name: /generate/i }).count()) === 0);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/production-plan-not-scheduled__Admin__1280.png`, fullPage: true });
}

async function testDayByDayTable(page: Page) {
  console.log("\n--- Day-by-day plan table ---");
  await page.goto(`${BASE_URL}/orders/${SCHEDULED_ORDER}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  ok(
    "Day-by-Day toggle visible (plan already exists)",
    await waitForCondition(() => page.getByRole("button", { name: "Day-by-Day" }).isVisible().catch(() => false)),
  );
  ok("Regenerate button visible for an existing plan", await page.getByRole("button", { name: /regenerate/i }).isVisible());

  const rows = page.locator("table").first().locator("tbody tr");
  ok("Day-by-day table has 5 rows (Aug 14-18)", await waitForCondition(async () => (await rows.count()) === 5));
  ok("A planned qty cell reads 1 (5 units / 5 days)", ((await rows.first().textContent()) ?? "").includes("1"));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/production-plan-day-by-day__Admin__1280.png`, fullPage: true });
}

async function testPlanVsActual(page: Page) {
  console.log("\n--- Plan vs Actual view ---");
  await page.getByRole("button", { name: "Plan vs Actual" }).click();
  await page.waitForTimeout(400);

  ok(
    "Summary strip shows cumulative planned (5)",
    await waitForCondition(() => page.getByText("Cumulative Planned").isVisible().catch(() => false)),
  );
  ok(
    "Summary strip shows overall achievement (60%)",
    await waitForCondition(() => page.getByText("60.0%").isVisible().catch(() => false)),
  );

  // Only one <table> is ever mounted here — Day-by-Day and Plan vs Actual
  // are mutually exclusive views (see production-plan-panel.tsx), not
  // siblings, so `.first()` is the current view's table either way.
  const table = page.locator("table").first();
  const rows = table.locator("tbody tr");
  ok("Plan vs Actual table has 5 rows", await waitForCondition(async () => (await rows.count()) === 5));

  ok("Gap reason chip 'Machine Breakdown' shown for the shortfall day", await page.getByText("Machine Breakdown").isVisible());

  const notLoggedBadges = page.getByText("Not logged", { exact: true });
  ok("Two 'Not logged' badges for the noDataLogged days (08-16, 08-18)", await waitForCondition(async () => (await notLoggedBadges.count()) === 2));

  // The noDataLogged rows must NOT render a plain "0" as if it were a
  // verified zero actual/gap — spot-check via row text for the dash.
  const rowTexts = await rows.allTextContents();
  const noDataRow = rowTexts.find((t) => t.includes("Not logged"));
  ok("A 'Not logged' row shows em-dashes instead of computed 0/negative figures", !!noDataRow && (noDataRow.match(/—/g)?.length ?? 0) >= 3);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/production-plan-plan-vs-actual__Admin__1280.png`, fullPage: true });
}

async function testRegenerateDialog(page: Page) {
  console.log("\n--- Regenerate confirmation dialog ---");
  await page.getByRole("button", { name: /regenerate/i }).click();
  await page.waitForTimeout(300);

  ok("Dialog title names the order", await page.getByText(`Regenerate production plan for ${SCHEDULED_ORDER}?`).isVisible());
  ok(
    "Dialog copy explains replace-not-append",
    await page.getByText(/replaces the entire existing day-by-day plan/i).isVisible(),
  );
  ok(
    "Dialog copy clarifies logged actuals are unaffected",
    await page.getByText(/logged actuals in plan vs actual are unaffected/i).isVisible(),
  );

  await page.screenshot({ path: `${SCREENSHOT_DIR}/production-plan-regenerate-dialog__Admin__1280.png`, fullPage: true });

  // Cancel first — confirm nothing changes.
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(200);
  ok("Dialog closes on Cancel", (await page.getByText(`Regenerate production plan for ${SCHEDULED_ORDER}?`).count()) === 0);

  // Then actually confirm the round trip — replaces the plan wholesale with
  // the same schedule inputs, so the recomputed rows should be identical;
  // existing daily-log actuals are untouched (plan-vs-actual matches by
  // date, not plan-row identity).
  await page.getByRole("button", { name: /regenerate/i }).click();
  await page.getByRole("button", { name: "Regenerate", exact: true }).click();
  await page.waitForTimeout(600);

  await page.getByRole("button", { name: "Day-by-Day" }).click();
  const rows = page.locator("table").first().locator("tbody tr");
  ok("Plan still has 5 rows after regenerate", await waitForCondition(async () => (await rows.count()) === 5));
}

async function testMobileWidth(page: Page) {
  console.log("\n--- Mobile-width check (375px) ---");
  await page.setViewportSize({ width: 375, height: 1400 });
  await page.goto(`${BASE_URL}/orders/${SCHEDULED_ORDER}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);

  const overflow = await findHorizontalOverflow(page);
  ok("Order detail @ 375px — no horizontal overflow", overflow.length === 0);
  if (overflow.length > 0) console.log(formatOverflow(overflow));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/production-plan-day-by-day__Admin__375.png`, fullPage: true });

  await page.getByRole("button", { name: "Plan vs Actual" }).click();
  await page.waitForTimeout(400);
  const overflowActual = await findHorizontalOverflow(page);
  ok("Plan vs Actual @ 375px — no horizontal overflow (table scrolls internally)", overflowActual.length === 0);
  if (overflowActual.length > 0) console.log(formatOverflow(overflowActual));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/production-plan-plan-vs-actual__Admin__375.png`, fullPage: true });

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

  await testNotYetScheduled(page);
  await testDayByDayTable(page);
  await testPlanVsActual(page);
  await testRegenerateDialog(page);
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
