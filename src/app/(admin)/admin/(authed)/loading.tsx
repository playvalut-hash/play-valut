/**
 * Route loading skeleton for the admin area — paints instantly inside the
 * admin shell while the page's data streams in.
 */
export default function AdminLoading() {
  return (
    <div className="flex h-full animate-pulse" aria-label="Loading">
      <div className="hidden w-[300px] shrink-0 border-r border-surface-border p-3 md:block">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="mb-3 flex items-center gap-2.5">
            <div className="h-9 w-9 shrink-0 rounded-full bg-surface-card" />
            <div className="min-w-0 flex-1">
              <div className="h-3 w-3/4 rounded bg-surface-card" />
              <div className="mt-1.5 h-2.5 w-1/2 rounded bg-surface-card" />
            </div>
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1 p-4">
        <div className="h-5 w-48 rounded bg-surface-card" />
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
