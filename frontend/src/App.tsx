import { Routes, Route, Navigate } from "react-router";
import { AppShell } from "@/components/app-shell/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { LoginPage } from "@/features/auth/login-page";
import { ForgotPasswordPage } from "@/features/auth/forgot-password-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { OrderStatusDashboardPage } from "@/features/order-status-dashboard/order-status-dashboard-page";
import { StyleGuidePage } from "@/features/style-guide/style-guide-page";
import { OrdersListPage } from "@/features/orders/orders-list-page";
import { OrderDetailPage } from "@/features/orders/order-detail-page";
import { CreateOrderPage } from "@/features/orders/create-order-page";
import { SchedulingPage } from "@/features/scheduling/scheduling-page";
import { RmInventoryListPage } from "@/features/rm-inventory/rm-inventory-list-page";
import { RmInventoryDetailPage } from "@/features/rm-inventory/rm-inventory-detail-page";
import { CreateRmInventoryPage } from "@/features/rm-inventory/create-rm-inventory-page";
import { BomPage } from "@/features/bom/bom-page";
import { BomExplosionPage } from "@/features/bom/bom-explosion-page";
import { CtbDashboardPage } from "@/features/ctb/ctb-dashboard-page";
import { MaterialDashboardPage } from "@/features/materials/material-dashboard-page";
import { PrListPage } from "@/features/purchase-requisitions/pr-list-page";
import { PrDetailPage } from "@/features/purchase-requisitions/pr-detail-page";
import { DailyLogsListPage } from "@/features/daily-logs/daily-logs-list-page";
import { DailyLogFormPage } from "@/features/daily-logs/daily-log-form-page";
import { DailyLogDetailPage } from "@/features/daily-logs/daily-log-detail-page";
import { QcBatchesListPage } from "@/features/qc/qc-batches-list-page";
import { QcBatchDetailPage } from "@/features/qc/qc-batch-detail-page";
import { QcInspectionsListPage } from "@/features/qc/qc-inspections-list-page";
import { QcInspectionFormPage } from "@/features/qc/qc-inspection-form-page";
import { QcInspectionDetailPage } from "@/features/qc/qc-inspection-detail-page";
import { TestingPlansPage } from "@/features/qc/testing-plans-page";
import { ProductsPage } from "@/features/admin/products-page";
import { LinesPage } from "@/features/admin/lines-page";
import { MachinesPage } from "@/features/admin/machines-page";
import { HrTeamsPage } from "@/features/admin/hr-teams-page";
import { UsersPage } from "@/features/admin/users-page";
import { OeePage } from "@/features/oee/oee-page";
import { RiskPage } from "@/features/risk/risk-page";
import { WarehousesPage } from "@/features/warehouses/warehouses-page";

// Every route below /-that-isn't-/login renders inside AppShell (rail + top
// bar) behind ProtectedRoute. As of Phase 11, every module from the
// original 14-module spec has a real page here — the last ComingSoon
// stub (Risk) was replaced this phase.
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route
        path="/style-guide"
        element={
          <ProtectedRoute>
            <StyleGuidePage />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/order-status-dashboard" element={<OrderStatusDashboardPage />} />
        <Route path="/orders" element={<OrdersListPage />} />
        <Route path="/orders/new" element={<CreateOrderPage />} />
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        <Route path="/daily-logs" element={<DailyLogsListPage />} />
        <Route path="/daily-logs/new" element={<DailyLogFormPage />} />
        <Route path="/daily-logs/:logId/edit" element={<DailyLogFormPage />} />
        <Route path="/daily-logs/:logId" element={<DailyLogDetailPage />} />
        <Route path="/oee" element={<OeePage />} />
        <Route path="/scheduling" element={<SchedulingPage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="/rm-inventory" element={<RmInventoryListPage />} />
        <Route path="/rm-inventory/new" element={<CreateRmInventoryPage />} />
        <Route path="/rm-inventory/:partId" element={<RmInventoryDetailPage />} />
        <Route path="/bom" element={<BomPage />} />
        <Route path="/bom/explosion" element={<BomExplosionPage />} />
        <Route path="/ctb" element={<CtbDashboardPage />} />
        <Route path="/materials" element={<MaterialDashboardPage />} />
        <Route path="/purchase-requisitions" element={<PrListPage />} />
        <Route path="/purchase-requisitions/:prId" element={<PrDetailPage />} />
        <Route path="/qc-batches" element={<QcBatchesListPage />} />
        <Route path="/qc-batches/:batchNumber" element={<QcBatchDetailPage />} />
        <Route path="/qc-inspections" element={<QcInspectionsListPage />} />
        <Route path="/qc-inspections/new" element={<QcInspectionFormPage />} />
        <Route path="/qc-inspections/:id" element={<QcInspectionDetailPage />} />
        <Route path="/testing-plans" element={<TestingPlansPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/lines" element={<LinesPage />} />
        <Route path="/machines" element={<MachinesPage />} />
        <Route path="/hr-teams" element={<HrTeamsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/warehouses" element={<WarehousesPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
