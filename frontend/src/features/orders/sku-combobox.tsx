import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useProductsForPicker } from "./use-products";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/api";

interface SkuComboboxProps {
  value: string | null;
  onSelect: (product: Product) => void;
  hasError?: boolean;
}

// A real picker over GET /api/products rather than a free-text SKU field —
// guarantees a valid, existing SKU is always what gets submitted, and lets
// the caller auto-populate `product` from the selection instead of asking
// for it separately. cmdk's <Command> handles the search-as-you-type
// filtering itself; the product list is fetched once (staleTime: 60s in
// use-products.ts) rather than re-queried per keystroke.
export function SkuCombobox({ value, onSelect, hasError }: SkuComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const { data: products, isPending } = useProductsForPicker("");
  const selected = products?.find((p) => p.sku === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-ink-faint",
            hasError && "border-status-critical/60",
          )}
        >
          {selected ? (
            <span className="font-mono">
              {selected.sku} <span className="ml-1.5 font-sans text-ink-muted">{selected.modelName}</span>
            </span>
          ) : (
            "Select a SKU…"
          )}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search SKU or model…" />
          <CommandList>
            {isPending && <CommandEmpty>Loading products…</CommandEmpty>}
            {!isPending && <CommandEmpty>No matching product.</CommandEmpty>}
            <CommandGroup>
              {products?.map((product) => (
                <CommandItem
                  key={product.sku}
                  value={`${product.sku} ${product.modelName} ${product.productType}`}
                  onSelect={() => {
                    onSelect(product);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", product.sku === value ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono">{product.sku}</span>
                  <span className="text-ink-muted">{product.modelName}</span>
                  <span className="ml-auto text-xs text-ink-faint">{product.productType}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
