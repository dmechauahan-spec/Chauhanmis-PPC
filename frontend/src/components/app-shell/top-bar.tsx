import { LogOut, Monitor, Moon, Sun, User } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { SpotlightSearch } from "@/features/search/spotlight-search";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABEL } from "@/lib/roles";
import { useTheme, type ThemePreference } from "@/lib/theme-context";

// Icon + label per PREFERENCE (not per resolved theme) — the trigger shows
// which of the three the user actually picked, e.g. still a monitor icon
// while on System even if that currently resolves to dark. lucide's
// Monitor stands in for "follow the OS" the same way Sun/Moon stand in for
// Light/Dark.
const PREFERENCE_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function ThemeToggle() {
  const { themePreference, setThemePreference } = useTheme();
  const current = PREFERENCE_OPTIONS.find((o) => o.value === themePreference) ?? PREFERENCE_OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Theme: ${current.label}`} title={`Theme: ${current.label}`}>
          <CurrentIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[8rem]">
        <DropdownMenuRadioGroup
          value={themePreference}
          onValueChange={(value) => setThemePreference(value as ThemePreference)}
        >
          {PREFERENCE_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="size-4 text-ink-muted" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
