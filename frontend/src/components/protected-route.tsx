import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/features/auth/auth-context";
import { Gauge } from "lucide-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-svh items-center justify-center bg-surface-base">
        <Gauge className="size-6 animate-pulse text-signal-amber" strokeWidth={1.75} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
