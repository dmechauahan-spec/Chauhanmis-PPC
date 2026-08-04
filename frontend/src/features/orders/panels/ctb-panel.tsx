import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useCtbForOrder } from "../use-order-cross-refs";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/format";
import type { Order } from "@/types/api";

// The badge reads straight off the order record's own ctbStatus/
// ctbCheckedAt (already fetched for the page — no extra call for the
// common "Clear" or "Never Checked" cases). The shortage breakdown table
// is the one thing that genuinely needs the CTB module's own endpoint, so
// that's only called when we already know from the order record there's a
// shortage to explain — viewing a healthy order's detail page never
// triggers a live CTB re-evaluation as a side effect.
export function CtbPanel({ order }: { order: Order }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Clear to Build</CardTitle>
          <CardDescription>Material availability against this order&apos;s BOM</CardDescription>
        </div>
        <CtbStatusBadge order={order} />
      </CardHeader>
      <CardContent>
        {order.ctbStatus === "RmShortage" ? (
          <ShortageTable orderId={order.orderId} />
        ) : order.ctbStatus === "ClearToBuild" ? (
          <p className="text-sm text-ink-muted">
            All required material is available.
            {order.ctbCheckedAt && ` Checked ${formatDateTime(order.ctbCheckedAt)}.`}
          </p>
        ) : (
          <EmptyState
            icon={ShieldQuestion}
            title="Never checked"
            description="This order hasn't gone through a Clear-to-Build evaluation yet."
          />
        )}
      </CardContent>
    </Card>
  );
}

function CtbStatusBadge({ order }: { order: Order }) {
  if (order.ctbStatus === "RmShortage") {
    return (
      <Badge variant="critical">
        <ShieldAlert className="size-3" />
        RM Shortage
      </Badge>
    );
  }
  if (order.ctbStatus === "ClearToBuild") {
    return (
      <Badge variant="success">
        <ShieldCheck className="size-3" />
        Clear to Build
      </Badge>
    );
  }
  return (
    <Badge variant="neutral">
      <ShieldQuestion className="size-3" />
      Never Checked
    </Badge>
  );
}

function ShortageTable({ orderId }: { orderId: string }) {
  const { data, isPending, isError } = useCtbForOrder(orderId);

  if (isPending) return <Skeleton className="h-32 w-full" />;
  if (isError || !data) {
    return <p className="text-sm text-status-critical">Couldn&apos;t load the shortage breakdown.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Part</TableHead>
          <TableHead className="text-right">Required</TableHead>
          <TableHead className="text-right">Available</TableHead>
          <TableHead className="text-right">Short</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.shortages.map((s, i) => (
          <TableRow key={s.partId ?? `${s.partName}-${i}`}>
            <TableCell>
              <span className="font-mono">{s.partId ?? s.partName}</span>
              {s.partId && <span className="ml-1.5 text-xs text-ink-muted">{s.partName}</span>}
            </TableCell>
            <TableCell numeric>{s.requiredQty.toLocaleString()}</TableCell>
            <TableCell numeric>{s.availableStock.toLocaleString()}</TableCell>
            <TableCell numeric className="text-status-critical">
              {s.shortQty.toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
