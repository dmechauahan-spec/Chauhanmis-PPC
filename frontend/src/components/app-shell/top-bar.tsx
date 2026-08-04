import { LogOut, Moon, Sun, User } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { SpotlightSearch } from "@/features/search/spotlight-search";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL } from "@/lib/roles";
import { useTheme } from "@/lib/theme-context";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "");
}

export function TopBar() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-border bg-surface-base px-5">
      <SpotlightSearch />
      <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-md px-2 py-1.5 outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-signal-amber/50">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-ink-primary">{user.name}</p>
              <p className="text-xs text-ink-muted">{ROLE_LABEL[user.role] ?? user.role}</p>
            </div>
            <Avatar>
              <AvatarFallback>{initials(user.name).toUpperCase() || <User className="size-4" />}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={logout}>
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
