"use client";

import { AnimatePresence, motion } from "framer-motion";
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
    <motion.button
      type="button"
      whileTap={{ scale: 0.85 }}
      onClick={() => setTheme(next)}
      title={`Theme: ${current} — click for ${next}`}
      aria-label={`Switch theme (current: ${current})`}
      className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-lg text-chrome-muted transition-colors hover:bg-white/10 hover:text-white"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={current}
          initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="flex"
        >
          <Icon className="size-4" aria-hidden />
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
