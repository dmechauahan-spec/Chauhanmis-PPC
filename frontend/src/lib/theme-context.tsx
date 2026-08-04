import * as React from "react";

export type Theme = "dark" | "light";

// Keep in sync with the inline anti-flash script in index.html, which sets
// documentElement's data-theme attribute before React mounts using this
// same key and fallback logic.
const STORAGE_KEY = "ppc-theme";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function initialTheme(): Theme {
  // index.html's inline script already set this on <html> before first
  // paint — read it back rather than recomputing, so an explicit stored
  // choice (vs. the OS default) is respected identically here.
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return systemTheme();
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>(initialTheme);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = React.useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "dark" ? "light" : "dark";
      // Only an explicit toggle writes to storage — this is the point where
      // the user's choice starts overriding the OS setting from then on.
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
