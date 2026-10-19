"use client";

import { createContext, useContext } from "react";

import type { AdminInfo } from "../../_actions";

const AdminContext = createContext<AdminInfo | null>(null);

export function AdminProvider({
  value,
  children,
}: {
  value: AdminInfo;
  children: React.ReactNode;
}) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminInfo {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}
