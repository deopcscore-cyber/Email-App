"use client";

import { motion } from "framer-motion";
import { signInUrl } from "../api";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29a7.21 7.21 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.99 3.09C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-4.5" aria-hidden>
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M13 1h10v10H13z" />
      <path fill="#00A4EF" d="M1 13h10v10H1z" />
      <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
  );
}

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
