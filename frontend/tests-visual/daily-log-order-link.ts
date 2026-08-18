// Gap-fill smoke test — run with:
//   npx tsx tests-visual/daily-log-order-link.ts
//
// Client Flow Part 1 added orderId/rejectedQty/reworkQty to
// daily_production_log, but the frontend built for that part only wired up
// Machines + Order Special Requirements — the Daily Log form/detail/list
// never got these three fields. Discovered while writing Part 5's final
// summary (every later part's Actual/QC/dashboard math depends on daily
// logs actually being linked to orders, which no real user could do
// through the UI until now). Covers the fix: create-form fields incl. live
// order lookup, detail page display, list page Order column, edit-form
// prefill.
// Same login-via-UI convention as machines-and-order-fields.ts.
import { chromium, type Page } from "playwright";

const BASE_URL = "http://localhost:5173";
const ADMIN = { email: "admin.smoke@test.local", password: "AdminSmoke@2026!" };
const FIXTURE_ORDER = "SO-QA-53919C"; // On Track, no daily logs yet (from order-status-dashboard.ts's fixtures)

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

async function main() {
  console.log("launching browser...");
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  await loginAsAdmin(page);
  console.log("logged in");

  console.log("\n--- Create form: Order lookup + Rejected/Rework Qty ---");
  await page.goto(`${BASE_URL}/daily-logs/new`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  ok("Order field present on create form", await page.getByLabel(/order \(optional\)/i).isVisible());
  await page.getByLabel(/order \(optional\)/i).fill(FIXTURE_ORDER);
  ok(
    "Live order lookup resolves and shows client context",
    await waitForCondition(() => page.getByText("QA Smoke Client C").isVisible().catch(() => false)),
  );

  await page.getByLabel("Total Output Qty").fill("10");
  await page.getByLabel("Good Qty").fill("8");
  await page.getByLabel(/rejected qty/i).fill("1");
  await page.getByLabel(/rework qty/i).fill("1");
  await page.getByRole("button", { name: /create entry/i }).click();
  await page.waitForURL(/\/daily-logs\/DL-/, { timeout: 10000 });

  console.log("\n--- Detail page reflects the link + self-reported figures ---");
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  ok(
    "Detail page links to the order",
    await waitForCondition(() => page.getByRole("link", { name: FIXTURE_ORDER }).isVisible().catch(() => false)),
  );
  ok("Rejected Qty shown", await page.getByText("Rejected Qty").isVisible());
  ok("Rework Qty shown", await page.getByText("Rework Qty").isVisible());

  const logUrl = page.url();
  const logId = logUrl.split("/").pop();

  console.log("\n--- List page shows the Order column ---");
  await page.goto(`${BASE_URL}/daily-logs`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  ok("Order column header present", await page.getByRole("columnheader", { name: "Order" }).isVisible());
  // The table never renders the raw logId as visible text (only the
  // formatted date/order/etc.) — locate by the order link itself instead.
  ok(
    "New log's row links to the fixture order",
    await waitForCondition(() => page.getByRole("link", { name: FIXTURE_ORDER }).first().isVisible().catch(() => false)),
  );

  console.log("\n--- Edit form prefills the order + qty fields ---");
  await page.goto(`${BASE_URL}/daily-logs/${logId}/edit`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  ok("Order field prefilled", (await page.getByLabel(/order \(optional\)/i).inputValue()) === FIXTURE_ORDER);
  ok("Rejected Qty prefilled", (await page.getByLabel(/rejected qty/i).inputValue()) === "1");
  ok("Rework Qty prefilled", (await page.getByLabel(/rework qty/i).inputValue()) === "1");

  await ctx.close();
  await browser.close();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("ERROR running smoke test:", err);
  process.exitCode = 1;
});
