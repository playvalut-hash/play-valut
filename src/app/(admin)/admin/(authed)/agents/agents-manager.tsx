"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminInfo, AgentRow } from "../../../_actions";
import {
  createAgent,
  toggleAgentActive,
  updateAgent,
} from "../../../_actions";
import { cn } from "@/lib/utils";
import { CheckIcon, EditIcon, PlusIcon, ShieldIcon, UsersIcon, XIcon } from "@/components/icons";
import { timeAgo } from "../ui-bits";

function AgentCard({
  admin,
  agent,
  isSelf,
}: {
  admin: AdminInfo;
  agent: AgentRow;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(agent.displayName);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await updateAgent(admin.id, {
        id: agent.id,
        displayName: displayName.trim() || agent.displayName,
        password: newPassword || "",
      });
      setEditing(false);
      setNewPassword("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update agent");
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await toggleAgentActive(admin.id, agent.id, !agent.isActive);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-surface-border bg-surface-card p-4",
        !agent.isActive && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-text-secondary">
            {agent.role === "super_admin" ? (
              <ShieldIcon className="h-4 w-4 text-gold" />
            ) : (
              <UsersIcon className="h-4 w-4" />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {agent.displayName}
              {isSelf && (
                <span className="ml-1.5 rounded-full bg-gold/15 px-1.5 py-px text-[10px] font-semibold text-gold">
                  you
                </span>
              )}
            </p>
            <p className="text-[11px] text-text-muted">{agent.email}</p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            agent.isActive ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
          )}
        >
          {agent.isActive ? "Enabled" : "Disabled"}
        </span>
      </div>

      {error && (
        <div role="alert" className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">
          {error}
        </div>
      )}

      {!editing ? (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-text-muted">
            Joined {timeAgo(agent.createdAt)}
          </span>
          {!isSelf && agent.role === "agent" && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDisplayName(agent.displayName);
                  setEditing(true);
                }}
                aria-label={`Edit ${agent.displayName}`}
                className="admin-focus rounded p-1.5 text-text-muted hover:text-gold"
              >
                <EditIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={toggle}
                disabled={busy}
                className={cn(
                  "admin-focus rounded-md px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-50",
                  agent.isActive
                    ? "bg-danger/15 text-danger hover:bg-danger/25"
                    : "bg-success/15 text-success hover:bg-success/25",
                )}
              >
                {agent.isActive ? "Disable" : "Enable"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-secondary">
              Display name
            </span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="admin-focus w-full rounded-md border border-surface-border bg-surface-input px-2.5 py-1.5 text-[13px] text-text-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-text-secondary">
              New password (optional)
            </span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leave blank to keep current"
              className="admin-focus w-full rounded-md border border-surface-border bg-surface-input px-2.5 py-1.5 text-[13px] text-text-primary placeholder:text-text-muted"
            />
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="admin-focus flex-1 rounded-md bg-gold px-2 py-1.5 text-xs font-semibold text-navy hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setNewPassword("");
                setError(null);
              }}
              className="admin-focus flex-1 rounded-md border border-surface-border px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateAgentForm({
  admin,
  onDone,
}: {
  admin: AdminInfo;
  onDone: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createAgent(admin.id, {
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });
      onDone();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create agent");
      setBusy(false);
    }
  }

  const inputCls =
    "admin-focus w-full rounded-md border border-surface-border bg-surface-input px-2.5 py-2 text-[13px] text-text-primary placeholder:text-text-muted";
  const labelCls = "mb-1 block text-[11px] font-medium text-text-secondary";

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-surface-border bg-surface-card p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Create agent</h2>
      {error && (
        <div role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={labelCls}>Display name</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder="Agent name"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="agent@example.com"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className={labelCls}>Temporary password (8+ chars)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            placeholder="••••••••"
            className={inputCls}
          />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-text-muted">
        The agent signs in at /admin/login with this email and password. Share the
        temporary password securely and ask them to change it.
      </p>
      <button
        type="submit"
        disabled={busy}
        className="admin-focus mt-3 flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-[13px] font-semibold text-navy hover:opacity-90 disabled:opacity-50"
      >
        <PlusIcon className="h-4 w-4" />
        {busy ? "Creating…" : "Create agent"}
      </button>
    </form>
  );
}

/** Agent Management (super_admin only): list, create, edit, enable/disable agents. */
export default function AgentsManager({
  admin,
  agents,
}: {
  admin: AdminInfo;
  agents: AgentRow[];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const supers = agents.filter((a) => a.role === "super_admin");
  const regular = agents.filter((a) => a.role === "agent");

  return (
    <div className="admin-thin-scroll h-full overflow-y-auto p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-text-primary">Agent Management</h1>
          <p className="text-xs text-text-muted">
            {regular.length} agents · {supers.length} super-admins
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="admin-focus flex items-center gap-1.5 rounded-md bg-gold px-3 py-2 text-[13px] font-semibold text-navy hover:opacity-90"
        >
          {showCreate ? <XIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          {showCreate ? "Close" : "Create agent"}
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 max-w-3xl">
          <CreateAgentForm admin={admin} onDone={() => setShowCreate(false)} />
        </div>
      )}

      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        <UsersIcon className="h-3.5 w-3.5" /> Agents
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {regular.map((a) => (
          <AgentCard key={a.id} admin={admin} agent={a} isSelf={a.id === admin.id} />
        ))}
        {regular.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-surface-border px-4 py-8 text-center text-xs text-text-muted">
            No agents yet — create the first one above.
          </p>
        )}
      </div>

      <h2 className="mb-2 mt-6 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        <ShieldIcon className="h-3.5 w-3.5" /> Super-admins
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {supers.map((a) => (
          <AgentCard key={a.id} admin={admin} agent={a} isSelf={a.id === admin.id} />
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1 text-[11px] text-text-muted">
        <CheckIcon className="h-3 w-3" />
        Super-admins cannot be edited or disabled from here.
      </p>
    </div>
  );
}
