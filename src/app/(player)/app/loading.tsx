/**
 * Route loading skeleton for the player app — paints instantly inside the
 * shell (bottom nav stays live) while the page's data streams in, instead
 * of freezing on the previous screen.
 */
export default function PlayerLoading() {
  return (
    <div className="animate-pulse px-4 pt-5" aria-label="Loading">
      <div className="h-6 w-40 rounded-lg bg-surface-card" />
      <div className="mt-2 h-4 w-56 rounded-lg bg-surface-card" />
      <div className="mt-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i}>
            <div className="aspect-square rounded-2xl bg-surface-card" />
            <div className="mx-auto mt-2 h-3 w-4/5 rounded bg-surface-card" />
            <div className="mx-auto mt-1 h-2.5 w-3/5 rounded bg-surface-card" />
          </div>
        ))}
      </div>
    </div>
  );
}
