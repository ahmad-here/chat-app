"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

/** localStorage is an external store, so it's read with useSyncExternalStore
 * rather than useState + useEffect. That avoids both the hydration mismatch
 * (the server has no localStorage) and the cascading render of setState-in-
 * effect: React renders the server snapshot during hydration, then re-reads
 * the real value immediately after. */

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // "storage" fires for changes made in *other* tabs, keeping them in sync.
  // Same-tab changes are pushed via emitChange() in setTheme.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // localStorage can throw in private mode / restrictive settings.
    return "system";
  }
}

/** The server can't know the preference, so it renders the neutral default —
 *  matching the HTML the inline script in layout.tsx then corrects. */
function getServerSnapshot(): Theme {
  return "system";
}

function setTheme(theme: Theme): void {
  const root = document.documentElement;
  try {
    if (theme === "system") {
      // Removing the attribute hands control back to the prefers-color-scheme
      // rule in globals.css.
      root.removeAttribute("data-theme");
      localStorage.removeItem(STORAGE_KEY);
    } else {
      root.setAttribute("data-theme", theme);
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // Storage unavailable — still apply the theme for this session.
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }
  emitChange();
}

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <fieldset className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
      <legend className="sr-only">Colour theme</legend>
      {OPTIONS.map((option) => {
        const isSelected = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={isSelected}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              isSelected
                ? "bg-accent text-accent-foreground"
                : "text-muted hover:bg-surface hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
