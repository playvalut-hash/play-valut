import { vi } from "vitest";

/**
 * Shared Supabase mocks for admin action tests. The service stub answers
 * admin_users lookups with an active super-admin row and everything else
 * with empty lists; no live database is ever touched.
 */

export const getUser = vi.fn();

export function chainable(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of [
    "select",
    "eq",
    "neq",
    "is",
    "in",
    "order",
    "limit",
    "gt",
    "gte",
    "lt",
    "lte",
    "single",
    "maybeSingle",
    "or",
    "range",
    "upsert",
    "update",
    "insert",
    "delete",
  ]) {
    q[m] = () => q;
  }
  // Awaiting the chain resolves to the stubbed result.
  q.then = (resolve: (v: unknown) => void) => resolve(result);
  return q;
}

export const ADMIN_ROW = {
  id: "admin-1",
  role: "super_admin",
  display_name: "Super",
  email: "admin@example.com",
  is_active: true,
  permissions: null,
};

export function mockServiceClient() {
  return {
    from: (table: string) =>
      table === "admin_users"
        ? chainable({ data: ADMIN_ROW, error: null })
        : chainable({ data: [], error: null }),
  };
}

export function session(userId: string | null) {
  getUser.mockResolvedValue({ data: { user: userId ? { id: userId } : null } });
}
