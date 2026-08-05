import * as React from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { InstrumentRailContent } from "./instrument-rail";

/**
 * Below lg, InstrumentRail (the docked 240px rail) is hidden entirely — this
 * hamburger + Sheet drawer is the only way to reach primary nav on
 * mobile/tablet-portrait widths. Renders the exact same nav content
 * (InstrumentRailContent), just inside a slide-over instead of a
 * permanently-docked column.
 */
export function MobileNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation menu" className="lg:hidden">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0" aria-describedby={undefined}>
        {/* Visually redundant with the brand mark already inside
            InstrumentRailContent, but Radix requires a Dialog.Title for
            accessibility (announced by screen readers) even when a sighted
            user never needs to see it separately. */}
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <InstrumentRailContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
