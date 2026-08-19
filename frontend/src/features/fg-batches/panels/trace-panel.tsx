import { Link } from "react-router";
import {
  Factory,
  CalendarClock,
  ListTree,
  Microscope,
  Warehouse as WarehouseIcon,
  BookmarkCheck,
  Truck,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useFgBatchTrace } from "../use-fg-batches";
import { QcStatusBadge } from "@/features/qc/qc-status-badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

// FG Module Part 5 (final part) — "where did this come from, where did it
// go," at a glance: the client's exact requested chain, rendered as a
// linked sequence of sections rather than a wall of raw JSON. Each section
// is its own small card so the eye can scan section headers top-to-bottom
// (Production -> Product/BOM -> QC -> Warehouse -> Reservation -> Dispatch)
// without needing to parse a nested tree — this IS the trace endpoint's
// entire point, so the render should read as obviously as the data itself.
export function TracePanel({ fgBatchNo }: { fgBatchNo: string }) {
  const { data: trace, isPending, isError } = useFgBatchTrace(fgBatchNo);

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Traceability</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !trace) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Traceability</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-status-critical">Couldn&apos;t load the traceability chain.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traceability</CardTitle>
        <CardDescription>Production → Product/BOM → QC → Warehouse → Reservation → Dispatch</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <TraceStep icon={Factory} label="Production">
          <Link to={`/orders/${trace.production.order.orderId}`} className="font-mono text-signal-amber hover:underline">
            {trace.production.order.orderId}
          </Link>
          <span className="text-ink-muted"> · {trace.production.order.client}</span>
          <div className="mt-1 text-xs text-ink-muted">
            {trace.production.order.product} · Qty {formatNumber(trace.production.order.qty)} · {trace.production.order.status}
          </div>
        </TraceStep>

        <TraceStep icon={CalendarClock} label="Schedule">
          {trace.production.schedule ? (
            <div className="text-sm">
              <span>{trace.production.schedule.lineName ?? "No line assigned"}</span>
              <span className="ml-1.5 text-xs text-ink-muted">
                {trace.production.schedule.startDate ? formatDate(trace.production.schedule.startDate) : "—"}
                {" → "}
                {trace.production.schedule.estEndDate ? formatDate(trace.production.schedule.estEndDate) : "—"}
              </span>
              <Badge variant={trace.production.schedule.status === "AtRisk" ? "critical" : "neutral"} className="ml-2">
                {trace.production.schedule.status}
              </Badge>
            </div>
          ) : (
            <span className="text-sm text-ink-faint">This production order was never scheduled.</span>
          )}
        </TraceStep>

        <TraceStep icon={ListTree} label="Product / BOM">
          {trace.product ? (
            <div>
              <span className="font-mono">{trace.product.sku}</span>
              <span className="ml-1.5 text-ink-muted">{trace.product.modelName}</span>
              {trace.product.bom.length === 0 ? (
                <p className="mt-1 text-xs text-ink-faint">No BOM components recorded for this SKU.</p>
              ) : (
                <ul className="mt-1.5 flex flex-col gap-0.5">
                  {trace.product.bom.map((c) => (
                    <li key={c.id} className="flex items-center justify-between text-xs text-ink-muted">
                      <span>{c.partName}</span>
                      <span className="font-mono">
                        {c.qtyPerUnit} {c.uom}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <span className="text-sm text-ink-faint">This batch&apos;s SKU no longer resolves to a Product record.</span>
          )}
        </TraceStep>

        <TraceStep icon={Microscope} label="QC Inspection">
          <div className="flex items-center gap-2">
            <span className="text-sm">{formatDate(trace.qc.inspectionDate)}</span>
            <QcStatusBadge status={trace.qc.qcStatus} />
          </div>
          <div className="mt-1 text-xs text-ink-muted">
            Produced {formatNumber(trace.qc.producedQty)} · Passed {formatNumber(trace.qc.passedQty)} · Rejected{" "}
            {formatNumber(trace.qc.rejectedQty)} · Rework {formatNumber(trace.qc.reworkQty)} · {trace.qc.inspectorName}
          </div>
        </TraceStep>

        <TraceStep icon={WarehouseIcon} label={`Warehouse History (${trace.warehouseHistory.length})`}>
          {trace.warehouseHistory.length === 0 ? (
            <span className="text-sm text-ink-faint">No movements recorded.</span>
          ) : (
            <ol className="flex flex-col gap-1">
              {trace.warehouseHistory.map((m) => (
                <li key={m.id} className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <ChevronRight className="size-3 shrink-0 text-ink-faint" />
                  <span className="text-ink-primary">{m.movementType}</span>
                  <span>{formatDateTime(m.createdAt)}</span>
                  {(m.fromLocation || m.toLocation) && (
                    <span className="font-mono">
                      {m.fromLocation ?? "—"} → {m.toLocation ?? "—"}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </TraceStep>

        <TraceStep icon={BookmarkCheck} label={`Reservations (${trace.reservations.length})`}>
          {trace.reservations.length === 0 ? (
            <span className="text-sm text-ink-faint">No reservations against this batch.</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {trace.reservations.map((r) => (
                <li key={r.id} className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <ChevronRight className="size-3 shrink-0 text-ink-faint" />
                  <Link to={`/sales-orders/${r.salesOrder.salesOrderNo}`} className="font-mono text-signal-amber hover:underline">
                    {r.salesOrder.salesOrderNo}
                  </Link>
                  <span>{formatNumber(r.reservedQty)} · {r.status}</span>
                </li>
              ))}
            </ul>
          )}
        </TraceStep>

        <TraceStep icon={Truck} label={`Dispatches (${trace.dispatches.length})`} last>
          {trace.dispatches.length === 0 ? (
            <span className="text-sm text-ink-faint">Nothing has shipped from this batch yet.</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {trace.dispatches.map((d) => (
                <li key={d.id} className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <ChevronRight className="size-3 shrink-0 text-ink-faint" />
                  <Link to={`/fg-dispatches/${d.dispatch.dispatchNo}`} className="font-mono text-signal-amber hover:underline">
                    {d.dispatch.dispatchNo}
                  </Link>
                  <span>{formatNumber(d.quantity)} · {formatDate(d.dispatch.dispatchDate)} · {d.dispatch.dispatchedBy}</span>
                </li>
              ))}
            </ul>
          )}
        </TraceStep>
      </CardContent>
    </Card>
  );
}

function TraceStep({ icon: Icon, label, children, last }: { icon: LucideIcon; label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? "flex gap-3" : "flex gap-3 border-b border-surface-border pb-3"}>
      <div className="flex flex-col items-center">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-surface-border bg-surface-sunken">
          <Icon className="size-3.5 text-signal-amber" strokeWidth={1.85} />
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-surface-border" />}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p className="mb-1 text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
        {children}
      </div>
    </div>
  );
}
