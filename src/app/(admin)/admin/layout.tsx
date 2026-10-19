import type { Metadata } from "next";

import "../admin-styles.css";

export const metadata: Metadata = {
  title: "Admin — PlayVault",
  robots: { index: false, follow: false },
};

/**
 * Outer admin layout: minimal dark wrapper shared by /admin/login and the
 * authenticated back office. The auth gate lives in (authed)/layout.tsx so
 * the login page never redirects into itself.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-near-black text-text-primary">{children}</div>
  );
}
