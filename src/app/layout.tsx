import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PlayVault",
  description: "PlayVault — your sweepstakes game lobby. Accounts, deposits and support in one place.",
};

export const viewport = {
  themeColor: "#0c1424",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full ${bricolage.variable} ${manrope.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-full bg-navy text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
