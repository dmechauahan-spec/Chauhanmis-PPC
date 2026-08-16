// Client Flow Part 1 (frontend) smoke test — run with:
//   npx tsx tests-visual/machines-and-order-fields.ts
//
// Covers:
//  1. Machines CRUD round-trip (create, verify row, edit status, delete).
//  2. Order create form's Special Requirements field (save + detail display).
//  3. Edit Special Requirements dialog (round-trip update).
//  4. Mobile-width overflow/overlap checks on /machines and /orders/new at
//     the same breakpoints mobile-audit.ts uses, reusing its utilities.
//
// Same login-via-UI convention as mobile-audit.ts/dashboard-overlap.ts.
import { chromium, type Page } from "playwright";
import { findHorizontalOverflow, formatOverflow } from "./checkOverflow.js";

const BASE_URL = "http://localhost:5173";
const BREAKPOINTS = [
  { name: "375", width: 375, height: 1200 },
  { name: "428", width: 428, height: 1200 },
  { name: "768", width: 768, height: 1200 },
  { name: "1280", width: 1280, height: 1000 },
];

const ADMIN = { email: "admin.smoke@test.local", password: "AdminSmoke@2026!" };

const MACHINE_ID = `M-QA-${Date.now().toString().slice(-6)}`;
const ORDER_ID = `SO-QA-${Date.now().toString().slice(-6)}`;

async function waitForCondition(fn: () => Promise<boolean>, timeoutMs = 8000, intervalMs = 200): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

let failures = 0;
function ok(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}`);
    failures++;
  }
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.getByRole("textbox", { name: /email/i }).fill(ADMIN.email);
  await page.getByRole("textbox", { name: /password/i }).fill(ADMIN.password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 });
}

async function checkMobileWidths(page: Page, path: string, label: string) {
  for (const bp of BREAKPOINTS) {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.goto(`${BASE_URL}${path}`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);

    const overflow = await findHorizontalOverflow(page);
    ok(`${label} @ ${bp.name}px — no horizontal overflow`, overflow.length === 0);
    if (overflow.length > 0) console.log(formatOverflow(overflow));

    // No sibling-overlap-prone widget (like the dashboard's GaugeDial) on
    // either of these pages, so checkNoOverlap.ts's findOverlaps isn't
    // applicable here — see its own doc comment: scoping it to "every
    // descendant" (e.g. "main *") produces nothing but expected
    // parent-contains-child false positives, not real sibling collisions.
  }
  // Reset to a normal desktop size for subsequent interaction steps.
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function testMachinesCrud(page: Page) {
  console.log("\n--- Machines CRUD round-trip ---");
  await page.goto(`${BASE_URL}/machines`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  ok("Machines nav/page reachable (heading visible)", await page.getByRole("heading", { name: "Machines" }).isVisible());

  // --- Create ---
  // Both the header's "New Machine" button AND the empty-state's own action
  // button render simultaneously when the list starts empty (same pattern
  // as Lines/HR Teams) — .first() picks the header one deliberately.
  await page.getByRole("button", { name: /new machine/i }).first().click();
  await page.getByLabel("Machine ID").fill(MACHINE_ID);
  await page.getByLabel("Machine Name").fill("QA Smoke Machine");
  await page.getByLabel("Line").click();
  await page.getByRole("option", { name: /Line 1/i }).click();
  await page.getByLabel("Per Hour").fill("120");
  await page.getByRole("button", { name: /add machine/i }).click();

  const row = page.locator("tr", { hasText: MACHINE_ID });
  ok("Created machine row appears", await waitForCondition(() => row.isVisible().catch(() => false)));
  ok("Row shows the selected line's name", ((await row.textContent()) ?? "").includes("Line 1"));
  ok("Row shows capacity labeled /hr", ((await row.textContent()) ?? "").includes("/hr"));
  ok("Row shows Active status badge", ((await row.textContent()) ?? "").includes("Active"));

  // --- Edit (status -> Maintenance) ---
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Status").click();
  await page.getByRole("option", { name: "Maintenance" }).click();
  await page.getByRole("button", { name: /save changes/i }).click();

  const rowAfterEdit = page.locator("tr", { hasText: MACHINE_ID });
  ok(
    "Row shows updated Maintenance status badge",
    await waitForCondition(async () => ((await rowAfterEdit.textContent().catch(() => "")) ?? "").includes("Maintenance")),
  );

  // --- Delete ---
  await rowAfterEdit.getByRole("button", { name: `Delete ${MACHINE_ID}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  ok(
    "Row is gone after delete",
    await waitForCondition(async () => (await page.locator("tr", { hasText: MACHINE_ID }).count()) === 0),
  );
}

async function testOrderSpecialRequirements(page: Page) {
  console.log("\n--- Order Special Requirements: save + display + edit round-trip ---");
  await page.goto(`${BASE_URL}/orders/new`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  ok("Special Requirements field present on create form", await page.getByLabel(/special requirements/i).isVisible());

  await page.getByLabel("Order ID").fill(ORDER_ID);
  await page.getByLabel("Client").fill("QA Smoke Client");
  // The trigger's computed ARIA role is "combobox" (set explicitly via the
  // `role` prop on shadcn's Button in sku-combobox.tsx) — but so is the
  // Priority <Select>'s trigger just below it, so `role="combobox"` alone
  // is ambiguous. Its placeholder text is unique on the page.
  await page.getByText("Select a SKU…").click();
  await page.getByPlaceholder(/search sku or model/i).fill("AF20X");
  // AF20X's sku and modelName happen to be the same string, so both the
  // sku span and the modelName span match "AF20X" — .first() (the sku span,
  // which appears first in CommandItem's markup) is what we want.
  await page.getByText("AF20X", { exact: true }).first().click();
  await page.getByLabel("Quantity").fill("5");
  await page.getByLabel(/special requirements/i).fill("QA smoke test — ship fragile, handle with care");
  await page.getByRole("button", { name: /create order/i }).click();
  await page.waitForURL(new RegExp(`/orders/${ORDER_ID}$`), { timeout: 10000 });

  ok(
    "Detail page shows the saved Special Requirements text",
    await waitForCondition(() =>
      page.getByText("QA smoke test — ship fragile, handle with care").isVisible().catch(() => false),
    ),
  );

  // --- Edit round-trip ---
  // The dialog itself is titled "Special Requirements" too (aria-labelledby
  // the DialogTitle), so getByLabel matches both the dialog region and the
  // textarea — getByRole("textbox", ...) is unambiguous.
  await page.getByRole("button", { name: "Edit" }).click();
  const textarea = page.getByRole("textbox", { name: "Special Requirements" });
  await textarea.fill("Updated: double-box for export");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  ok(
    "Detail page reflects the edited text",
    await waitForCondition(() => page.getByText("Updated: double-box for export").isVisible().catch(() => false)),
  );
  ok(
    "Old text no longer shown",
    await waitForCondition(
      async () => (await page.getByText("QA smoke test — ship fragile, handle with care").count()) === 0,
    ),
  );

  // --- Cleanup: delete the test order (still Open, so deletable) ---
  await page.getByRole("button", { name: /delete/i }).first().click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForURL(`${BASE_URL}/orders`, { timeout: 10000 }).catch(() => {});
}

async function main() {
  console.log("launching browser...");
  const browser = await chromium.launch();
  console.log("browser launched");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  console.log("page created, logging in...");

  await loginAsAdmin(page);
  console.log("logged in");

  await testMachinesCrud(page);
  await testOrderSpecialRequirements(page);

  console.log("\n--- Mobile-width checks ---");
  await checkMobileWidths(page, "/machines", "Machines");
  await checkMobileWidths(page, "/orders/new", "Orders — create (with Special Requirements)");

  await ctx.close();
  await browser.close();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("ERROR running smoke test:", err);
  process.exitCode = 1;
});
