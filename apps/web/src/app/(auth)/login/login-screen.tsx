"use client";

import { motion, type Variants } from "framer-motion";
import { Mail, Sparkles, Zap, Inbox, Search, ShieldCheck } from "lucide-react";
import { AuthForm } from "@/features/auth/components/auth-form";

const FEATURES = [
  { icon: Sparkles, label: "AI Summaries" },
  { icon: Inbox, label: "Unified Inbox" },
  { icon: Search, label: "Blazing Fast Search" },
  { icon: Zap, label: "Keyboard First" },
  { icon: ShieldCheck, label: "Privacy First" },
] as const;

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" } },
};

export function LoginScreen() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[oklch(0.13_0.032_278)] px-6">
      {/* Ambient violet glow, matching the reference design's atmosphere */}
      <motion.div
        aria-hidden
        animate={{ opacity: [0.2, 0.28, 0.2], scale: [1, 1.04, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -top-64 left-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-[oklch(0.45_0.18_285)] blur-[140px]"
      />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative flex w-full max-w-sm flex-col items-center text-center"
      >
        <motion.div
          variants={item}
          className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] shadow-[0_8px_32px_-8px_rgba(124,92,252,0.6)]"
        >
          <Mail className="size-7 text-white" aria-hidden />
        </motion.div>

        <motion.h1
          variants={item}
          className="text-3xl font-semibold tracking-tight text-white"
        >
          Meet NovaMail
        </motion.h1>
        <motion.p variants={item} className="mt-2 text-[15px] text-white/55">
          The AI-powered email for focused people.
        </motion.p>

        <motion.div variants={item} className="mt-10 w-full">
          <AuthForm />
        </motion.div>

        <motion.ul
          variants={item}
          className="mt-10 flex flex-wrap items-center justify-center gap-2"
        >
          {FEATURES.map(({ icon: Icon, label }) => (
            <motion.li
              key={label}
              whileHover={{ y: -2, backgroundColor: "rgba(255,255,255,0.08)" }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/60"
            >
              <Icon className="size-3.5 text-[#9B85FF]" aria-hidden />
              {label}
            </motion.li>
          ))}
        </motion.ul>

        <motion.p variants={item} className="mt-10 text-xs text-white/35">
          Your data is encrypted and never used for ads.
        </motion.p>
      </motion.div>
    </main>
  );
}
