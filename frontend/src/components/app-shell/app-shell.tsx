import { Outlet } from "react-router";
import { InstrumentRail } from "./instrument-rail";
import { TopBar } from "./top-bar";

export function AppShell() {
  return (
    <div className="flex h-svh bg-surface-base">
      <InstrumentRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
