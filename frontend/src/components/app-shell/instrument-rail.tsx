import { NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";
import { NAV_GROUPS, isNavItemVisible } from "@/lib/nav-config";
import { useAuth } from "@/features/auth/auth-context";

/**
 * The fixed left instrument rail — the app's primary navigation, grouped by
 * domain. See README "Design System — Layout concept" for why this is a
 * rail, not a top navbar: this is a tool people keep open all day, and a
 * persistent, icon-anchored rail reads faster at a glance than a horizontal
 * menu once you already know where things live.
 */
export function InstrumentRail() {
  const { user } = useAuth();

  return (
    <nav
      aria-label="Primary"
      className="flex h-svh w-60 shrink-0 flex-col border-r border-surface-border bg-surface-raised"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-surface-border px-4">
        <BrandMark size="sm" />
        <span className="font-display text-sm font-semibold tracking-wide text-ink-primary">Chauhanmis PPC</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => {
          const visibleItems = user ? group.items.filter((item) => isNavItemVisible(item, user.role)) : [];
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label} className="mb-4">
              <p className="px-2.5 pb-1.5 text-[0.65rem] font-semibold tracking-widest text-ink-faint uppercase">
                {group.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {visibleItems.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.to === "/"}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-signal-amber/10 text-signal-amber font-medium"
                            : "text-ink-muted hover:bg-surface-sunken hover:text-ink-primary",
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" strokeWidth={1.85} />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
