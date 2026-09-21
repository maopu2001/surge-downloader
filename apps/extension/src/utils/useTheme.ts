import { useEffect, useState } from "react";

function applyInitialTheme(): boolean {
  if (typeof window !== "undefined" && window.matchMedia) {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    return isDark;
  }
  return false;
}

// Run immediately upon script evaluation to prevent any frame latency
if (typeof document !== "undefined") {
  applyInitialTheme();
}

export function useSystemTheme(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => applyInitialTheme());

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (matches: boolean) => {
      setIsDark(matches);
      if (matches) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };

    update(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => update(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return isDark;
}
