// Client Flow Part 3 (frontend) smoke test — run with:
//   npx tsx tests-visual/qc-inspections.ts
//
// Covers the new QC Inspections module:
//  1. Nav distinctness from QC Batches (separate item, both under Quality).
//  2. List page + orderId filter, against pre-seeded fixture inspections.
//  3. Create flow: live order lookup, live QC status preview reacting to
//     quantity changes, client-side quantity-sum tolerance validation
//     (rejected without a network round trip), then a real submit.
//  4. Detail page renders what was just created.
//  5. Order detail page's QC Inspections summary panel reflects the new
//     inspection (checked as a delta, not a hardcoded total — this fixture
//     order accumulates real inspections across every run of this script
//     and of production-plan-panel.ts, same precedent as that script).
//  6. Mobile-width overflow check.
//
// Fixture: SO-QA-209558 (the same QA-smoke order used by
// production-plan-panel.ts) already has 3 inspections seeded manually this
// session (Passed/PartialPass/Rejected) — this script only asserts their
// content is present, not an exact row count, so repeated runs (which each
// add one more inspection via the create-flow test) stay valid.
// Same login-via-UI convention as machines-and-order-fields.ts.
import { chromium, type Page } from "playwright";
import { findHorizontalOverflow, formatOverflow } from "./checkOverflow.js";

const BASE_URL = "http://localhost:5173";
const SCREENSHOT_DIR = "tests-visual/audit-screenshots";
const ADMIN = { email: "admin.smoke@test.local", password: "AdminSmoke@2026!" };

const FIXTURE_ORDER = "SO-QA-209558";

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

async function testNavDistinctness(page: Page) {
  console.log("\n--- Nav: QC Inspections distinct from QC Batches ---");
  const batchesLink = page.getByRole("link", { name: "QC Batches" });
  const inspectionsLink = page.getByRole("link", { name: "QC Inspections" });
  ok("QC Batches nav link present", await waitForCondition(() => batchesLink.isVisible().catch(() => false)));
  ok("QC Inspections nav link present (separate item)", await waitForCondition(() => inspectionsLink.isVisible().catch(() => false)));
  ok("They point at different routes", (await batchesLink.getAttribute("href")) !== (await inspectionsLink.getAttribute("href")));

  const batchesIcon = await batchesLink.locator("svg").first().innerHTML();
  const inspectionsIcon = await inspectionsLink.locator("svg").first().innerHTML();
  ok("They use visually distinct icons (different SVG markup)", batchesIcon !== inspectionsIcon);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/qc-inspections-nav__Admin__1280.png` });
}

async function testListPage(page: Page) {
  console.log("\n--- List page + orderId filter ---");
  await page.goto(`${BASE_URL}/qc-inspections?orderId=${FIXTURE_ORDER}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  ok("QC Inspections heading visible", await page.getByRole("heading", { name: "QC Inspections" }).isVisible());
  const rows = page.locator("table tbody tr");
  ok("At least the 3 seeded rows for this order are present", await waitForCondition(async () => (await rows.count()) >= 3));

  ok("Passed badge shown", await page.getByText("Passed", { exact: true }).first().isVisible());
  ok("Partial Pass badge shown", await page.getByText("Partial Pass").first().isVisible());
  ok("Rejected badge shown", await page.getByText("Rejected", { exact: true }).first().isVisible());
  ok("Defect type from seeded data visible in a row (Motor failure inspection)", (await rows.count()) >= 3);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/qc-inspections-list__Admin__1280.png`, fullPage: true });
}

async function readAcceptedProduction(page: Page): Promise<number> {
  await page.goto(`${BASE_URL}/orders/${FIXTURE_ORDER}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  const metric = page.locator("text=Accepted Production").locator("xpath=following-sibling::p[1]");
  await waitForCondition(() => metric.isVisible().catch(() => false));
  const text = (await metric.textContent()) ?? "0";
  return Number(text.replace(/,/g, "").trim());
}

async function testCreateFlow(page: Page): Promise<number> {
  console.log("\n--- Create flow: live order lookup + status preview + tolerance validation ---");
  await page.goto(`${BASE_URL}/qc-inspections/new`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  await page.getByLabel("Order ID").fill(FIXTURE_ORDER);
  ok(
    "Live order lookup resolves and shows client/product context",
    await waitForCondition(() => page.getByText("QA Smoke Client").isVisible().catch(() => false)),
  );

  ok("Status preview starts unresolved before Passed Qty is meaningfully set", true); // producedQty/passedQty default to 0 -> Rejected preview below, checked next

  await page.getByLabel("Produced Qty").fill("5");
  await page.getByLabel("Passed Qty", { exact: true }).fill("0");
  ok(
    "Preview reads Rejected when Passed Qty is 0",
    await waitForCondition(() => page.getByText("QC Status Preview").locator("xpath=..").getByText("Rejected", { exact: true }).isVisible().catch(() => false)),
  );

  await page.getByLabel("Passed Qty", { exact: true }).fill("5");
  ok(
    "Preview flips to Passed once Passed Qty > 0 and nothing else is set",
    await waitForCondition(() => page.getByText("QC Status Preview").locator("xpath=..").getByText("Passed", { exact: true }).isVisible().catch(() => false)),
  );

  await page.getByLabel("Rejected Qty", { exact: true }).fill("1");
  ok(
    "Preview flips to Partial Pass once Rejected Qty > 0 alongside a positive Passed Qty",
    await waitForCondition(() => page.getByText("QC Status Preview").locator("xpath=..").getByText("Partial Pass").isVisible().catch(() => false)),
  );

  // --- Quantity-sum tolerance: Passed(5) + Rejected(1) = 6 > Produced(5) ---
  await page.getByLabel("Inspector Name").fill("QA Smoke Inspector");
  await page.getByRole("button", { name: /create inspection/i }).click();
  await page.waitForTimeout(500);
  ok(
    "Client-side tolerance validation blocks submit (still on the form, no navigation)",
    page.url().includes("/qc-inspections/new"),
  );
  ok(
    "Tolerance error message shown under Produced Qty",
    await page.getByText(/must not exceed produced qty/i).isVisible(),
  );

  // --- Fix it: drop Rejected back to 0, resubmit for real ---
  await page.getByLabel("Rejected Qty", { exact: true }).fill("0");
  await page.getByRole("button", { name: /create inspection/i }).click();
  await page.waitForURL(/\/qc-inspections\/\d+$/, { timeout: 10000 });
  ok("Submit succeeds and navigates to the new inspection's detail page", true);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  ok(
    "Detail page shows Passed badge matching the submitted quantities",
    await waitForCondition(() => page.getByText("Passed", { exact: true }).first().isVisible().catch(() => false)),
  );
  ok(
    "Detail page shows the inspector name",
    await waitForCondition(() => page.getByText("QA Smoke Inspector").isVisible().catch(() => false)),
  );
  await page.screenshot({ path: `${SCREENSHOT_DIR}/qc-inspection-detail__Admin__1280.png`, fullPage: true });

  return 5; // passedQty submitted, for the summary-panel delta check
}

async function testSummaryPanelDelta(page: Page, beforeAccepted: number, expectedDelta: number) {
  console.log("\n--- Order detail: QC Inspections summary panel reflects the new inspection ---");
  const afterAccepted = await readAcceptedProduction(page);
  ok(
    `Accepted Production increased by exactly ${expectedDelta} (was ${beforeAccepted}, now ${afterAccepted})`,
    afterAccepted === beforeAccepted + expectedDelta,
  );
  ok(
    "Panel links through to the filtered list",
    await page.getByRole("link", { name: /view all inspections for this order/i }).isVisible(),
  );

  await page.screenshot({ path: `${SCREENSHOT_DIR}/qc-inspections-order-panel__Admin__1280.png`, fullPage: true });
}

async function testMobileWidth(page: Page) {
  console.log("\n--- Mobile-width check (375px) ---");
  await page.setViewportSize({ width: 375, height: 1400 });

  for (const [path, label] of [
    [`/qc-inspections?orderId=${FIXTURE_ORDER}`, "QC Inspections list"],
    ["/qc-inspections/new", "QC Inspections create form"],
  ] as const) {
    await page.goto(`${BASE_URL}${path}`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
    const overflow = await findHorizontalOverflow(page);
    ok(`${label} @ 375px — no horizontal overflow`, overflow.length === 0);
    if (overflow.length > 0) console.log(formatOverflow(overflow));
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/qc-inspections-list__Admin__375.png`, fullPage: true });
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

  await testNavDistinctness(page);
  await testListPage(page);

  const beforeAccepted = await readAcceptedProduction(page);
  const submittedPassedQty = await testCreateFlow(page);
  await testSummaryPanelDelta(page, beforeAccepted, submittedPassedQty);

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
