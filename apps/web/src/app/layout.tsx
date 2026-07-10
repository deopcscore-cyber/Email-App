import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "NovaMail — The AI-powered email for focused people",
  description:
    "A premium, keyboard-first email client with a real AI copilot.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
