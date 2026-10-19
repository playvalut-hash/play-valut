import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlayVault",
  description: "PlayVault — your sweepstakes game lobby. Accounts, deposits and support in one place.",
};

export const viewport = {
  themeColor: "#0c1424",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-navy text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
