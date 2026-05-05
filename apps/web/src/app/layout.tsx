import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata: Metadata = {
  title: "TechBuddy — Family Portal",
  description:
    "See how TechBuddy is helping the senior in your life. Recent help sessions, AI-generated summaries, all in one place.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased text-ink">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
