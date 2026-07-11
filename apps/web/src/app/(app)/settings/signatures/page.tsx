"use client";

import { useSession } from "@/features/auth/use-session";
import { useSignatures } from "@/features/signatures/use-signatures";
import { SignatureCard } from "./signature-card";

export default function SignaturesSettingsPage() {
  const { data: user } = useSession();
  const { data: signatures } = useSignatures();

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Signatures</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Each connected account has its own signature, appended to new
        messages you send from it.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {user?.accounts.map((account) => {
          const signature = signatures?.find(
            (s) => s.accountId === account.id,
          );
          if (signature === undefined) return null;
          return (
            <SignatureCard
              key={account.id}
              account={account}
              signature={signature}
            />
          );
        })}
      </div>
    </div>
  );
}
