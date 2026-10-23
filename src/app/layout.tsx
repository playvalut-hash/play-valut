import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts are SELF-HOSTED (Build 40): next/font/google fetched the CSS from
// Google at build time, and Vercel builds kept failing on that step
// ("next/font/google queries have exactly one entry", 10s build failure).
// Local files remove the build-time network dependency entirely — the same
// Google variable fonts, latin subset, one file per family.
const bricolage = localFont({
  src: [
    { path: "./fonts/bricolage-grotesque.woff2", weight: "500" },
    { path: "./fonts/bricolage-grotesque.woff2", weight: "700" },
    { path: "./fonts/bricolage-grotesque.woff2", weight: "800" },
  ],
  variable: "--font-bricolage",
  display: "swap",
});

const manrope = localFont({
  src: [
    { path: "./fonts/manrope.woff2", weight: "400" },
    { path: "./fonts/manrope.woff2", weight: "500" },
    { path: "./fonts/manrope.woff2", weight: "600" },
    { path: "./fonts/manrope.woff2", weight: "700" },
    { path: "./fonts/manrope.woff2", weight: "800" },
  ],
  variable: "--font-manrope",
  display: "swap",
});

const jetbrains = localFont({
  src: [
    { path: "./fonts/jetbrains-mono.woff2", weight: "500" },
    { path: "./fonts/jetbrains-mono.woff2", weight: "700" },
  ],
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
