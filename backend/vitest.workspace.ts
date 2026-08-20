import { configDefaults, defineWorkspace } from 'vitest/config';

// Integration test files: Vitest + Supertest suites that exercise the real
// (Neon) test database end-to-end (see README "Test strategy"). These are
// the only files that can hit a transient "Can't reach database server"
// blip mid-suite, so they're the only ones given automatic retry — see
// README "Connectivity resilience". Pure-logic unit test files
// (netRequirementCalculator.test.ts, oeeCalculator.test.ts, withRetry.test.ts,
// etc.) never touch the database and are deliberately left at Vitest's
// default retry: 0, so a failure there always means a real bug.
//
// New integration test file? Add its path here too, or it silently falls
// into the "unit" project below (retry: 0) instead of getting retry coverage.
const INTEGRATION_TEST_FILES = [
  'src/config/pagination.test.ts',
  'src/modules/auth/auth.test.ts',
  'src/modules/auth/auth.forgotPassword.test.ts',
  'src/modules/auth/auth.passwordReset.test.ts',
  'src/modules/auth/loginRateLimit.test.ts',
  'src/modules/auth/forgotPasswordRateLimit.test.ts',
  'src/modules/bom/bom.test.ts',
  'src/modules/bomExplosion/bomExplosion.test.ts',
  'src/modules/ctb/ctb.test.ts',
  'src/modules/dailyLogs/dailyLogs.test.ts',
  'src/modules/dashboard/dashboard.test.ts',
  'src/modules/hr/hr.test.ts',
  'src/modules/lines/lines.test.ts',
  'src/modules/machines/machines.test.ts',
  'src/modules/materials/materials.test.ts',
  'src/modules/oee/oee.test.ts',
  'src/modules/orders/orders.test.ts',
  'src/modules/orderStatusDashboard/orderStatusDashboard.test.ts',
  'src/modules/products/products.test.ts',
  'src/modules/productionPlan/productionPlan.test.ts',
  'src/modules/purchaseRequisitions/purchaseRequisitions.test.ts',
  'src/modules/suppliers/suppliers.test.ts',
  'src/modules/purchaseItems/purchaseItems.test.ts',
  'src/modules/purchaseIndents/purchaseIndents.test.ts',
  'src/modules/qc/qc.test.ts',
  'src/modules/qc/testingPlans.test.ts',
  'src/modules/qcInspection/qcInspection.test.ts',
  'src/modules/risk/risk.test.ts',
  'src/modules/rmInventory/rmInventory.test.ts',
  'src/modules/scheduling/scheduling.test.ts',
  'src/modules/search/search.test.ts',
  'src/modules/shortageReport/shortageReport.test.ts',
];

// A small retry count — enough to absorb the "immediate re-run in isolation
// succeeds" pattern observed with transient Neon blips, without masking a
// genuinely flaky test behind a wall of silent retries.
const INTEGRATION_TEST_RETRY_COUNT = 2;

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['src/**/*.test.ts', 'prisma/**/*.test.ts'],
      exclude: [...configDefaults.exclude, ...INTEGRATION_TEST_FILES],
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: INTEGRATION_TEST_FILES,
      retry: INTEGRATION_TEST_RETRY_COUNT,
    },
  },
]);
