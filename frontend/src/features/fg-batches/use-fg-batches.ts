import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { fgBatchesKeys } from "./query-keys";
import { salesOrdersKeys } from "@/features/sales-orders/query-keys";
import { fgDashboardKeys } from "@/features/fg-dashboard/query-keys";
import type {
  ApiSuccess,
  DispatchEligibleFgBatch,
  FgBatch,
  FgBatchDetail,
  FgBatchTrace,
  FgMovement,
  FgReservation,
  GenerateFgBatchPayload,
  HoldFgBatchPayload,
  PaginatedResult,
  ReserveFgBatchPayload,
  TransferFgBatchPayload,
} from "@/types/api";

export interface FgBatchesListFilters {
  page: number;
  pageSize: number;
  productionOrderId?: string;
  warehouseId?: string;
  qcStatus?: string;
  stockStatus?: string;
  dispatchStatus?: string;
}

function cleanParams(filters: FgBatchesListFilters): Record<string, unknown> {
  const { page, pageSize, productionOrderId, warehouseId, qcStatus, stockStatus, dispatchStatus } = filters;
  return {
    page,
    pageSize,
    ...(productionOrderId ? { productionOrderId } : {}),
    ...(warehouseId ? { warehouseId } : {}),
    ...(qcStatus ? { qcStatus } : {}),
    ...(stockStatus ? { stockStatus } : {}),
    ...(dispatchStatus ? { dispatchStatus } : {}),
  };
}

export function useFgBatchesList(filters: FgBatchesListFilters) {
  const params = cleanParams(filters);
  return useQuery({
    queryKey: fgBatchesKeys.list(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<FgBatch>>>("/fg-batches", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useFgBatch(fgBatchNo: string | undefined) {
  return useQuery({
    queryKey: fgBatchesKeys.detail(fgBatchNo ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<FgBatchDetail>>(`/fg-batches/${encodeURIComponent(fgBatchNo!)}`);
      return res.data.data;
    },
    enabled: !!fgBatchNo,
  });
}

// GET /api/fg-batches/dispatch-eligible — used by the Dispatch creation
// flow's batch picker. salesOrderId, when given, only changes SORT order
// (reserved-for-this-SO batches surface first) — never a filter, so this
// hook always reflects the full eligible set.
export function useDispatchEligibleFgBatches(filters: { page: number; pageSize: number; salesOrderId?: number }) {
  const { page, pageSize, salesOrderId } = filters;
  const params = { page, pageSize, ...(salesOrderId !== undefined ? { salesOrderId } : {}) };
  return useQuery({
    queryKey: fgBatchesKeys.dispatchEligibleList(params),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<DispatchEligibleFgBatch>>>("/fg-batches/dispatch-eligible", { params });
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });
}

// FG Module Part 2 — the full movement ledger for one batch, oldest first.
// A single generous page: a batch's own history realistically never grows
// long enough to need real pagination controls in this UI (same reasoning
// the backend's own README gives for why this endpoint stays paginated at
// all only for consistency, not because any batch actually needs it).
export function useFgMovements(fgBatchNo: string | undefined) {
  return useQuery({
    queryKey: fgBatchesKeys.movements(fgBatchNo ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<FgMovement>>>(
        `/fg-batches/${encodeURIComponent(fgBatchNo!)}/movements`,
        { params: { page: 1, pageSize: 100 } },
      );
      return res.data.data.items;
    },
    enabled: !!fgBatchNo,
  });
}

// FG Module Part 5 — the full traceability chain.
export function useFgBatchTrace(fgBatchNo: string | undefined) {
  return useQuery({
    queryKey: fgBatchesKeys.trace(fgBatchNo ?? ""),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<FgBatchTrace>>(`/fg-batches/${encodeURIComponent(fgBatchNo!)}/trace`);
      return res.data.data;
    },
    enabled: !!fgBatchNo,
  });
}

// Does this QC inspection already have an FG batch? There's no direct
// backend filter for this (listFgBatchesQuerySchema only filters by
// productionOrderId/warehouseId/qcStatus/stockStatus/dispatchStatus, not
// qcInspectionId — see ppc-backend fgBatch.schema.ts) — so this pulls every
// batch for the inspection's own production order (a small, bounded set for
// a single order) and matches client-side, same "fetch a related list,
// filter client-side" convention this app already uses elsewhere (e.g. HR
// Teams resolving a line name against the already-loaded lines list).
export function useFgBatchForInspection(orderId: string | undefined, qcInspectionId: number | undefined) {
  return useQuery({
    queryKey: fgBatchesKeys.forInspection(orderId ?? "", qcInspectionId ?? -1),
    queryFn: async () => {
      const res = await apiClient.get<ApiSuccess<PaginatedResult<FgBatch>>>("/fg-batches", {
        params: { productionOrderId: orderId, page: 1, pageSize: 100 },
      });
      return res.data.data.items.find((b) => b.qcInspectionId === qcInspectionId) ?? null;
    },
    enabled: !!orderId && qcInspectionId !== undefined,
  });
}

function invalidateBatchWrite(queryClient: ReturnType<typeof useQueryClient>, fgBatchNo: string, salesOrderNo?: string) {
  queryClient.invalidateQueries({ queryKey: fgBatchesKeys.detail(fgBatchNo) });
  queryClient.invalidateQueries({ queryKey: fgBatchesKeys.movements(fgBatchNo) });
  queryClient.invalidateQueries({ queryKey: fgBatchesKeys.trace(fgBatchNo) });
  queryClient.invalidateQueries({ queryKey: fgBatchesKeys.lists() });
  queryClient.invalidateQueries({ queryKey: fgBatchesKeys.dispatchEligibleLists() });
  queryClient.invalidateQueries({ queryKey: fgDashboardKeys.all });
  if (salesOrderNo) {
    queryClient.invalidateQueries({ queryKey: salesOrdersKeys.detail(salesOrderNo) });
    queryClient.invalidateQueries({ queryKey: salesOrdersKeys.reservations(salesOrderNo) });
    queryClient.invalidateQueries({ queryKey: salesOrdersKeys.lists() });
  }
}

export function useGenerateFgBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GenerateFgBatchPayload) => {
      const res = await apiClient.post<ApiSuccess<FgBatch>>("/fg-batches/generate", payload);
      return res.data.data;
    },
    onSuccess: (batch) => {
      queryClient.invalidateQueries({ queryKey: fgBatchesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: fgBatchesKeys.dispatchEligibleLists() });
      queryClient.invalidateQueries({ queryKey: fgDashboardKeys.all });
      // The "already converted?" check for the triggering inspection.
      queryClient.invalidateQueries({ queryKey: fgBatchesKeys.forInspection(batch.productionOrderId, batch.qcInspectionId) });
    },
  });
}

export function useTransferFgBatch(fgBatchNo: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: TransferFgBatchPayload) => {
      const res = await apiClient.post<ApiSuccess<FgBatch>>(`/fg-batches/${encodeURIComponent(fgBatchNo)}/transfer`, payload);
      return res.data.data;
    },
    onSuccess: () => invalidateBatchWrite(queryClient, fgBatchNo),
  });
}

export function useHoldFgBatch(fgBatchNo: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: HoldFgBatchPayload) => {
      const res = await apiClient.patch<ApiSuccess<FgBatch>>(`/fg-batches/${encodeURIComponent(fgBatchNo)}/hold`, payload);
      return res.data.data;
    },
    onSuccess: () => invalidateBatchWrite(queryClient, fgBatchNo),
  });
}

export function useReleaseHoldFgBatch(fgBatchNo: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: HoldFgBatchPayload) => {
      const res = await apiClient.patch<ApiSuccess<FgBatch>>(`/fg-batches/${encodeURIComponent(fgBatchNo)}/release-hold`, payload);
      return res.data.data;
    },
    onSuccess: () => invalidateBatchWrite(queryClient, fgBatchNo),
  });
}

export function useReserveFgBatch(fgBatchNo: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ payload, salesOrderNo }: { payload: ReserveFgBatchPayload; salesOrderNo: string }) => {
      const res = await apiClient.post<ApiSuccess<FgBatch>>(`/fg-batches/${encodeURIComponent(fgBatchNo)}/reserve`, payload);
      return { batch: res.data.data, salesOrderNo };
    },
    onSuccess: ({ salesOrderNo }) => invalidateBatchWrite(queryClient, fgBatchNo, salesOrderNo),
  });
}

// POST /api/fg-reservations/:id/cancel — lives here (not sales-orders) since
// FgReservation is fundamentally an FgBatch-and-SalesOrder join row this
// feature already owns the read side of (via the trace panel) — same
// reasoning ppc-backend's own reserveFgBatch/cancelReservation split
// documents. fgBatchNo/salesOrderNo are passed through purely so this
// mutation knows what to invalidate — the backend endpoint itself only
// takes the reservation id. fgBatchNo is OPTIONAL: the Sales Order detail
// page's own Reservations view only has each reservation's bare fgBatchId
// (no backend endpoint resolves a numeric fgBatchId back to its fgBatchNo
// string — GET /fg-batches is only addressable by fgBatchNo, not id), so a
// cancel reached from THAT page can't target a specific batch's cache
// entries precisely and falls back to invalidating the whole fg-batches
// namespace instead — still correct, just less targeted than the FG Batch
// detail page's own Reservations panel (which does have fgBatchNo).
export function useCancelReservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; fgBatchNo?: string; salesOrderNo: string }) => {
      const res = await apiClient.post<ApiSuccess<FgReservation>>(`/fg-reservations/${id}/cancel`);
      return res.data.data;
    },
    onSuccess: (_data, variables) => {
      if (variables.fgBatchNo) {
        invalidateBatchWrite(queryClient, variables.fgBatchNo, variables.salesOrderNo);
      } else {
        queryClient.invalidateQueries({ queryKey: fgBatchesKeys.all });
        queryClient.invalidateQueries({ queryKey: fgDashboardKeys.all });
        queryClient.invalidateQueries({ queryKey: salesOrdersKeys.detail(variables.salesOrderNo) });
        queryClient.invalidateQueries({ queryKey: salesOrdersKeys.reservations(variables.salesOrderNo) });
        queryClient.invalidateQueries({ queryKey: salesOrdersKeys.lists() });
      }
    },
  });
}
