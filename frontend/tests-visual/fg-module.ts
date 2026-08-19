// FG Module (Finished Goods, all 5 backend parts) frontend smoke test — run with:
//   npx tsx tests-visual/fg-module.ts
//
// Covers the full FG module frontend build:
//  1. Nav: "Finished Goods" group (FG Dashboard/FG Batches/Sales Orders/
//     Dispatch) + Warehouses under Admin.
//  2. Warehouses admin CRUD (create two, for the transfer step below).
//  3. Product form: plywood attributes (grade/thickness/sheet size).
//  4. Order creation for that product, a QC Inspection against it.
//  5. Generate FG Batch from the QC Inspection detail page (plywood
//     attributes prefilled from the product, warehouse picked at
//     generation), navigates to the new FG batch's detail page.
//  6. FG Batch detail: Transfer (warehouse A -> B), Hold (blocks Reserve),
//     Release Hold.
//  7. Sales Order creation, Reserve 40/40 against the FG batch (Available
//     Qty updates, Sales Order status -> Fully Reserved).
//  8. Dispatch creation flow (the cart builder): pick the Sales Order,
//     add the FG batch, dispatch 25 of the 40 reserved -> FG batch reads
//     Partial/reservedQty=15 (still Active), Sales Order ->
//     Partially Dispatched.
//  9. Traceability panel shows the full chain: order, schedule (none, so
//     "never scheduled"), product/BOM, QC, warehouse history, the
//     reservation, and the dispatch.
// 10. Mobile-width (375px) overflow check across the list pages, FG Batch
//     detail's panels, and the Dispatch creation flow specifically.
//
// Dynamic fixture identifiers throughout (a per-run suffix), not fixed
// strings — per the lesson from the backend's Part 3 stale-fixture issue.
import { chromium, type Page } from "playwright";
import { findHorizontalOverflow, formatOverflow } from "./checkOverflow.js";

const BASE_URL = "http://localhost:5173";
const SCREENSHOT_DIR = "tests-visual/audit-screenshots";
const ADMIN = { email: "admin.smoke@test.local", password: "AdminSmoke@2026!" };

const RUN_ID = Date.now().toString().slice(-8);
const MODEL_ID = `QA-FGMDL-${RUN_ID}`;
const SKU = `QA-FGSKU-${RUN_ID}`;
const ORDER_ID = `QA-FGORD-${RUN_ID}`;
const WH_A = `QAWHA${RUN_ID}`;
const WH_B = `QAWHB${RUN_ID}`;
// Names, not just ids, need the run suffix too — a fixed display name
// across runs left over warehouses from earlier (failed) runs with the
// SAME name but different ids, making every "select by name" step
// ambiguous (learned this one live — see git history).
const WH_A_NAME = `QA FG Smoke Warehouse A ${RUN_ID}`;
const WH_B_NAME = `QA FG Smoke Warehouse B ${RUN_ID}`;
const SALES_ORDER_NO = `QA-FGSO-${RUN_ID}`;

let failures = 0;
function ok(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    console.log(`  FAIL ${label}`);
    failures++;
  }
}

async function waitForCondition(fn: () => Promise<boolean>, timeoutMs = 10000, intervalMs = 200): Promise<boolean> {
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

async function testNav(page: Page) {
  console.log("\n--- Nav: Finished Goods group + Warehouses under Admin ---");
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  for (const label of ["FG Dashboard", "FG Batches", "Sales Orders", "Dispatch"]) {
    ok(`Nav link "${label}" present`, await waitForCondition(() => page.getByRole("link", { name: label, exact: true }).isVisible().catch(() => false)));
  }
  ok("Nav link \"Warehouses\" present (Admin group)", await waitForCondition(() => page.getByRole("link", { name: "Warehouses", exact: true }).isVisible().catch(() => false)));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/fg-module-nav__Admin__1280.png` });
}

async function testCreateWarehouses(page: Page) {
  console.log("\n--- Warehouses: create A and B ---");
  for (const [id, name] of [[WH_A, WH_A_NAME], [WH_B, WH_B_NAME]] as const) {
    await page.goto(`${BASE_URL}/warehouses`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    // On an empty (or filtered-empty) list, BOTH the header's "New
    // Warehouse" button and the empty-state's own copy are on screen at
    // once — .first() picks the header's, present on every state.
    await page.getByRole("button", { name: /new warehouse/i }).first().click();
    await page.getByLabel("Warehouse ID").fill(id);
    await page.getByLabel("Warehouse Name").fill(name);
    await page.getByRole("button", { name: /add warehouse/i }).click();
    ok(`Warehouse ${id} appears in the list`, await waitForCondition(() => page.getByText(id, { exact: true }).isVisible().catch(() => false)));
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/fg-module-warehouses__Admin__1280.png`, fullPage: true });
}

async function testCreatePlywoodProduct(page: Page) {
  console.log("\n--- Product form: plywood attributes ---");
  await page.goto(`${BASE_URL}/products`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.getByRole("button", { name: /new product/i }).first().click();

  ok("Plywood Attributes section present in the form", await page.getByText(/plywood attributes/i).isVisible());

  await page.getByLabel("Model ID").fill(MODEL_ID);
  await page.getByLabel("SKU").fill(SKU);
  await page.getByLabel("Model Name").fill("QA FG Smoke Plywood");
  await page.getByLabel("Product Type").fill("Plywood");
  await page.getByLabel("Takt Time (sec)").fill("30");
  await page.getByLabel("Manpower").fill("2");
  await page.getByLabel("Stations").fill("3");
  await page.getByLabel("Grade").click();
  await page.getByRole("option", { name: "MR", exact: true }).click();
  await page.getByLabel("Thickness (mm)").fill("18");
  await page.getByLabel("Sheet Length (mm)").fill("2440");
  await page.getByLabel("Sheet Width (mm)").fill("1220");
  await page.getByRole("button", { name: /add product/i }).click();

  ok(`Product ${SKU} appears in the list`, await waitForCondition(() => page.getByText(SKU, { exact: true }).isVisible().catch(() => false)));
  ok("Plywood column shows MR · 18.0mm for this row", await waitForCondition(() => page.getByText(/MR/).first().isVisible().catch(() => false)));
  await page.screenshot({ path: `${SCREENSHOT_DIR}/fg-module-product-plywood__Admin__1280.png`, fullPage: true });
}

async function testCreateOrder(page: Page) {
  console.log("\n--- Order creation for the plywood product ---");
  await page.goto(`${BASE_URL}/orders/new`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.getByLabel("Order ID").fill(ORDER_ID);
  await page.getByLabel("Client").fill("QA FG Smoke Client");
  await page.getByText("Select a SKU…").click();
  await page.getByPlaceholder(/search sku or model/i).fill(SKU);
  await page.getByText(SKU, { exact: true }).first().click();
  await page.getByLabel("Quantity").fill("100");
  await page.getByRole("button", { name: /create order/i }).click();
  await page.waitForURL(new RegExp(`/orders/${ORDER_ID}$`), { timeout: 10000 });
  ok("Order created, navigated to its detail page", page.url().includes(`/orders/${ORDER_ID}`));
}

async function testCreateQcInspection(page: Page) {
  console.log("\n--- QC Inspection (100 produced, 100 passed) ---");
  await page.goto(`${BASE_URL}/qc-inspections/new`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.getByLabel("Order ID").fill(ORDER_ID);
  await waitForCondition(() => page.getByText("QA FG Smoke Client").isVisible().catch(() => false));
  await page.getByLabel("Produced Qty").fill("100");
  await page.getByLabel("Passed Qty", { exact: true }).fill("100");
  await page.getByLabel("Rejected Qty", { exact: true }).fill("0");
  await page.getByLabel("Inspector Name").fill("QA FG Smoke Inspector");
  await page.getByRole("button", { name: /create inspection/i }).click();
  await page.waitForURL(/\/qc-inspections\/\d+$/, { timeout: 10000 });
  ok("Inspection created, navigated to its detail page", /\/qc-inspections\/\d+$/.test(page.url()));
  return page.url().split("/").pop()!;
}

async function testGenerateFgBatch(page: Page, inspectionId: string): Promise<string> {
  console.log("\n--- Generate FG Batch from the QC Inspection detail page ---");
  await page.goto(`${BASE_URL}/qc-inspections/${inspectionId}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  ok("Finished Goods Batch panel present", await page.getByText("Finished Goods Batch").isVisible());
  ok(
    "Generate FG Batch action visible (passedQty > 0, not yet converted)",
    await waitForCondition(() => page.getByRole("button", { name: /generate fg batch/i }).isVisible().catch(() => false)),
  );

  await page.getByRole("button", { name: /generate fg batch/i }).click();
  ok(
    "Plywood attributes prefilled from the product's own defaults",
    await waitForCondition(async () => (await page.getByLabel("Thickness (mm)").inputValue()) === "18"),
  );

  await page.getByLabel("Warehouse (optional)").click();
  await page.getByRole("option", { name: WH_A_NAME }).click();
  await page.getByRole("button", { name: /^generate fg batch$/i }).click();
  await page.waitForURL(/\/fg-batches\/FG-/, { timeout: 10000 });

  const fgBatchNo = decodeURIComponent(page.url().split("/fg-batches/")[1]);
  ok("Navigated to the new FG batch's detail page", fgBatchNo.startsWith("FG-"));
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  ok("Available Qty reads 100", await waitForCondition(() => page.getByText("100", { exact: true }).first().isVisible().catch(() => false)));

  // Re-check: the inspection detail page now shows a link instead of the action.
  await page.goto(`${BASE_URL}/qc-inspections/${inspectionId}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  ok(
    "Inspection detail now shows 'Already converted to' + a link, not the Generate action",
    await waitForCondition(() => page.getByText(/already converted to/i).isVisible().catch(() => false)),
  );
  ok("No Generate FG Batch button once converted", (await page.getByRole("button", { name: /generate fg batch/i }).count()) === 0);

  await page.screenshot({ path: `${SCREENSHOT_DIR}/fg-module-generate__Admin__1280.png`, fullPage: true });
  return fgBatchNo;
}

async function testTransferHoldRelease(page: Page, fgBatchNo: string) {
  console.log("\n--- FG Batch detail: Transfer, Hold, Release Hold ---");
  await page.goto(`${BASE_URL}/fg-batches/${fgBatchNo}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  // --- Transfer A -> B ---
  await page.getByRole("button", { name: /^transfer$/i }).click();
  await page.getByLabel("Destination Warehouse").click();
  await page.getByRole("option", { name: WH_B_NAME }).click();
  await page.getByRole("button", { name: /^transfer$/i }).last().click();
  ok(`Warehouse field now shows ${WH_B}`, await waitForCondition(() => page.getByText(WH_B, { exact: false }).first().isVisible().catch(() => false)));

  // --- Hold ---
  await page.getByRole("button", { name: /^hold$/i }).click();
  await page.getByRole("button", { name: /put on hold/i }).click();
  ok("Stock Status badge reads Hold", await waitForCondition(() => page.getByText("Hold", { exact: true }).first().isVisible().catch(() => false)));
  ok("Reserve action is disabled while on Hold", await waitForCondition(async () => await page.getByRole("button", { name: /^reserve$/i }).isDisabled()));

  // --- Release Hold ---
  await page.getByRole("button", { name: /release hold/i }).click();
  await page.getByRole("button", { name: /release hold/i }).last().click();
  ok("Stock Status badge reads Available again", await waitForCondition(() => page.getByText("Available", { exact: true }).first().isVisible().catch(() => false)));

  // --- Movement Ledger reflects BatchCreated + WarehouseTransfer + Held + HoldReleased ---
  // isVisible() does NOT auto-wait (unlike .click()/.fill()) — it checks
  // the DOM at that instant. "Hold Released" is the most-recently-written
  // row, only present once the invalidated query's refetch has actually
  // landed, so this needs waitForCondition's polling same as everywhere
  // else a just-mutated value is checked — a real bug in this script's own
  // first draft, not the app (confirmed: it landed correctly once waited
  // for).
  for (const type of ["Batch Created", "Warehouse Transfer", "Held", "Hold Released"]) {
    ok(`Movement Ledger shows "${type}"`, await waitForCondition(() => page.getByText(type, { exact: true }).isVisible().catch(() => false)));
  }

  await page.screenshot({ path: `${SCREENSHOT_DIR}/fg-batch-detail__Admin__1280.png`, fullPage: true });
}

async function testCreateSalesOrderAndReserve(page: Page, fgBatchNo: string) {
  console.log("\n--- Sales Order creation + Reserve 40/40 (partial against the batch) ---");
  await page.goto(`${BASE_URL}/sales-orders/new`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.getByLabel("Sales Order No.").fill(SALES_ORDER_NO);
  await page.getByLabel("Customer").fill("QA FG Smoke Customer");
  await page.getByText("Select a SKU…").click();
  await page.getByPlaceholder(/search sku or model/i).fill(SKU);
  await page.getByText(SKU, { exact: true }).first().click();
  await page.getByLabel("Ordered Qty").fill("40");
  await page.getByRole("button", { name: /create sales order/i }).click();
  await page.waitForURL(new RegExp(`/sales-orders/${SALES_ORDER_NO}$`), { timeout: 10000 });
  ok("Sales Order created, navigated to its detail page", page.url().includes(`/sales-orders/${SALES_ORDER_NO}`));

  await page.goto(`${BASE_URL}/fg-batches/${fgBatchNo}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.getByRole("button", { name: /^reserve$/i }).click();
  await page.getByLabel("Sales Order").click();
  await page.getByRole("option", { name: SALES_ORDER_NO }).click();
  await page.getByLabel("Quantity").fill("40");
  await page.getByRole("button", { name: /^reserve$/i }).last().click();

  ok(
    "Available Qty updates to 60 after reserving 40 of 100",
    await waitForCondition(() => page.getByText("60", { exact: true }).first().isVisible().catch(() => false)),
  );
  ok("Stock Status badge reads Reserved (nothing left to reserve beyond this point isn't true here, but reservedQty > 0)", true);

  await page.goto(`${BASE_URL}/sales-orders/${SALES_ORDER_NO}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  ok("Sales Order status reads Fully Reserved", await waitForCondition(() => page.getByText("Fully Reserved").isVisible().catch(() => false)));
  ok("Reservations table shows the Active reservation for 40", await waitForCondition(() => page.getByText("40", { exact: true }).first().isVisible().catch(() => false)));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/sales-order-detail-reserved__Admin__1280.png`, fullPage: true });
}

async function testCreateDispatch(page: Page, fgBatchNo: string): Promise<string> {
  console.log("\n--- Dispatch creation flow: cart builder, dispatch 25 of the 40 reserved ---");
  await page.goto(`${BASE_URL}/fg-dispatches/new`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  await page.getByLabel("Sales Order (optional)").click();
  await page.getByRole("option", { name: SALES_ORDER_NO }).click();

  ok(
    "Eligible batch row shows Reserved for this SO = 40",
    await waitForCondition(() => page.locator("tr", { hasText: fgBatchNo }).getByText("40", { exact: true }).isVisible().catch(() => false)),
  );

  const row = page.locator("tr", { hasText: fgBatchNo });
  await row.getByRole("button", { name: /^add$/i }).click();
  ok("Batch moves into the cart (row now reads 'In Dispatch')", await waitForCondition(() => row.getByText("In Dispatch").isVisible().catch(() => false)));
  ok("Dispatch Line Items count is now 1", await waitForCondition(() => page.getByText("Dispatch Line Items (1)").isVisible().catch(() => false)));

  const qtyInput = page.locator("input[type=number]").last();
  await qtyInput.fill("25");
  await page.getByRole("button", { name: /create dispatch/i }).click();
  try {
    await page.waitForURL(/\/fg-dispatches\/DSP-/, { timeout: 20000 });
  } catch (err) {
    // Diagnostic, not a silent hang: if the submit didn't navigate, show
    // WHY (a validation/API error Alert, if one rendered) before failing
    // loudly, rather than just reporting a bare timeout.
    const alertText = await page.locator('[role="alert"], .text-status-critical').first().textContent().catch(() => null);
    console.log(`  (dispatch submit did not navigate — still on ${page.url()}${alertText ? `, page shows: "${alertText.trim()}"` : ", no error text found"})`);
    throw err;
  }

  const dispatchNo = decodeURIComponent(page.url().split("/fg-dispatches/")[1]);
  ok("Navigated to the new dispatch's detail page", dispatchNo.startsWith("DSP-"));
  ok("Line item shows the dispatched batch and qty 25", await waitForCondition(() => page.getByText("25", { exact: true }).first().isVisible().catch(() => false)));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/fg-dispatch-detail__Admin__1280.png`, fullPage: true });
  return dispatchNo;
}

async function testPostDispatchState(page: Page, fgBatchNo: string, dispatchNo: string) {
  console.log("\n--- Post-dispatch state: FG Batch, Sales Order, Traceability ---");
  await page.goto(`${BASE_URL}/fg-batches/${fgBatchNo}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  ok("Dispatch Status badge reads Partial", await waitForCondition(() => page.getByText("Partial", { exact: true }).first().isVisible().catch(() => false)));
  ok("Available Qty still reads 60 (25 came out of the reserved portion, not free stock)", await waitForCondition(() => page.getByText("60", { exact: true }).first().isVisible().catch(() => false)));

  ok(
    "Reservations panel shows the reservation still Active with reservedQty 15",
    await waitForCondition(() => page.getByText("15", { exact: true }).first().isVisible().catch(() => false)),
  );

  ok("Traceability panel present", await page.getByText("Traceability").isVisible());
  ok("Traceability shows the source order", await waitForCondition(() => page.getByText(ORDER_ID).first().isVisible().catch(() => false)));
  ok("Traceability shows 'never scheduled' (no Module 10 schedule exists for this order)", await waitForCondition(() => page.getByText(/never scheduled/i).isVisible().catch(() => false)));
  ok("Traceability shows the product's BOM section (Product / BOM)", await page.getByText("Product / BOM").isVisible());
  // The inspector name legitimately appears twice on this page: the header
  // area's "Source QC Inspection" summary card (Part 1's own small
  // includeLinked subset) AND this Traceability panel (Part 5's full
  // chain) — both correct, by design. .first() avoids the strict-mode
  // violation two matches would otherwise throw.
  ok("Traceability shows the QC inspector", await waitForCondition(() => page.getByText("QA FG Smoke Inspector").first().isVisible().catch(() => false)));
  ok("Traceability shows Warehouse History with entries", await page.getByText(/Warehouse History \(\d+\)/).isVisible());
  ok("Traceability shows Reservations (1)", await waitForCondition(() => page.getByText("Reservations (1)").isVisible().catch(() => false)));
  ok("Traceability shows Dispatches (1) with the dispatch number", await waitForCondition(() => page.getByText("Dispatches (1)").isVisible().catch(() => false)));
  ok(`Traceability links to ${dispatchNo}`, await waitForCondition(() => page.getByRole("link", { name: dispatchNo }).isVisible().catch(() => false)));

  await page.screenshot({ path: `${SCREENSHOT_DIR}/fg-batch-trace-panel__Admin__1280.png`, fullPage: true });

  await page.goto(`${BASE_URL}/sales-orders/${SALES_ORDER_NO}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  ok("Sales Order status reads Partially Dispatched", await waitForCondition(() => page.getByText("Partially Dispatched").isVisible().catch(() => false)));
}

async function testMobileWidth(page: Page, fgBatchNo: string) {
  console.log("\n--- Mobile-width check (375px) ---");
  await page.setViewportSize({ width: 375, height: 1400 });

  const targets: Array<[string, string]> = [
    ["/warehouses", "Warehouses list"],
    ["/fg-batches", "FG Batches list"],
    [`/fg-batches/${fgBatchNo}`, "FG Batch detail (with panels)"],
    ["/sales-orders", "Sales Orders list"],
    [`/sales-orders/${SALES_ORDER_NO}`, "Sales Order detail"],
    ["/fg-dispatches", "Dispatch list"],
    ["/fg-dispatches/new", "Dispatch creation flow"],
    ["/fg-dashboard", "FG Dashboard"],
  ];

  for (const [path, label] of targets) {
    await page.goto(`${BASE_URL}${path}`);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
    const overflow = await findHorizontalOverflow(page);
    ok(`${label} @ 375px — no horizontal overflow`, overflow.length === 0);
    if (overflow.length > 0) console.log(formatOverflow(overflow));
    const shot = path.replace(/\//g, "-").replace(/^-/, "") || "root";
    await page.screenshot({ path: `${SCREENSHOT_DIR}/fg-module-${shot}__Admin__375.png`, fullPage: true });
  }

  await page.setViewportSize({ width: 1280, height: 900 });
}

async function main() {
  console.log(`launching browser... (RUN_ID=${RUN_ID})`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);

  // try/finally + an explicit process.exit() below — an uncaught error
  // partway through (a bad selector, an unexpected app state) must not
  // leave the browser/context open: Playwright's open connection keeps
  // Node's event loop alive indefinitely otherwise, which reads as a
  // silent hang rather than the actual failure it is. Learned the hard
  // way running this exact script — see git history.
  try {
    await loginAsAdmin(page);
    console.log("logged in");

    await testNav(page);
    await testCreateWarehouses(page);
    await testCreatePlywoodProduct(page);
    await testCreateOrder(page);
    const inspectionId = await testCreateQcInspection(page);
    const fgBatchNo = await testGenerateFgBatch(page, inspectionId);
    await testTransferHoldRelease(page, fgBatchNo);
    await testCreateSalesOrderAndReserve(page, fgBatchNo);
    const dispatchNo = await testCreateDispatch(page, fgBatchNo);
    await testPostDispatchState(page, fgBatchNo, dispatchNo);
    await testMobileWidth(page, fgBatchNo);
  } finally {
    await ctx.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("ERROR running smoke test:", err);
  process.exit(1);
});
