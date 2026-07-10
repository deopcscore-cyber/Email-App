import type { Metadata } from "next";
import { LoginScreen } from "./login-screen";

export const metadata: Metadata = { title: "Sign in — NovaMail" };

const ERROR_MESSAGES: Record<string, string> = {
  cancelled: "Sign-in was cancelled. Try again whenever you're ready.",
  provider: "The sign-in provider returned an error. Please try again.",
  missing_params: "The sign-in response was incomplete. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage =
    error === undefined
      ? null
      : (ERROR_MESSAGES[error] ?? "Something went wrong signing you in.");
  return <LoginScreen errorMessage={errorMessage} />;
}
