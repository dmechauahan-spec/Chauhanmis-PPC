import { History } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { RmTransactionSummary } from "@/types/api";

// Positive/negative here is a direction, not a verdict — a decrease isn't
// inherently bad (consumed on the line is normal), so this deliberately
// does NOT reuse the critical/red color. Success-green for additions,
// plain ink for reductions, same "color means something specific" rule as
// everywhere else in the design system.
export function TransactionLedgerPanel({ transactions }: { transactions: RmTransactionSummary[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transaction Ledger</CardTitle>
        <CardDescription>Last {transactions.length} stock movements</CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <EmptyState icon={History} title="No stock movements yet" description="Adjustments will appear here once made." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Delta</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-ink-muted">{formatDateTime(t.createdAt)}</TableCell>
                  <TableCell numeric className={t.delta > 0 ? "text-status-success" : "text-ink-primary"}>
                    {t.delta > 0 ? "+" : ""}
                    {formatNumber(t.delta)}
                  </TableCell>
                  <TableCell className="text-ink-muted">{t.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
