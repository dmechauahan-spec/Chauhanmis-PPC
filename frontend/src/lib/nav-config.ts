import type { LucideIcon } from "lucide-react";
import {
  Gauge,
  ClipboardList,
  NotebookPen,
  CalendarClock,
  TriangleAlert,
  Boxes,
  ListTree,
  ShieldCheck,
  LayoutGrid,
  FileText,
  ScanBarcode,
  ClipboardCheck,
  Microscope,
  Package,
  Factory,
  Wrench,
  Users2,
  UserCog,
  TrendingUp,
  Table2,
  Warehouse as WarehouseIcon,
  PackageCheck,
  ShoppingCart,
  Truck,
  LayoutDashboard,
} from "lucide-react";
import type { UserRole } from "@/types/api";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Omit for "every authenticated role" — see note below. */
  roles?: UserRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Nav visibility mirrors ppc-backend's actual permission matrix
// (config/permissions.ts): StoreManager and ProductionManager can both READ
// every module — the role split only ever restricts WRITE actions within a
// page, not which pages exist. So almost nothing here is actually
// role-gated; User Management is the one real exception (Admin-only, even
// to read). This nav check is a UX nicety only — hiding a link a role
// can't act on — NOT a security boundary; the backend's authenticate +
// authorize middleware is the real enforcement, on every request,
// regardless of what this file shows or hides.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", to: "/", icon: Gauge },
      // Client Flow Part 5 — the client's centerpiece screen (every active
      // order's Order -> Line -> Machine -> Plan -> Actual -> QC -> Balance
      // -> Expected Completion, one row each). Placed second in Overview
      // (top of the whole rail), not buried in Production, so it gets real
      // visual priority rather than reading as just another module page.
      { label: "Order Status", to: "/order-status-dashboard", icon: Table2 },
    ],
  },
  {
    label: "Production",
    items: [
      { label: "Orders", to: "/orders", icon: ClipboardList },
      { label: "Daily Logs", to: "/daily-logs", icon: NotebookPen },
      { label: "OEE", to: "/oee", icon: TrendingUp },
      { label: "Scheduling", to: "/scheduling", icon: CalendarClock },
      { label: "Risk", to: "/risk", icon: TriangleAlert },
    ],
  },
  {
    label: "Materials",
    items: [
      { label: "RM Inventory", to: "/rm-inventory", icon: Boxes },
      { label: "BOM", to: "/bom", icon: ListTree },
      { label: "CTB", to: "/ctb", icon: ShieldCheck },
      { label: "Material Dashboard", to: "/materials", icon: LayoutGrid },
      { label: "Purchase Requisitions", to: "/purchase-requisitions", icon: FileText },
    ],
  },
  {
    label: "Quality",
    items: [
      { label: "QC Batches", to: "/qc-batches", icon: ScanBarcode },
      // Distinct icon from QC Batches (barcode/traceability) and Testing
      // Plans (clipboard/checklist) so all three don't blur together at a
      // glance — see README "QC Batches vs. QC Inspections".
      { label: "QC Inspections", to: "/qc-inspections", icon: Microscope },
      { label: "Testing Plans", to: "/testing-plans", icon: ClipboardCheck },
    ],
  },
  // FG Module (Finished Goods) — a separate 5-part module, its own nav
  // group rather than folded into Production/Materials/Admin: it's a
  // distinct end-to-end flow (Warehouse -> FG Batch -> Reservation ->
  // Dispatch -> Dashboard) with its own audience overlap across both
  // StoreManager and ProductionManager, not a natural fit under any one
  // existing group. See ppc-backend README "FG Module Part 5" for the
  // module's own closing summary.
  {
    label: "Finished Goods",
    items: [
      { label: "FG Dashboard", to: "/fg-dashboard", icon: LayoutDashboard },
      { label: "FG Batches", to: "/fg-batches", icon: PackageCheck },
      { label: "Sales Orders", to: "/sales-orders", icon: ShoppingCart },
      { label: "Dispatch", to: "/fg-dispatches", icon: Truck },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Products", to: "/products", icon: Package },
      { label: "Lines", to: "/lines", icon: Factory },
      { label: "Machines", to: "/machines", icon: Wrench },
      { label: "Warehouses", to: "/warehouses", icon: WarehouseIcon },
      { label: "HR Teams", to: "/hr-teams", icon: Users2 },
      { label: "Users", to: "/users", icon: UserCog, roles: ["Admin"] },
    ],
  },
];

export function isNavItemVisible(item: NavItem, role: UserRole): boolean {
  if (!item.roles) return true;
  return item.roles.includes(role);
}
