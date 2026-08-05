// Full mobile-responsiveness sweep — every route, at every breakpoint,
// logged in as whichever role(s) the route is relevant for. Run with:
//   npx tsx tests-visual/mobile-audit.ts
// Screenshots land in tests-visual/audit-screenshots/ (gitignored).
//
// Auth: logs in once per role via the real UI form (same pattern as
// dashboard-overlap.ts) and reuses that session for every route+breakpoint
// under that role — NOT one login per page, which would burn through the
// login rate limiter for no reason. Optionally set STOREMANAGER_TOKEN /
// ADMIN_TOKEN / PRODUCTIONMANAGER_TOKEN env vars to skip the UI login step
// entirely (useful for fast iteration while auditing/fixing) — falls back
// to real login for whichever role's token isn't set.
import { chromium, type Page } from "playwright";
import * as fs from "node:fs";
import { findHorizontalOverflow, formatOverflow } from "./checkOverflow.js";
import { findOverlaps, formatViolations } from "./checkNoOverlap.js";

const BASE_URL = "http://localhost:5173";
const OUT_DIR = "tests-visual/audit-screenshots";
fs.mkdirSync(OUT_DIR, { recursive: true });

// Height is deliberately generous (NOT a real phone's viewport height) —
// this app scrolls its inner <main>, not document.body (see app-shell.tsx:
// `h-svh` on the outer flex wrapper, `overflow-y-auto` on <main>), so
// Playwright's `fullPage` screenshot option — which measures
// document/body scrollHeight — sees no overflow there and would otherwise
// silently crop every screenshot to just the first viewport-height of
// content. A tall viewport sidesteps that: real content still reflows at
// the authentic WIDTH for each breakpoint (what actually matters for
// horizontal-overflow/overlap checks), it just doesn't need inner
// scrolling to be visible in one screenshot.
const BREAKPOINTS = [
  { name: "375", width: 375, height: 3200 },
  { name: "428", width: 428, height: 3200 },
  { name: "768", width: 768, height: 3200 },
  { name: "1280", width: 1280, height: 2400 },
];

type Role = "Admin" | "StoreManager" | "ProductionManager";

const ACCOUNTS: Record<Role, { email: string; password: string; tokenEnv: string }> = {
  Admin: { email: "admin.smoke@test.local", password: "AdminSmoke@2026!", tokenEnv: "ADMIN_TOKEN" },
  StoreManager: { email: "storemanager.smoke@test.local", password: "StoreManager@2026!", tokenEnv: "STOREMANAGER_TOKEN" },
  ProductionManager: {
    email: "productionmanager.smoke@test.local",
    password: "ProdManager@2026!",
    tokenEnv: "PRODUCTIONMANAGER_TOKEN",
  },
};

interface RouteSpec {
  path: string;
  name: string;
  roles: Role[] | "any"; // "any" = layout doesn't meaningfully vary by role, one pass is enough
  waitFor?: string; // a text/selector to wait for beyond the bento-grid/table default
}

// Real sample IDs pulled from the dev DB at audit time — detail pages
// can't be visited without one. If these ever go stale (record deleted),
// swap in a fresh id/sku/batchNumber from the corresponding list page.
const ROUTES: RouteSpec[] = [
  { path: "/", name: "Dashboard", roles: ["Admin", "StoreManager", "ProductionManager"] },
  { path: "/orders", name: "Orders — list", roles: "any" },
  { path: "/orders/new", name: "Orders — create", roles: "any" },
  { path: "/orders/sku-007", name: "Orders — detail", roles: "any" },
  { path: "/daily-logs", name: "Daily Logs — list", roles: "any" },
  { path: "/daily-logs/new", name: "Daily Logs — create form", roles: "any" },
  { path: "/daily-logs/DL-20260803-03", name: "Daily Logs — detail", roles: "any" },
  { path: "/daily-logs/DL-20260803-03/edit", name: "Daily Logs — edit form", roles: "any" },
  { path: "/oee", name: "OEE", roles: "any" },
  { path: "/scheduling", name: "Scheduling", roles: "any" },
  { path: "/risk", name: "Risk", roles: "any" },
  { path: "/rm-inventory", name: "RM Inventory — list", roles: "any" },
  { path: "/rm-inventory/new", name: "RM Inventory — create", roles: "any" },
  { path: "/rm-inventory/PART-BASKET-AF20", name: "RM Inventory — detail", roles: "any" },
  { path: "/bom", name: "BOM", roles: "any" },
  { path: "/bom/explosion", name: "BOM — explosion calculator", roles: "any" },
  { path: "/ctb", name: "CTB", roles: "any" },
  { path: "/materials", name: "Material Dashboard", roles: "any" },
  { path: "/purchase-requisitions", name: "Purchase Requisitions — list", roles: "any" },
  { path: "/purchase-requisitions/2", name: "Purchase Requisitions — detail", roles: "any" },
  { path: "/qc-batches", name: "QC Batches — list", roles: "any" },
  { path: "/qc-batches/BATCH-20260805-02", name: "QC Batches — detail", roles: "any" },
  { path: "/testing-plans", name: "Testing Plans", roles: "any" },
  { path: "/products", name: "Products", roles: "any" },
  { path: "/lines", name: "Lines", roles: "any" },
  { path: "/hr-teams", name: "HR Teams", roles: "any" },
  { path: "/users", name: "Users", roles: ["Admin"] }, // admin-only, both by nav AND by API
];

async function loginViaUi(page: Page, role: Role): Promise<void> {
  const { email, password } = ACCOUNTS[role];
  await page.goto(`${BASE_URL}/login`);
  await page.getByRole("textbox", { name: /email/i }).fill(email);
  await page.getByRole("textbox", { name: /password/i }).fill(password);
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 });
}

async function authenticate(page: Page, role: Role): Promise<void> {
  const envToken = process.env[ACCOUNTS[role].tokenEnv];
  if (envToken) {
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate((t) => localStorage.setItem("ppc.auth.token", t), envToken);
    await page.goto(`${BASE_URL}/`);
    await page.waitForSelector('[data-testid="dashboard-bento-grid"]', { timeout: 15000 });
    return;
  }
  await loginViaUi(page, role);
}

interface Finding {
  route: string;
  role: string;
  breakpoint: string;
  kind: "overflow" | "overlap";
  detail: string;
}

const findings: Finding[] = [];

async function auditRoute(page: Page, route: RouteSpec, role: Role, bp: (typeof BREAKPOINTS)[number]) {
  await page.setViewportSize({ width: bp.width, height: bp.height });
  await page.goto(`${BASE_URL}${route.path}`);
  // Generic settle: wait for the app shell to be present, then a short
  // pause for data fetches / gauge-sweep animations. Not every page has a
  // data-testid landmark, so this stays deliberately generic rather than
  // route-specific.
  await page.waitForSelector("header", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);

  const overflow = await findHorizontalOverflow(page);
  if (overflow.length > 0) {
    findings.push({
      route: route.name,
      role,
      breakpoint: bp.name,
      kind: "overflow",
      detail: formatOverflow(overflow),
    });
  }

  // Global gauge-overlap check — cheap, and relevant on any page that
  // happens to render a GaugeDial (today: just Dashboard, but this stays
  // correct if that ever changes).
  const gaugeOverlaps = await findOverlaps(page, "[data-gauge]");
  if (gaugeOverlaps.length > 0) {
    findings.push({
      route: route.name,
      role,
      breakpoint: bp.name,
      kind: "overlap",
      detail: formatViolations(gaugeOverlaps, `${route.name} gauges`),
    });
  }

  const fileSafe = route.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  await page.screenshot({ path: `${OUT_DIR}/${fileSafe}__${role}__${bp.name}.png`, fullPage: true });
}

async function auditAuthPage(page: Page, path: string, name: string, bp: (typeof BREAKPOINTS)[number]) {
  await page.setViewportSize({ width: bp.width, height: bp.height });
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);

  const overflow = await findHorizontalOverflow(page);
  if (overflow.length > 0) {
    findings.push({ route: name, role: "logged-out", breakpoint: bp.name, kind: "overflow", detail: formatOverflow(overflow) });
  }

  const fileSafe = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  await page.screenshot({ path: `${OUT_DIR}/${fileSafe}__logged-out__${bp.name}.png`, fullPage: true });
}

async function main() {
  const browser = await chromium.launch();

  // --- Logged-out auth pages first ---
  {
    const ctx = await browser.newContext({ viewport: { width: BREAKPOINTS[0].width, height: BREAKPOINTS[0].height } });
    const page = await ctx.newPage();
    for (const bp of BREAKPOINTS) {
      await auditAuthPage(page, "/login", "Login", bp);
      console.log(`checked  Login — logged-out @ ${bp.name}px`);
    }
    await ctx.close();
  }

  const rolesToRun: Role[] = ["StoreManager", "Admin", "ProductionManager"];
  for (const role of rolesToRun) {
    const ctx = await browser.newContext({ viewport: { width: BREAKPOINTS[0].width, height: BREAKPOINTS[0].height } });
    const page = await ctx.newPage();
    await authenticate(page, role);

    const routesForRole = ROUTES.filter((r) => r.roles === "any" || (r.roles as Role[]).includes(role));
    // "any"-scoped routes only need auditing once (by whichever role runs
    // first, StoreManager) — re-running them under every role is pure
    // duplication for pages that don't vary by role.
    const routes = role === "StoreManager" ? routesForRole : routesForRole.filter((r) => r.roles !== "any");

    for (const route of routes) {
      for (const bp of BREAKPOINTS) {
        try {
          await auditRoute(page, route, role, bp);
          console.log(`checked  ${route.name} — ${role} @ ${bp.name}px`);
        } catch (err) {
          findings.push({
            route: route.name,
            role,
            breakpoint: bp.name,
            kind: "overflow",
            detail: `ERROR visiting route: ${(err as Error).message}`,
          });
          console.log(`ERROR    ${route.name} — ${role} @ ${bp.name}px: ${(err as Error).message}`);
        }
      }
    }

    await ctx.close();
  }

  await browser.close();

  console.log(`\n${findings.length} finding(s):\n`);
  for (const f of findings) {
    console.log(`[${f.kind.toUpperCase()}] ${f.route} — ${f.role} @ ${f.breakpoint}px`);
    console.log(f.detail);
    console.log("");
  }
  fs.writeFileSync(`${OUT_DIR}/findings.json`, JSON.stringify(findings, null, 2));
}

main().catch((err) => {
  console.error("ERROR running mobile audit:", err);
  process.exitCode = 1;
});
