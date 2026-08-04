import { cn } from "@/lib/utils";
import logoUrl from "@/assets/logo.jpeg";

// The real Chauhan MIS Automation Services logo — a detailed circular mark
// on its own opaque white background (a JPEG, so no transparency channel).
// Wrapped in a white, bordered circular chip rather than placed directly on
// a surface: the border keeps the chip legible against light-theme surfaces
// (themselves near-white) instead of blending away edgeless, and the white
// fill matches the logo's own background exactly, so there's no visible
// seam against either theme's panels. Shared by the instrument rail's
// header and the auth pages' split-screen shell so the treatment can't
// drift between the two places it appears.
export function BrandMark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizeClass = size === "lg" ? "size-14" : size === "sm" ? "size-8" : "size-9";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-surface-border bg-white shadow-sm",
        sizeClass,
        className,
      )}
    >
      <img src={logoUrl} alt="Chauhan MIS Automation Services" className="h-full w-full object-cover" />
    </span>
  );
}
