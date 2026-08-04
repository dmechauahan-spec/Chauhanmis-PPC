import { PipelineStepper } from "@/components/pipeline-stepper";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useTheme } from "@/lib/theme-context";
import type { OrderStatus } from "@/lib/order-pipeline";

// Displayed values only (the swatches themselves paint via the live CSS
// variables) — kept per-theme here so the printed hex next to each swatch
// doesn't lie once data-theme flips. See src/index.css for the source of
// truth these mirror.
const SWATCHES: { name: string; className: string; dark: string; light: string }[] = [
  { name: "surface-base", className: "bg-surface-base", dark: "#0E1420", light: "#F4F5F7" },
  { name: "surface-raised", className: "bg-surface-raised", dark: "#161D2C", light: "#FFFFFF" },
  { name: "surface-sunken", className: "bg-surface-sunken", dark: "#0A0F18", light: "#E8EAED" },
  { name: "surface-border", className: "bg-surface-border", dark: "#232C40", light: "#D8DCE3" },
  { name: "ink-primary", className: "bg-ink-primary", dark: "#E8ECF2", light: "#1A2130" },
  { name: "ink-muted", className: "bg-ink-muted", dark: "#8B96A8", light: "#5B6472" },
  { name: "ink-faint", className: "bg-ink-faint", dark: "#4E5A70", light: "#9AA3B2" },
  { name: "signal-amber", className: "bg-signal-amber", dark: "#F5A623", light: "#9F6200" },
  { name: "status-critical", className: "bg-status-critical", dark: "#E5484D", light: "#D62C31" },
  { name: "status-success", className: "bg-status-success", dark: "#3DD68C", light: "#198051" },
  { name: "status-info", className: "bg-status-info", dark: "#4C9FE8", light: "#2D74B4" },
];

const SAMPLE_ORDERS: { orderId: string; sku: string; qty: number; dueDate: string; status: OrderStatus }[] = [
  { orderId: "SO-1014", sku: "SP10B2", qty: 500, dueDate: "2026-08-12", status: "Running" },
  { orderId: "SO-1015", sku: "AF20X", qty: 300, dueDate: "2026-08-18", status: "PendingRM" },
  { orderId: "SO-1016", sku: "AFO15Y", qty: 150, dueDate: "2026-08-09", status: "DispatchReady" },
  { orderId: "SO-1017", sku: "SP10B2", qty: 220, dueDate: "2026-07-30", status: "Closed" },
];

const STAGE_SAMPLES: OrderStatus[] = ["Open", "PendingRM", "Running", "DispatchReady", "Closed"];

export function StyleGuidePage() {
  const { theme } = useTheme();

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-6 py-10">
      <header>
        <p className="text-xs font-semibold tracking-widest text-signal-amber uppercase">Internal — not user-facing</p>
        <h1 className="font-display text-3xl font-semibold text-ink-primary">Design System</h1>
        <p className="mt-1 text-ink-muted">
          Tokens, type, and the signature components this app is built from. See README "Design System" for rationale.
        </p>
      </header>

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SWATCHES.map((s) => (
            <div key={s.name} className="overflow-hidden rounded-md border border-surface-border">
              <div className={`h-16 ${s.className}`} />
              <div className="bg-surface-raised px-3 py-2">
                <p className="font-mono text-xs text-ink-primary">{s.name}</p>
                <p className="font-mono text-xs text-ink-muted">{theme === "dark" ? s.dark : s.light}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-widest text-ink-muted uppercase">
              Display / headings — Space Grotesk
            </p>
            <div className="flex flex-col gap-2 rounded-md border border-surface-border bg-surface-raised p-5">
              <p className="font-display text-3xl font-semibold text-ink-primary">Overview 3xl / semibold</p>
              <p className="font-display text-2xl font-semibold text-ink-primary">Overview 2xl / semibold</p>
              <p className="font-display text-xl font-medium text-ink-primary">Overview xl / medium</p>
              <p className="font-display text-lg font-medium text-ink-primary">Overview lg / medium</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-widest text-ink-muted uppercase">Body / UI — Inter</p>
            <div className="flex flex-col gap-2 rounded-md border border-surface-border bg-surface-raised p-5">
              <p className="text-base text-ink-primary">Base — Production Planning &amp; Control, at a glance.</p>
              <p className="text-sm text-ink-primary">Small — used for table cells, form labels, dense UI text.</p>
              <p className="text-sm text-ink-muted">Muted — secondary text, timestamps, helper copy.</p>
              <p className="text-xs text-ink-faint">Faint — disabled state, placeholders.</p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-widest text-ink-muted uppercase">
              Data / monospace — JetBrains Mono
            </p>
            <div className="flex flex-wrap gap-4 rounded-md border border-surface-border bg-surface-raised p-5 font-mono text-sm text-ink-primary">
              <span>SO-1014</span>
              <span>SP10B2</span>
              <span>BATCH-20260802-001</span>
              <span className="tabular-nums">1,284 units</span>
              <span className="tabular-nums">94.2%</span>
              <span className="tabular-nums">2026-08-02 14:03</span>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Status badges">
        <div className="flex flex-wrap gap-3">
          <Badge variant="success">On Track</Badge>
          <Badge variant="critical">RM Shortage</Badge>
          <Badge variant="info">Scheduled</Badge>
          <Badge variant="amber">Needs Attention</Badge>
          <Badge variant="neutral">Draft</Badge>
        </div>
      </Section>

      <Section title="Pipeline stepper — the signature component">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Full — order detail view</CardTitle>
              <CardDescription>Same component, five different current stages</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {STAGE_SAMPLES.map((stage) => (
                <div key={stage}>
                  <p className="mb-2 font-mono text-xs text-ink-muted">currentStage=&quot;{stage}&quot;</p>
                  <PipelineStepper currentStage={stage} size="full" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Compact — table rows &amp; dashboard</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {STAGE_SAMPLES.map((stage) => (
                <div key={stage} className="flex items-center gap-3">
                  <span className="w-28 font-mono text-xs text-ink-muted">{stage}</span>
                  <PipelineStepper currentStage={stage} size="compact" className="max-w-40" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Data table — numeric convention">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Pipeline</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {SAMPLE_ORDERS.map((order) => (
              <TableRow key={order.orderId}>
                <TableCell className="font-mono text-signal-amber">{order.orderId}</TableCell>
                <TableCell className="font-mono">{order.sku}</TableCell>
                <TableCell numeric>{order.qty.toLocaleString()}</TableCell>
                <TableCell className="font-mono text-ink-muted">{order.dueDate}</TableCell>
                <TableCell>
                  <PipelineStepper currentStage={order.status} size="compact" className="max-w-32" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 font-display text-sm font-semibold tracking-wide text-ink-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}
