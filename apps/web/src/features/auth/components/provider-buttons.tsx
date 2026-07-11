"use client";

import { motion } from "framer-motion";
import { signInUrl } from "../api";
import { GoogleLogo, MicrosoftLogo } from "./provider-logos";

const buttonClass =
  "flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 " +
  "bg-white/[0.06] px-5 py-3.5 text-sm font-medium text-white " +
  "transition-colors duration-200 hover:bg-white/[0.12] hover:border-white/20";

export function ProviderButtons() {
  return (
    <div className="flex w-full flex-col gap-3">
      <motion.a
        href={signInUrl("google")}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        className={buttonClass}
      >
        <GoogleLogo />
        Continue with Google
      </motion.a>
      <motion.a
        href={signInUrl("microsoft")}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        className={buttonClass}
      >
        <MicrosoftLogo />
        Continue with Microsoft
      </motion.a>
    </div>
  );
}
