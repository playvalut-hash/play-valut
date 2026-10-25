import Link from "next/link";

import {
  getSuperAdminDashboard,
  type DashboardWindow,
} from "../../../_actions";

const WINDOWS: Array<{ key: DashboardWindow; label: string }> = [
  { key: "24h", label: "24 hours" },
  { key: "5d", label: "5 days" },
  { key: "10d", label: "10 days" },
  { key: "30d", label: "30 days" },
];

function money(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString();
}

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#232c3e] bg-[#151a26] p-4">
      <p className="text-[12px] font-medium text-text-secondary">{label}</p>
      <p className="mt-1 text-[24px] font-extrabold text-text-primary">
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 text-[12px] text-text-muted">{sub}</p>
      ) : null}
    </div>
  );
}

/** Super-admin-only overview. The window chips are plain links, so
 *  switching windows is a fresh server render with fresh counts.
 *  Agents never see this page (no nav entry); a direct URL hit renders
 *  the not-authorized note instead of throwing into an error page. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ window?: string | string[] }>;
}) {
  const params = (await searchParams) ?? {};
  const raw = Array.isArray(params.window)
    ? params.window[0]
    : params.window;
  const key: DashboardWindow =
    raw === "5d" || raw === "10d" || raw === "30d" ? raw : "24h";

  let data;
  try {
    data = await getSuperAdminDashboard(key);
  } catch {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Only the super admin can view this dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            What happened in the last{" "}
            {WINDOWS.find((w) => w.key === key)?.label.toLowerCase()} — and
            what needs attention right now.
          </p>
        </div>
        <div className="flex gap-1.5">
          {WINDOWS.map((w) => (
            <Link
              key={w.key}
              href={`/admin/dashboard?window=${w.key}`}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${
                w.key === key
                  ? "bg-[#d4af37] text-[#241a02]"
                  : "border border-[#232c3e] bg-[#151a26] text-text-secondary hover:text-text-primary"
              }`}
            >
              {w.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Growth in window */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-secondary">
          Growth
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="New players" value={`${data.newPlayers}`} />
          <Card label="New guests" value={`${data.newGuests}`} />
          <Card
            label="Guests who activated"
            value={`${data.guestActivated}`}
            sub="Guest → signed-in account"
          />
          <Card
            label="Returning guests"
            value={`${data.returningGuests}`}
            sub="Known device, new guest visit"
          />
        </div>
      </section>

      {/* Money + work in window */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-secondary">
          Accounts & deposits
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="Game accounts created" value={`${data.accountsCreated}`} />
          <Card
            label="Deposits approved"
            value={money(data.depositsApprovedTotal)}
            sub={`${data.depositsApprovedCount} deposits`}
          />
          <Card
            label="Pending deposits now"
            value={money(data.pendingDepositsTotal)}
            sub={`${data.pendingDepositsCount} waiting for a decision`}
          />
          <Card
            label="Accounts being created"
            value={`${data.creatingAccounts}`}
            sub="Right now, not in window"
          />
        </div>
      </section>

      {/* Moderation by agents */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-secondary">
          Moderation by agents
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card
            label="Players blocked"
            value={`${data.blocks.total}`}
            sub={
              data.blocks.byAgent.length > 0
                ? data.blocks.byAgent
                    .map((b) => `${b.name}: ${b.count}`)
                    .join(" · ")
                : "Nobody blocked anyone"
            }
          />
          <Card
            label="Accounts deleted"
            value={`${data.deletes.total}`}
            sub={
              data.deletes.byAgent.length > 0
                ? data.deletes.byAgent
                    .map((b) => `${b.name}: ${b.count}`)
                    .join(" · ")
                : "Nothing deleted"
            }
          />
          <Card label="Players unblocked" value={`${data.unblocks}`} />
          <Card label="Chats cleared" value={`${data.chatsCleared}`} />
        </div>
      </section>

      {/* Right now */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-secondary">
          Right now
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="Total players" value={`${data.totalPlayers}`} />
          <Card label="Total guests" value={`${data.totalGuests}`} sub="Never activated" />
          <Card label="Online now" value={`${data.onlineNow}`} />
          <Card label="Unread messages" value={`${data.unreadMessages}`} />
        </div>
      </section>

      {/* Moderation feed */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-secondary">
          Moderation feed
        </h2>
        <div className="overflow-hidden rounded-2xl border border-[#232c3e]">
          {data.moderationFeed.length === 0 ? (
            <p className="bg-[#151a26] p-4 text-sm text-text-secondary">
              No blocks, deletes, unblocks or chat clears in this window.
            </p>
          ) : (
            <ul className="divide-y divide-[#232c3e] bg-[#151a26]">
              {data.moderationFeed.map((m, i) => (
                <li
                  key={`${m.createdAt}-${i}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
                >
                  <p className="text-sm text-text-primary">
                    <span className="font-bold">{m.agentName}</span>{" "}
                    <span className="text-text-secondary">
                      {m.label.toLowerCase()}:
                    </span>{" "}
                    <span className="font-semibold">{m.playerName}</span>
                  </p>
                  <span className="text-xs text-text-muted">
                    {when(m.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Contact messages */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-text-secondary">
          Contact messages ({data.contactCount} in window)
        </h2>
        <div className="overflow-hidden rounded-2xl border border-[#232c3e]">
          {data.contactMessages.length === 0 ? (
            <p className="bg-[#151a26] p-4 text-sm text-text-secondary">
              No messages from the site&apos;s Contact section yet.
            </p>
          ) : (
            <ul className="divide-y divide-[#232c3e] bg-[#151a26]">
              {data.contactMessages.map((m) => (
                <li key={m.id} className="px-4 py-3">
                  <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-bold text-text-primary">
                      {m.name}{" "}
                      <span className="font-normal text-text-muted">
                        · {m.email}
                      </span>
                    </span>
                    <span className="text-xs text-text-muted">
                      {when(m.createdAt)}
                    </span>
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                    {m.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
