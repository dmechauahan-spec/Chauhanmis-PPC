// Single source of truth for a role's display label — was a local const
// in top-bar.tsx, extracted here so the Users admin page's role badge
// doesn't duplicate it.
export const ROLE_LABEL: Record<string, string> = {
  Admin: "Admin",
  StoreManager: "Store Manager",
  ProductionManager: "Production Manager",
};
