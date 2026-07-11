"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { loginSchema, registerSchema } from "@novamail/shared";
import { ApiClientError } from "@/lib/api-client";
import { useLogin, useRegister } from "../use-session";

type Mode = "signin" | "signup";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white " +
  "placeholder:text-white/35 outline-none transition-colors duration-150 " +
  "focus:border-[#9B85FF]/60 focus:bg-white/[0.09]";

const submitClass =
  "flex w-full items-center justify-center rounded-xl bg-gradient-to-br from-[#7C5CFC] to-[#5A3FE0] " +
  "px-5 py-3.5 text-sm font-semibold text-white shadow-[0_8px_32px_-8px_rgba(124,92,252,0.6)] " +
  "transition-opacity duration-150 hover:opacity-90 disabled:opacity-50";

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const login = useLogin();
  const register = useRegister();
  const pending = login.isPending || register.isPending;

  const serverError = login.error ?? register.error;
  const errorMessage =
    fieldError ??
    (serverError instanceof ApiClientError
      ? serverError.message
      : serverError !== null && serverError !== undefined
        ? "Something went wrong. Please try again."
        : null);

  function switchMode(next: Mode): void {
    setMode(next);
    setFieldError(null);
    login.reset();
    register.reset();
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setFieldError(null);

    if (mode === "signin") {
      const parsed = loginSchema.safeParse({ username, password });
      if (!parsed.success) {
        setFieldError(parsed.error.issues[0]?.message ?? "Check your details");
        return;
      }
      login.mutate(parsed.data);
    } else {
      const parsed = registerSchema.safeParse({ username, email, name, password });
      if (!parsed.success) {
        setFieldError(parsed.error.issues[0]?.message ?? "Check your details");
        return;
      }
      register.mutate(parsed.data);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-6 flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
        <button
          type="button"
          onClick={() => switchMode("signin")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors duration-150 ${
            mode === "signin" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/75"
          }`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => switchMode("signup")}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors duration-150 ${
            mode === "signup" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/75"
          }`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
              className={inputClass}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              className={inputClass}
            />
          </>
        )}
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          className={inputClass}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className={inputClass}
        />

        {errorMessage !== null && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-sm text-red-300"
          >
            {errorMessage}
          </motion.p>
        )}

        <motion.button
          type="submit"
          disabled={pending}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className={submitClass}
        >
          {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </motion.button>
      </form>
    </div>
  );
}
