import { UserRole } from '@prisma/client';

// Single, central, auditable source of truth for who can read/write each
// module — see README "Authentication & Authorization" for the full
// permission-matrix table this mirrors exactly. Every module's routes.ts
// imports its own entry here and applies `authenticate, authorize(...roles)`
// consistently, rather than each file inventing/copy-pasting its own
// allowed-roles array.
//
// Admin is NEVER listed in these arrays — the `authorize()` middleware
// already lets Admin through regardless of the roles given, so every array
// below only needs to name the OTHER role(s) allowed. An empty `write: []`
// means "Admin only" for that action (every other role gets 403).

const STORE_AND_PRODUCTION: UserRole[] = [UserRole.StoreManager, UserRole.ProductionManager];
const STORE_ONLY: UserRole[] = [UserRole.StoreManager];
const PRODUCTION_ONLY: UserRole[] = [UserRole.ProductionManager];
const ADMIN_ONLY: UserRole[] = [];

export const PERMISSIONS = {
  // --- Material side (StoreManager's domain) ---
  rmInventory: { read: STORE_AND_PRODUCTION, write: STORE_ONLY },
  bom: { read: STORE_AND_PRODUCTION, write: STORE_ONLY },
  bomExplosion: { read: STORE_AND_PRODUCTION, write: STORE_ONLY },
  ctb: { read: STORE_AND_PRODUCTION, write: STORE_ONLY },
  materials: { read: STORE_AND_PRODUCTION, write: STORE_ONLY },
  purchaseRequisitions: { read: STORE_AND_PRODUCTION, write: STORE_ONLY },

  // --- Floor side (ProductionManager's domain) ---
  orders: { read: STORE_AND_PRODUCTION, write: PRODUCTION_ONLY },
  dailyLogs: { read: STORE_AND_PRODUCTION, write: PRODUCTION_ONLY },
  oee: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY }, // read-only module — write unused (no write routes exist)
  scheduling: { read: STORE_AND_PRODUCTION, write: PRODUCTION_ONLY },
  productionPlan: { read: STORE_AND_PRODUCTION, write: PRODUCTION_ONLY }, // same as Scheduling — see README "Client Flow Part 2"
  risk: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY }, // read-only module — write unused
  qcBatches: { read: STORE_AND_PRODUCTION, write: PRODUCTION_ONLY },
  qcInspections: { read: STORE_AND_PRODUCTION, write: PRODUCTION_ONLY }, // same floor/quality domain as QC Batches — see README "Client Flow Part 3"
  qcTestingPlans: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY }, // master data, not a floor action
  hrTeams: { read: STORE_AND_PRODUCTION, write: PRODUCTION_ONLY },

  // --- Shared master data / cross-cutting (both roles read, only Admin writes) ---
  products: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY },
  lines: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY }, // physical line config/engineering setup, not a day-to-day floor action — see README
  machines: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY }, // physical equipment config, same reasoning as Lines — see README
  shortageReport: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY }, // read-only module — write unused
  search: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY }, // read-only module — write unused
  dashboard: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY }, // read-only module — write unused
  orderStatusDashboard: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY }, // read-only module — write unused; same shape as dashboard — see README "Client Flow Part 5"

  // --- FG Module (Finished Goods) — see README "FG Module Part 1" for the
  // full role-split judgment call this pair of lines records. ---
  warehouses: { read: STORE_AND_PRODUCTION, write: ADMIN_ONLY }, // master data, same convention as Lines/Machines
  // FG batch CREATION is production-side: the natural next step right after
  // a QC pass, same domain as qcInspections. Later parts' warehouse/bin
  // assignment, reservation, and dispatch actions are StoreManager
  // (inventory/warehouse) territory instead and will get their own entries
  // here when built — not this one.
  fgBatch: { read: STORE_AND_PRODUCTION, write: PRODUCTION_ONLY },
  // FG Module Part 2 — this IS one of the "warehouse/bin assignment...
  // actions" the fgBatch comment above points to: transfer, hold,
  // release-hold, and reading the movement ledger. StoreManager write, all
  // roles read — see README "FG Module Part 2".
  fgStockMovements: { read: STORE_AND_PRODUCTION, write: STORE_ONLY },
  // FG Module Part 3 — Sales Order master data. Admin/StoreManager write
  // (StoreManager owns the inventory/fulfillment side of this module, same
  // as fgStockMovements/fgReservations below), all roles read — see README
  // "FG Module Part 3".
  salesOrders: { read: STORE_AND_PRODUCTION, write: STORE_ONLY },
  // FG Module Part 3 — reserve (POST /api/fg-batches/:fgBatchNo/reserve)
  // and cancel (POST /api/fg-reservations/:id/cancel) are the same
  // warehouse/inventory territory as fgStockMovements' transfer/hold, so
  // they get the identical StoreManager-write split rather than reusing
  // fgStockMovements itself — kept as its own entry since reservation and
  // stock-movement actions are conceptually distinct, even though they
  // currently resolve to the same roles.
  fgReservations: { read: STORE_AND_PRODUCTION, write: STORE_ONLY },
} as const;
