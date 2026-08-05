import * as React from "react";

/** The theme actually rendered — what `data-theme` is set to, what every CSS token reads. */
export type Theme = "dark" | "light";

/** What the user (or nobody yet) has chosen. 'system' is the only value that isn't itself a Theme — it resolves to one via the OS media query. */
export type ThemePreference = Theme | "system";

// Keep in sync with the inline anti-flash script in index.html, which
// applies this same stored-preference-or-'light' logic to <html> before
// React mounts.
const STORAGE_KEY = "ppc-theme";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function systemTheme(): Theme {
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

function readStoredPreference(): ThemePreference | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : null;
}

function resolveTheme(preference: ThemePreference): Theme {
  return preference === "system" ? systemTheme() : preference;
}

// No stored preference at all (first-time visitor) resolves straight to
// 'light' — deliberately NOT OS-detected in that case. A visitor who has
// made any explicit choice before (including 'system') always gets that
// choice honored on return, unchanged from before.
function initialPreference(): ThemePreference {
  return readStoredPreference() ?? "light";
}

function initialTheme(): Theme {
  // index.html's inline script already computed and set this on <html>
  // before first paint — read it back rather than recomputing, so this
  // matches exactly what's already on screen instead of risking a flash if
  // the two computations ever drifted apart.
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return resolveTheme(initialPreference());
}

interface ThemeContextValue {
  /** The resolved, actually-applied theme — 'system' is always already resolved to 'light'/'dark' here. */
  theme: Theme;
  /** The raw preference — drives which of Light/Dark/System shows as active in the UI. */
  themePreference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themePreference, setThemePreferenceState] = React.useState<ThemePreference>(initialPreference);
  const [theme, setTheme] = React.useState<Theme>(initialTheme);

  // Resolves themePreference -> theme. For 'system' specifically, also
  // subscribes to the media query's change event so an OS-level theme
  // switch while the app is open updates live — no reload needed. The
  // subscription is torn down whenever the preference changes away from
  // 'system' (or on unmount), via the effect cleanup below.
  React.useEffect(() => {
    if (themePreference !== "system") {
      setTheme(themePreference);
      return;
    }

    const mql = window.matchMedia(DARK_MEDIA_QUERY);
    setTheme(mql.matches ? "dark" : "light");

    const onChange = (e: MediaQueryListEvent) => setTheme(e.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [themePreference]);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setThemePreference = React.useCallback((preference: ThemePreference) => {
    // Every explicit choice — including 'system' — is written to storage.
    // Only a visitor who has NEVER interacted with this control (nothing in
    // storage at all) gets the light-default treatment; once they've
    // picked anything, that pick sticks on return visits.
    localStorage.setItem(STORAGE_KEY, preference);
    setThemePreferenceState(preference);
  }, []);

  const value = React.useMemo(
    () => ({ theme, themePreference, setThemePreference }),
    [theme, themePreference, setThemePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
