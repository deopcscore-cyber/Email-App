import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_PREFIX, SESSION_COOKIE } from "@novamail/shared";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * Server-side auth gate for everything inside (app): validates the session
 * cookie against the API before rendering, so signed-out users never see a
 * flash of the app shell.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token === undefined) {
    redirect("/login");
  }

  const res = await fetch(`${API_URL}${API_PREFIX}/auth/session`, {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    redirect("/login");
  }

  return <>{children}</>;
}
