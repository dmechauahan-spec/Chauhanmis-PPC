// Runs the geometric overlap check (checkNoOverlap.ts) against the
// dashboard for all three roles, at multiple widths — including the lg
// breakpoint boundary (1024px) specifically, since that's where the
// gauge-cluster overlap bug actually lived: "desktop" and "tablet" alone
// would NOT have caught it (1440px and 768px both render fine; the bug
// only appears in the narrow band right at a flex/grid breakpoint
// transition). Run with: npx tsx tests-visual/dashboard-overlap.ts
//
// Requires the frontend dev server on :5173 and the backend dev server on
// :3000 (both pointed at the same database the test accounts live in).
import { chromium } from "playwright";
import { findOverlaps, formatViolations } from "./checkNoOverlap.js";

const BASE_URL = "http://localhost:5173";

const ACCOUNTS: { role: string; email: string; password: string }[] = [
  { role: "Admin", email: "admin.smoke@test.local", password: "AdminSmoke@2026!" },
  { role: "StoreManager", email: "storemanager.smoke@test.local", password: "StoreManager@2026!" },
  { role: "ProductionManager", email: "productionmanager.smoke@test.local", password: "ProdManager@2026!" },
];

// 1440 = comfortable desktop. 1024 = the lg breakpoint itself, the actual
// danger zone for any flex/grid layout that changes direction there. 768 =
// tablet, below lg (single-column bento, but the secondary-gauge grid is
// still 3-across since that only drops to 1 column below sm/640px).
const WIDTHS = [1440, 1024, 768];

// Every check scoped to a specific meaningful group rather than the whole
// page — see checkNoOverlap.ts's doc comment for why (tooltips/overlays are
// legitimately "overlapping" by design and would be false positives at
// page scope).
const CHECKS: { name: string; selector: string }[] = [
  { name: "all gauges (page-wide)", selector: "[data-gauge]" },
  { name: "gauge-cluster row (hero + secondary group)", selector: '[data-testid="gauge-cluster-row"] > *' },
  { name: "top-level bento grid cards", selector: '[data-testid="dashboard-bento-grid"] > *' },
  { name: "planning health tiles row", selector: '[data-testid="planning-tiles-row"] > *' },
  // Catches a real, distinct bug found via this same investigation: the
  // pipeline stepper's stage LABELS (not their <li> boxes, which were
  // always correctly sized) were overflowing past their own stage into
  // neighbors — an li-vs-li check would have missed it entirely, since the
  // li boxes themselves never overlapped. See pipeline-stepper.tsx.
  { name: "pipeline stepper stage labels", selector: '[data-testid="pipeline-stage-label"]' },
];

async function main() {
  const browser = await chromium.launch();
  let anyFailures = false;

  for (const account of ACCOUNTS) {
    const ctx = await browser.newContext({ viewport: { width: WIDTHS[0], height: 1000 } });
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/login`);
    await page.getByRole("textbox", { name: /email/i }).fill(account.email);
    await page.getByRole("textbox", { name: /password/i }).fill(account.password);
    await page.getByRole("button", { name: /log in|sign in/i }).click();
    await page.waitForURL(`${BASE_URL}/`, { timeout: 20000 });
    await page.waitForSelector("text=Overview", { timeout: 15000 });

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 });
      // Dashboard cards render conditionally on data arriving — wait for a
      // real content marker, not a fixed sleep, so this doesn't flake on a
      // slow API response.
      await page.waitForSelector('[data-testid="dashboard-bento-grid"]', { timeout: 15000 });
      await page.waitForTimeout(400); // let the gauge needle-sweep transition settle

      for (const check of CHECKS) {
        const violations = await findOverlaps(page, check.selector);
        const label = `${account.role} @ ${width}px — ${check.name}`;
        if (violations.length > 0) {
          anyFailures = true;
          console.log(`FAIL  ${label}`);
          console.log(
            formatViolations(violations, label)
              .split("\n")
              .map((l: string) => `      ${l}`)
              .join("\n"),
          );
        } else {
          console.log(`pass  ${label}`);
        }
      }
    }

    await ctx.close();
  }

  await browser.close();

  if (anyFailures) {
    console.log("\nOverlap check FAILED — see FAIL lines above.");
    process.exitCode = 1;
  } else {
    console.log("\nOverlap check passed — no sibling-element overlap detected in any role/width combination.");
  }
}

main().catch((err) => {
  console.error("ERROR running overlap check:", err);
  process.exitCode = 1;
});
