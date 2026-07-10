"use client";

import { Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const CYCLE = ["system", "light", "dark"] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // Avoid hydration mismatch: theme is only known on the client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return <span className="size-7" aria-hidden />;
  }

  const current = (theme ?? "system") as (typeof CYCLE)[number];
  const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length] as string;
  const Icon =
    current === "dark" ? Moon : current === "light" ? Sun : SunMoon;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Theme: ${current} — click for ${next}`}
      aria-label={`Switch theme (current: ${current})`}
      className="flex size-7 shrink-0 items-center justify-center rounded-lg text-chrome-muted transition-colors hover:bg-white/10 hover:text-white"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
