import type { OrderStatus } from "@/lib/order-pipeline";

// Mirrors the backend's response envelope exactly (src/utils/apiResponse.ts
// in ppc-backend) — every endpoint returns one of these two shapes.
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: { message: string; details?: unknown };
}

// Mirrors PaginatedResult<T> from ppc-backend's src/utils/apiResponse.ts —
// every list endpoint's `data` is shaped like this.
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type UserRole = "Admin" | "StoreManager" | "ProductionManager";

// What GET /api/auth/me and the authenticate middleware's req.user carry —
// note this is narrower than the full user row (no isActive/timestamps).
export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

// GET /api/auth/users, POST /api/auth/users, PATCH /api/auth/users/:userId
// — the SAFE_USER_SELECT shape (passwordHash never leaves the backend).
export interface AdminUser extends CurrentUser {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  token: string;
  user: AdminUser;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  // Self-service "Forgot Password" identity check — see ppc-backend README
  // "Self-Service Password Reset". Required for every new user.
  securityQuestion: string;
  securityAnswer: string;
}

// No delete endpoint exists — isActive: false is the only supported way
// to remove a user's access, so every past changedBy/savedBy attribution
// stays intact. No password field either — there's no password-change
// endpoint on the backend yet. securityQuestion/securityAnswer are
// optional but must be sent together — this is how an Admin fixes a
// legacy account still holding the backend's SECURITY_QUESTION_NOT_SET
// sentinel.
export interface UpdateUserPayload {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
  securityQuestion?: string;
  securityAnswer?: string;
}

// ---- Self-Service Password Reset ----

export interface CaptchaChallenge {
  question: string;
  captchaToken: string;
}

export interface ForgotPasswordVerifyPayload {
  email: string;
  captchaToken: string;
  captchaAnswer: number;
  securityAnswer: string;
}

export interface ForgotPasswordVerifyResponse {
  resetToken: string;
}

export interface ResetPasswordPayload {
  resetToken: string;
  newPassword: string;
}

// ---- Dashboard (Module 14) ----

export type PrStatus = "Draft" | "Sent" | "Approved" | "Fulfilled" | "Cancelled";

export interface ProductionPeriodRow {
  periodLabel: string;
  totalOutputQty: number;
  totalGoodQty: number;
  avgAttendancePct: number | null;
}

export interface PlanningHealth {
  scheduledCount: number;
  delayedCount: number;
  atRiskCount: number;
}

export interface CtbBreakdown {
  clearCount: number;
  shortageCount: number;
  neverCheckedCount: number;
}

export interface MaterialsHealth {
  ctbBreakdown: CtbBreakdown;
  rmShortagePartsCount: number;
  procurementStatusBreakdown: Record<PrStatus, number>;
}

// Was missing `totals`/`excludedLogsCount` — the real backend response
// (oeeCalculator.ts#aggregateOee) always includes them, this type just
// hadn't been extended to match since Phase 1's dashboard only ever read
// the four top-level pct fields. excludedLogsCount is what lets a caller
// say "N of M logs couldn't contribute to this number" instead of just
// silently showing a lower aggregate.
export interface OeeAggregateResult {
  logCount: number;
  totals: {
    availability: { plannedMinutes: number; downtimeMinutes: number; runTimeMinutes: number };
    performance: { totalOutputQty: number; standardOutput: number };
    quality: { goodQty: number; totalOutputQty: number };
  };
  availabilityPct: number | null;
  performancePct: number | null;
  qualityPct: number | null;
  oeePct: number | null;
  excludedLogsCount: { availability: number; performance: number; quality: number };
}

export interface LineOutput {
  lineId: string;
  lineName: string;
  efficiencyPct: number;
  totalOutputQty: number;
}

export interface OnTimeRateResult {
  rate: number;
  onTimeCount: number;
  totalCount: number;
  excludedNoDueDateCount: number;
}

export interface ManagementMetrics {
  oeePct: number | null;
  capacityUtilizationPct: number | null;
  productionEfficiencyPct: number;
  deliveryPerformancePct: number;
  detail: {
    oee: OeeAggregateResult;
    productionEfficiency: { lineCount: number; lines: LineOutput[] };
    deliveryPerformance: OnTimeRateResult;
  };
}

export interface DashboardOverview {
  production: ProductionPeriodRow[];
  planning: PlanningHealth;
  materials: MaterialsHealth;
  management: ManagementMetrics;
}

// ---- Orders (Module 2) ----

export type OrderPriority = "Low" | "Medium" | "High";

export interface Order {
  orderId: string;
  client: string;
  sku: string;
  product: string;
  qty: number;
  dueDate: string | null;
  priority: OrderPriority;
  status: OrderStatus;
  createdAt: string;
  // Module 6 — both null until the order's first CTB evaluation.
  ctbStatus: "ClearToBuild" | "RmShortage" | null;
  ctbCheckedAt: string | null;
  // Client Flow Part 1 — free-text, optional. See CreateOrderPayload/UpdateOrderPayload.
  specialRequirements: string | null;
}

export interface OrderStatusHistoryEntry {
  id: number;
  orderId: string;
  oldStatus: OrderStatus | null;
  newStatus: OrderStatus;
  changedBy: string | null;
  changedAt: string;
  notes: string | null;
}

export interface CreateOrderPayload {
  orderId: string;
  client: string;
  sku: string;
  qty: number;
  dueDate?: string;
  priority: OrderPriority;
  specialRequirements?: string;
}

// Client Flow Part 1 — PATCH /api/orders/:orderId, separate from the
// status-transition endpoint. The backend's updateOrderSchema currently
// accepts ONLY specialRequirements — see order-detail-page.tsx and README
// note in edit-special-requirements-dialog.tsx for why the UI doesn't offer
// editing client/priority/dueDate here even though they're structurally
// similar fields.
export interface UpdateOrderPayload {
  specialRequirements?: string | null;
}

// ---- CTB (Module 6) — GET /api/ctb/order/:orderId ----

export type CtbStatusLabel = "Clear To Build" | "RM Shortage";

export interface CtbShortage {
  partId: string | null;
  partName: string;
  requiredQty: number;
  availableStock: number;
  shortQty: number;
}

export interface CtbOrderResult {
  orderId: string;
  sku: string;
  qty: number;
  ctbStatus: CtbStatusLabel;
  ctbCheckedAt: string;
  evaluatedLive: boolean;
  shortages: CtbShortage[];
}

// ---- CTB Dashboard (Module 6) — GET /api/ctb/dashboard, POST /api/ctb/recheck-all ----

// ctbStatus/ctbCheckedAt are null exactly when neverChecked is true — kept
// as three separate fields (not narrowed into a union) since that's how
// ctb.service.ts#getCtbDashboard actually shapes the row.
export interface CtbDashboardRow {
  orderId: string;
  client: string;
  priority: OrderPriority;
  sku: string;
  qty: number;
  status: OrderStatus;
  ctbStatus: CtbStatusLabel | null;
  ctbCheckedAt: string | null;
  neverChecked: boolean;
  shortages: CtbShortage[];
}

export interface RecheckAllSummary {
  totalEvaluated: number;
  clearToBuildCount: number;
  rmShortageCount: number;
}

// ---- Scheduling (Module 10) — GET /api/scheduling/schedule/:orderId ----

export type ScheduleStatusLabel = "OnTrack" | "AtRisk" | "RMShortage";

export interface OrderSchedule {
  id: number;
  orderId: string;
  client: string;
  sku: string;
  product: string;
  qty: number;
  lineId: string | null;
  lineName: string | null;
  // Raw Prisma Decimal fields serialize as strings over JSON (see
  // ppc-backend's scheduling.service.ts#getScheduleForOrder — it returns
  // the row as-is, unlike ctb.service.ts which explicitly Number()s its
  // Decimals) — Number(...) these at render time, don't treat as numbers.
  dailyOutput: string | null;
  workersPresent: number | null;
  workersRequired: number | null;
  shiftMode: string | null;
  daysNeeded: string | null;
  startDate: string | null;
  estEndDate: string | null;
  dueDate: string | null;
  slackDays: number | null;
  status: ScheduleStatusLabel;
  createdAt: string;
}

// ---- Risk recommendations (Module 11) — GET
// /api/risk/at-risk-orders/:orderId/recommendations ----

export type RecommendationOptionName = "Overtime" | "Extended Shift" | "Additional Line";

interface BaseRecommendationOption {
  option: RecommendationOptionName;
  isEstimate: true;
}

export interface ApplicableRecommendationOption extends BaseRecommendationOption {
  applicable: true;
  newDailyOutput: number;
  newDaysNeeded: number;
  newEstEndDate: string;
  newSlackDays: number;
  closesGap: boolean;
  // Additional Line only.
  recommendedLineId?: string;
  recommendedLineName?: string;
  otherFeasibleLineCount?: number;
}

export interface InapplicableRecommendationOption extends BaseRecommendationOption {
  applicable: false;
  reason: string;
}

export type RecommendationOption = ApplicableRecommendationOption | InapplicableRecommendationOption;

export interface RiskRecommendationsResult {
  orderId: string;
  currentSlackDays: number;
  options: RecommendationOption[];
  disclaimer: string;
}

export type RecommendationsReportStatus = "reported" | "not_scheduled" | "not_at_risk";

export interface AtRiskRecommendationsReport {
  orderId: string;
  reportStatus: RecommendationsReportStatus;
  recommendations: RiskRecommendationsResult | null;
}

// ---- Production Plan (Client Flow Part 2) — POST /api/production-plan/generate/:orderId,
// GET /api/production-plan/:orderId, GET /api/production-plan/:orderId/plan-vs-actual ----

// productionPlan.service.ts#toRow() explicitly Number()s plannedQty server-
// side (unlike OrderSchedule's Decimal fields above) — arrives as a real
// number, not a numeric string.
export interface DailyProductionPlanRow {
  id: number;
  orderId: string;
  planDate: string;
  lineId: string | null;
  machineId: string | null;
  plannedQty: number;
}

export interface PlanVsActualGapReason {
  reason: string;
  totalMinutes: number;
}

// `noDataLogged: true` means no daily_production_log row exists for this
// date at all — distinct from a verified zero output. actualQty/gap/
// achievementPct are still computed (as 0 / -plannedQty / 0) in that case,
// but the UI must not render them as real figures — see production-plan-
// panel.tsx.
export interface PlanVsActualDay {
  date: string;
  plannedQty: number;
  actualQty: number;
  gap: number;
  achievementPct: number | null;
  gapReasons: PlanVsActualGapReason[];
  noDataLogged: boolean;
}

export interface PlanVsActualSummary {
  cumulativePlannedQty: number;
  cumulativeActualQty: number;
  overallAchievementPct: number | null;
}

export interface PlanVsActualResult {
  orderId: string;
  days: PlanVsActualDay[];
  summary: PlanVsActualSummary;
}

// ---- RM Inventory (Module 1 write side) — GET/POST/PATCH /api/rm-inventory ----

// Raw rm_inventory row as ppc-backend's rmInventory.service returns it —
// stock/criticalThreshold are Prisma Decimal columns NOT Number()-converted
// server-side (see rmInventory.service.ts), so they arrive as numeric
// strings over JSON, same pattern as OrderSchedule/Product above.
// partId doubles as the part's display name — there is no separate name
// column (see README "Module 7" Assumptions) — show it as-is.
export interface RmInventoryRow {
  partId: string;
  stock: string;
  criticalThreshold: string | null;
  updatedAt: string;
}

export interface CreateRmInventoryPayload {
  partId: string;
  stock: number;
}

export interface AdjustStockPayload {
  delta: number;
  reason: string;
}

// Response of PATCH /api/rm-inventory/:partId/adjust-stock — the updated
// row plus the ledger entry it just wrote (rmInventory.service.ts#adjustStock).
export interface AdjustStockResult {
  inventory: RmInventoryRow;
  transaction: {
    id: number;
    partId: string;
    delta: string;
    reason: string | null;
    createdAt: string;
  };
}

// ---- Materials / Module 7 (Material Dashboard) — GET /api/materials/* ----

// Unlike RmInventoryRow above, every numeric field here IS Number()-converted
// server-side (materials.service.ts) — plain JS numbers, not Decimal strings.
export interface CriticalPartRow {
  partId: string;
  partName: string;
  stock: number;
  criticalThreshold: number;
  deficit: number;
}

export interface SetCriticalThresholdPayload {
  // null clears the threshold — deliberately not optional, see
  // materials.schema.ts's comment on why this isn't z.coerce'd.
  criticalThreshold: number | null;
}

export interface AffectedOrder {
  orderId: string;
  client: string;
  priority: OrderPriority;
  dueDate: string | null;
  shortQty: number;
  ctbCheckedAt: string | null;
}

// GET /api/materials/shortages — material-centric shortage view, one row per
// part, grouped from the same order_ctb_shortages rows AffectedOrder above
// reads (materialAggregator.ts#aggregateShortagesByPart). affectedOrders is
// already the full per-order breakdown for this part — no separate detail
// fetch needed to answer "which orders does fixing this part unblock."
export interface PartShortageSummary {
  partId: string | null;
  partName: string;
  totalShortQty: number;
  affectedOrderCount: number;
  highestPriority: OrderPriority;
  affectedOrders: AffectedOrder[];
}

// GET /api/materials/summary — composed server-side from the same two
// sources #1 (shortages) and #2 (critical) draw from, not a third query.
export interface MaterialsSummary {
  totalShortagePartsCount: number;
  totalCriticalPartsCount: number;
  totalAffectedOrdersCount: number;
  affectedOrdersByPriority: Record<OrderPriority, number>;
}

export interface RmTransactionSummary {
  id: number;
  delta: number;
  reason: string | null;
  createdAt: string;
}

// GET /api/materials/:partId — single-part detail bundling threshold/deficit,
// orders currently short on this part, and the last 10 rm_transactions rows
// (materials.service.ts#getMaterialDetail) — the RM Inventory detail page's
// primary data source, so it doesn't need a separate raw rm-inventory fetch.
export interface MaterialPartDetail {
  partId: string;
  partName: string;
  stock: number;
  criticalThreshold: number | null;
  deficit: number | null;
  totalShortQty: number;
  affectedOrders: AffectedOrder[];
  recentTransactions: RmTransactionSummary[];
}

// ---- BOM (Module 1 write side) — GET/POST/PATCH/DELETE /api/bom ----

export type BomUom = "Pcs" | "Set" | "Kg" | "Ltr" | "Mtr";

// Raw bom_components row — qtyPerUnit is a Prisma Decimal NOT Number()-
// converted server-side (bom.service.ts returns prisma rows as-is), so it
// arrives as a numeric string over JSON, same pattern as RmInventoryRow.
// partId is nullable — a BOM row with no linked RM Inventory part is a real,
// documented state (see README), not an error state to guard against.
export interface BomComponentRow {
  id: number;
  modelRef: string;
  uom: BomUom;
  partName: string;
  qtyPerUnit: string;
  partId: string | null;
  createdAt: string;
}

export interface CreateBomComponentPayload {
  modelRef: string;
  partName: string;
  uom?: BomUom;
  qtyPerUnit?: number;
  partId?: string;
}

export interface UpdateBomComponentPayload {
  partName?: string;
  uom?: BomUom;
  qtyPerUnit?: number;
  partId?: string;
}

export interface BulkImportBomItem {
  partName: string;
  uom?: BomUom;
  qtyPerUnit?: number;
  partId?: string;
}

export interface BulkImportBomPayload {
  modelRef: string;
  items: BulkImportBomItem[];
}

// ---- BOM Explosion (Module 5) — GET /api/bom-explosion/sku/:sku ----

// Every numeric field here IS Number()-converted server-side
// (bomExplosionEngine.ts/bomExplosion.service.ts) — plain JS numbers.
export interface BomExplosionLine {
  partId: string | null;
  partName: string;
  qtyPerUnit: number;
  requiredQty: number;
  sourceSku: string;
  level: number;
}

// Ad-hoc "what-if" explosion — never persisted, never tied to a real order
// (contrast with Module 5's other endpoint, GET /api/bom-explosion/order/:orderId,
// which IS a real, cached, order-tied snapshot — not used by this feature).
export interface SkuExplosionResult {
  sku: string;
  qty: number;
  lines: BomExplosionLine[];
  totalLines: number;
  maxDepthReached: number;
}

// ---- Products (Module 1) — for the create-order SKU picker ----

export interface Product {
  modelId: string;
  modelName: string;
  productType: string;
  sku: string;
  // Decimal columns, not converted server-side — serialize as strings over
  // JSON (verified against a live GET /api/products response; see the
  // OrderSchedule comment above for the same pattern). Number(...) at
  // render time if ever displayed.
  taktTimeSec: string;
  manpowerRequired: number;
  noOfStations: number;
  changeoverTimeMin: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductPayload {
  modelId: string;
  modelName: string;
  productType: string;
  sku: string;
  taktTimeSec: number;
  manpowerRequired: number;
  noOfStations: number;
  changeoverTimeMin?: number;
  notes?: string;
}

export interface UpdateProductPayload {
  modelName?: string;
  productType?: string;
  sku?: string;
  taktTimeSec?: number;
  manpowerRequired?: number;
  noOfStations?: number;
  changeoverTimeMin?: number | null;
  notes?: string | null;
}

// ---- Lines (Module 1) — for the schedule table's line filter ----

export interface Line {
  lineId: string;
  lineName: string;
  maxWorkers: number;
  efficiencyPct: string; // Decimal — same serialize-as-string pattern as Product's fields
  status: "Active" | "Offline";
  notes: string | null;
  capPerDay: string | null;
  // Compatible product types (lines.service.ts#toLineOutput flattens the
  // line_product_compatibility join table into this array) — was missing
  // from this type even though the backend has always returned it; needed
  // now to filter Daily Logs' model picker to a line's compatible products.
  productTypes: string[];
}

export interface CreateLinePayload {
  lineId: string;
  lineName: string;
  maxWorkers: number;
  efficiencyPct: number;
  status?: "Active" | "Offline";
  notes?: string;
  capPerDay?: number;
  productTypes?: string[];
}

export interface UpdateLinePayload {
  lineName?: string;
  maxWorkers?: number;
  efficiencyPct?: number;
  status?: "Active" | "Offline";
  notes?: string | null;
  capPerDay?: number | null;
  productTypes?: string[];
}

// ---- Machines (Client Flow Part 1) — GET/POST/PATCH/DELETE /api/machines ----
//
// A Line can have several Machines. At least one of the three capacity
// fields is required by the backend (Zod-layer only, not a DB constraint);
// if more than one is set, none are reconciled against each other — see
// ppc-backend README "Machine master data".

export type MachineStatus = "Active" | "Offline" | "Maintenance";

export interface Machine {
  id: number;
  machineId: string;
  machineName: string;
  lineId: string;
  capacityPerHour: string | null; // Decimal — serialize-as-string pattern
  capacityPerShift: string | null;
  capacityPerDay: string | null;
  status: MachineStatus;
  notes: string | null;
  // The backend includes the parent line's basic info directly so the UI
  // doesn't need a second lookup for the table's Line column — unlike
  // HrTeamRow below, which only carries lineId and is resolved client-side.
  line: { lineId: string; lineName: string };
}

export interface CreateMachinePayload {
  machineId: string;
  machineName: string;
  lineId: string;
  capacityPerHour?: number;
  capacityPerShift?: number;
  capacityPerDay?: number;
  status?: MachineStatus;
  notes?: string;
}

export interface UpdateMachinePayload {
  machineName?: string;
  lineId?: string;
  capacityPerHour?: number | null;
  capacityPerShift?: number | null;
  capacityPerDay?: number | null;
  status?: MachineStatus;
  notes?: string | null;
}

// ---- HR Teams (Module 1) — GET/POST/PATCH/DELETE /api/hr-teams ----

// No lineName denormalized on this row (unlike DailyProductionLog) —
// resolve a display name client-side against the already-loaded lines
// list (see hr-teams-page.tsx), same cross-reference pattern Daily Logs'
// list page uses for its own line/model columns.
export interface HrTeamRow {
  teamId: string;
  teamName: string;
  lineId: string | null;
  workers: number;
  skill: string | null;
  attendancePct: string | null; // Decimal — serialize-as-string pattern
  shift: string | null;
  notes: string | null;
}

export interface CreateHrTeamPayload {
  teamId: string;
  teamName: string;
  lineId?: string;
  workers: number;
  skill?: string;
  attendancePct?: number;
  shift?: string;
  notes?: string;
}

export interface UpdateHrTeamPayload {
  teamName?: string;
  lineId?: string | null;
  workers?: number;
  skill?: string | null;
  attendancePct?: number | null;
  shift?: string | null;
  notes?: string | null;
}

// ---- Scheduling run (Module 10) — POST /api/scheduling/run ----

export type UnscheduledReason = "no_compatible_line" | "no_feasible_line";

// The pure scheduling engine's own output shape (schedulingEngine.ts) —
// note `status` here is the space-separated human label ("On Track" /
// "At Risk"), NOT the JS-safe DB-mapped form OrderSchedule.status uses
// above. Verified live against both endpoints — these are genuinely two
// different string representations of the same concept, not a typo.
export interface ScheduledAssignment {
  orderId: string;
  sku: string;
  productType: string;
  qty: number;
  lineId: string;
  lineName: string;
  dailyOutput: number;
  workersPresent: number;
  workersRequired: number;
  daysNeeded: number;
  startDate: string;
  estEndDate: string;
  dueDate: string | null;
  slackDays: number | null;
  status: "On Track" | "At Risk";
}

export interface UnscheduledOrderResult {
  orderId: string;
  reason: UnscheduledReason;
}

export interface FailedAssignment {
  orderId: string;
  error: string;
}

export interface RunSchedulingSummary {
  totalEligible: number;
  scheduledCount: number;
  unscheduledCount: number;
  failedCount: number;
}

export interface RunSchedulingResult {
  scheduled: ScheduledAssignment[];
  unscheduled: UnscheduledOrderResult[];
  failed: FailedAssignment[];
  summary: RunSchedulingSummary;
}

// ---- Purchase Requisitions (Module 9) — GET/POST/PATCH /api/purchase-requisitions ----

// Line item Decimal columns are NOT Number()-converted server-side
// (purchaseRequisitions.service.ts returns Prisma rows as-is) — same
// serialize-as-string pattern as RmInventoryRow/OrderSchedule/Product above.
export interface PrLineItem {
  id: number;
  prId: number;
  partId: string | null;
  partName: string;
  totalRequiredQty: string;
  currentStockQty: string;
  netRequirementQty: string;
}

export interface PrStatusHistoryEntry {
  id: number;
  prId: number;
  oldStatus: PrStatus | null;
  newStatus: PrStatus;
  changedBy: string | null;
  changedAt: string;
}

// GET /api/purchase-requisitions/:prId — the full document.
export interface PurchaseRequisition {
  id: number;
  prNumber: string;
  status: PrStatus;
  generatedBy: string | null;
  generatedAt: string;
  notes: string | null;
  lineItems: PrLineItem[];
  statusHistory: PrStatusHistoryEntry[];
}

// GET /api/purchase-requisitions — bare rows (no lineItems/statusHistory)
// plus a line-item count, so the list table can show it without fetching
// every PR's full detail.
export interface PurchaseRequisitionListItem {
  id: number;
  prNumber: string;
  status: PrStatus;
  generatedBy: string | null;
  generatedAt: string;
  notes: string | null;
  lineItemCount: number;
}

// POST /api/purchase-requisitions/generate — either nothing to buy
// (created: false, purchaseRequisition: null, a good outcome not an error)
// or the newly created PR.
export interface GeneratePrResult {
  created: boolean;
  message: string;
  purchaseRequisition: PurchaseRequisition | null;
}

// PATCH /api/purchase-requisitions/:prId/status
export interface UpdatePrStatusResult {
  purchaseRequisition: PurchaseRequisition;
  message: string;
  /** Fulfilled-only: line items with no linked rm_inventory part, skipped from the stock credit. */
  skippedLineItemsCount: number;
}

// ---- QC (Module 13) — GET/POST /api/qc ----

// GET /api/qc/batches — bare row plus a flattened testingPlanName (the
// list endpoint includes just the plan's name, not its full row — see
// qc.service.ts#listQcBatches).
export interface QcBatchRow {
  id: number;
  orderId: string;
  sku: string;
  batchNumber: string;
  barcodeValue: string;
  serialRangeStart: number;
  serialRangeEnd: number;
  testingPlanId: number | null;
  testingPlanName: string | null;
  generatedAt: string;
}

// GET /api/qc/batches/:batchNumber — full detail: order summary + the full
// testing plan row (not just its name).
export interface QcBatchDetail {
  id: number;
  orderId: string;
  sku: string;
  batchNumber: string;
  barcodeValue: string;
  serialRangeStart: number;
  serialRangeEnd: number;
  testingPlanId: number | null;
  generatedAt: string;
  order: {
    orderId: string;
    client: string;
    sku: string;
    product: string;
    qty: number;
    status: OrderStatus;
    dueDate: string | null;
  };
  testingPlan: TestingPlan | null;
}

// POST /api/qc/generate
export interface GeneratedQcBatch {
  orderId: string;
  batchNumber: string;
  barcodeValue: string;
  serialRangeStart: number;
  serialRangeEnd: number;
  testingPlanId: number | null;
}

export interface SkippedQcBatch {
  orderId: string;
  reason: string;
}

export interface FailedQcBatch {
  orderId: string;
  error: string;
}

export interface QcGenerationWarning {
  orderId: string;
  message: string;
}

export interface GenerateQcBatchesResult {
  generated: GeneratedQcBatch[];
  skipped: SkippedQcBatch[];
  failed: FailedQcBatch[];
  warnings: QcGenerationWarning[];
  summary: {
    totalEligible: number;
    generatedCount: number;
    skippedCount: number;
    failedCount: number;
  };
}

// ---- Testing Plans (Module 13 master data) — GET/POST/PATCH/DELETE /api/qc/testing-plans ----

export interface TestingPlan {
  id: number;
  productType: string;
  planName: string;
  description: string | null;
}

export interface CreateTestingPlanPayload {
  productType: string;
  planName: string;
  description?: string;
}

export interface UpdateTestingPlanPayload {
  productType?: string;
  planName?: string;
  description?: string | null;
}

// ---- Daily Logs (Module 3 + Module 4) — GET/POST/PATCH /api/daily-logs ----

export const DOWNTIME_REASONS = [
  "Material Not Available",
  "Machine Breakdown",
  "Changeover Activity",
  "Operator Unavailable",
  "Power Failure",
  "Other",
] as const;

export type DowntimeReason = (typeof DOWNTIME_REASONS)[number];

// Decimal columns (minutes) are NOT Number()-converted server-side — same
// serialize-as-string pattern as elsewhere in this file.
export interface DowntimeEntry {
  id: number;
  logId: string;
  reason: string;
  minutes: string;
  notes: string | null;
}

// GET /api/daily-logs, GET /api/daily-logs/:logId — dailyLogs.service.ts's
// toOutput() renames the Prisma relation downtimeLogs -> downtimeEntries.
// attendancePct/taktTimeOverride/plannedMinutes/totalOutputQty/goodQty are
// Decimal columns returned as-is (numeric strings); activeLinesCount/
// totalEmployees/presentEmployees/absentEmployees/manpowerOverride are
// plain Int columns (real numbers).
export interface DailyLog {
  logId: string;
  logDate: string;
  shift: string | null;
  lineId: string | null;
  lineName: string | null;
  activeLinesCount: number | null;
  modelId: string | null;
  modelName: string | null;
  totalEmployees: number | null;
  presentEmployees: number | null;
  absentEmployees: number | null;
  attendancePct: string | null;
  taktTimeOverride: string | null;
  manpowerOverride: number | null;
  notes: string | null;
  stationAssignments: Record<string, string[]> | null;
  savedBy: string | null;
  savedAt: string;
  plannedMinutes: string | null;
  totalOutputQty: string | null;
  goodQty: string | null;
  downtimeEntries: DowntimeEntry[];
}

export interface DowntimeEntryInput {
  reason: DowntimeReason;
  minutes: number;
  notes?: string;
}

// POST /api/daily-logs — logId/absentEmployees/attendancePct are all
// server-computed, deliberately absent from this type (see
// dailyLogs.schema.ts's createDailyLogSchema — sending them would either be
// ignored or rejected, never trusted as input).
export interface CreateDailyLogPayload {
  logDate: string;
  shift?: string;
  lineId?: string;
  modelId?: string;
  activeLinesCount?: number;
  totalEmployees?: number;
  presentEmployees?: number;
  taktTimeOverride?: number;
  manpowerOverride?: number;
  notes?: string;
  stationAssignments?: Record<string, string[]>;
  downtimeEntries?: DowntimeEntryInput[];
  plannedMinutes?: number;
  totalOutputQty?: number;
  goodQty?: number;
}

// PATCH /api/daily-logs/:logId — every field nullable+optional
// (updateDailyLogSchema's `.partial()` over `.nullable()` fields): omitted
// = leave as-is, null = clear. No downtimeEntries here — downtime entries
// have their own POST/DELETE sub-resource endpoints, not a PATCH field.
export interface UpdateDailyLogPayload {
  shift?: string | null;
  lineId?: string | null;
  modelId?: string | null;
  activeLinesCount?: number | null;
  totalEmployees?: number | null;
  presentEmployees?: number | null;
  taktTimeOverride?: number | null;
  manpowerOverride?: number | null;
  notes?: string | null;
  stationAssignments?: Record<string, string[]> | null;
  plannedMinutes?: number | null;
  totalOutputQty?: number | null;
  goodQty?: number | null;
}

// GET /api/daily-logs/summary/downtime-by-reason
export interface DowntimeByReasonRow {
  reason: string;
  totalMinutes: number;
}

// ---- OEE (Module 4) — GET /api/oee/* ----

// GET /api/oee, GET /api/oee/:logId — one row per daily log, the same
// calculateOee() output the backend also uses to derive OeeAggregateResult
// above. `notes` is the honest-null explanation list (e.g. "plannedMinutes
// is not set on this log...") — surface it directly rather than just
// showing a bare dash for a null pct.
export interface OeeRow {
  logId: string;
  logDate: string;
  shift: string | null;
  lineId: string | null;
  lineName: string | null;
  modelId: string | null;
  modelName: string | null;
  plannedMinutes: number | null;
  totalOutputQty: number | null;
  goodQty: number | null;
  downtimeMinutes: number;
  runTimeMinutes: number | null;
  availabilityPct: number | null;
  standardOutput: number | null;
  performancePct: number | null;
  qualityPct: number | null;
  oeePct: number | null;
  notes: string[];
}

// GET /api/oee/by-line
export interface OeeByLineResult extends OeeAggregateResult {
  lineId: string | null;
  lineName: string | null;
}

// ---- Risk (Module 11) — GET /api/risk/* ----

// GET /api/risk/at-risk-orders — reads the same production_schedule data
// Scheduling's own list does, but via a dedicated, purpose-built endpoint:
// sorted worst-first (slackDays asc) and includes priority (which the
// generic schedule list doesn't join in), rather than being a generic
// paginated schedule view filtered client-side.
export interface AtRiskOrderRow {
  orderId: string;
  client: string;
  priority: OrderPriority;
  dueDate: string | null;
  lineId: string | null;
  lineName: string | null;
  qty: number;
  dailyOutput: number | null;
  daysNeeded: number | null;
  startDate: string | null;
  estEndDate: string | null;
  slackDays: number | null;
  status: ScheduleStatusLabel;
}

// GET /api/risk/summary
export interface RiskSummary {
  totalAtRisk: number;
  totalOnTrack: number;
  atRiskByPriority: Record<OrderPriority, number>;
}

// ---- Search (Module 12) — GET /api/search?q=...&limit=... ----

// pendingQty is always null, with pendingQtyNote explaining why (production
// logs aren't tied to specific orders yet) — an honest, documented gap, not
// something to fabricate a number for. Same for expectedCompletionDate
// when the order hasn't been scheduled.
export interface OrderSearchResult {
  orderId: string;
  client: string;
  sku: string;
  product: string;
  qty: number;
  dueDate: string | null;
  currentStage: string;
  materialStatus: string | null;
  pendingQty: null;
  pendingQtyNote: string;
  expectedCompletionDate: string | null;
  expectedCompletionDateNote: string | null;
}

export interface ProductSearchResult {
  modelId: string;
  sku: string;
  modelName: string;
  productType: string;
}

export interface LineSearchResult {
  lineId: string;
  lineName: string;
}

export interface SearchResponse {
  query: string;
  orders: OrderSearchResult[];
  products: ProductSearchResult[];
  lines: LineSearchResult[];
}
