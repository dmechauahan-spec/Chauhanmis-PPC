import * as React from "react";
import { useNavigate } from "react-router";
import { Search, ClipboardList, Package, Factory } from "lucide-react";
import { useSpotlightSearch } from "./use-search";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { ORDER_PIPELINE_STAGES } from "@/lib/order-pipeline";

const STATUS_LABEL: Record<string, string> = Object.fromEntries(ORDER_PIPELINE_STAGES.map((s) => [s.value, s.label]));

// Global command-palette search — reuses the exact cmdk + Popover-family
// primitives SkuCombobox (Phase 2) already established, swapped onto a
// centered Dialog since this is a global overlay, not anchored to one
// field. shouldFilter={false}: results are already ranked server-side
// (resultRanker.ts), cmdk's own client-side fuzzy filter would just
// re-sort what the backend already ordered.
export function SpotlightSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data, isFetching } = useSpotlightSearch(debouncedQuery);

  React.useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function go(path: string) {
    navigate(path);
    setOpen(false);
    setQuery("");
  }

  const trimmed = debouncedQuery.trim();
  const hasQuery = trimmed.length >= 2;
  const hasResults = !!data && (data.orders.length > 0 || data.products.length > 0 || data.lines.length > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-64 items-center gap-2 rounded-md border border-surface-border bg-surface-sunken px-3 py-1.5 text-sm text-ink-faint outline-none transition-colors hover:text-ink-muted focus-visible:ring-2 focus-visible:ring-signal-amber/50"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded-sm border border-surface-border bg-surface-raised px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-faint">
          {navigator.platform.includes("Mac") ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg gap-0 p-0" showClose={false}>
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search orders, products, lines…" value={query} onValueChange={setQuery} />
            <CommandList>
              {!hasQuery ? (
                <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
              ) : isFetching && !data ? (
                <CommandEmpty>Searching…</CommandEmpty>
              ) : !hasResults ? (
                <CommandEmpty>No results for &quot;{trimmed}&quot;.</CommandEmpty>
              ) : (
                <>
                  {data && data.orders.length > 0 && (
                    <CommandGroup heading="Orders">
                      {data.orders.map((o) => (
                        <CommandItem key={o.orderId} value={o.orderId} onSelect={() => go(`/orders/${o.orderId}`)}>
                          <ClipboardList className="size-4 text-ink-faint" />
                          <span className="font-mono text-signal-amber">{o.orderId}</span>
                          <span className="text-ink-muted">{o.client}</span>
                          <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-faint">
                            <Badge variant="neutral">{STATUS_LABEL[o.currentStage] ?? o.currentStage}</Badge>
                            {o.dueDate && <span>Due {formatDate(o.dueDate)}</span>}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {data && data.products.length > 0 && (
                    <CommandGroup heading="Products">
                      {data.products.map((p) => (
                        <CommandItem
                          key={p.modelId}
                          value={p.modelId}
                          onSelect={() => go(`/products?search=${encodeURIComponent(p.sku)}`)}
                        >
                          <Package className="size-4 text-ink-faint" />
                          <span className="font-mono">{p.sku}</span>
                          <span className="text-ink-muted">{p.modelName}</span>
                          <span className="ml-auto text-xs text-ink-faint">{p.productType}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {data && data.lines.length > 0 && (
                    <CommandGroup heading="Lines">
                      {data.lines.map((l) => (
                        <CommandItem key={l.lineId} value={l.lineId} onSelect={() => go("/lines")}>
                          <Factory className="size-4 text-ink-faint" />
                          <span className="font-mono">{l.lineId}</span>
                          <span className="text-ink-muted">{l.lineName}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
