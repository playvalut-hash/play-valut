import { SparklesIcon } from "@/components/icons";
import PromoForm from "./_promo-form";

/**
 * Explore: announcements + promo code (F35).
 * Reward logic (spin/tasks/VIP) is Phase 2 — absent, not faked (PRD §7.6).
 */
export default function ExplorePage() {
  return (
    <div className="px-4 pt-5">
      <h1 className="text-xl font-extrabold text-text-primary">Explore</h1>
      <p className="mt-1 text-sm text-text-secondary">
        News from your lobby and your promo code.
      </p>

      {/* Announcements */}
      <h2 className="mt-6 text-base font-bold text-text-primary">
        Announcements
      </h2>
      <div className="mt-3 rounded-2xl border border-surface-border bg-surface-card p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-gold">
          <SparklesIcon className="h-7 w-7" />
        </span>
        <p className="mt-4 font-bold text-text-primary">Nothing new right now</p>
        <p className="mt-1 text-sm text-text-secondary">
          New games and promos will show up here first.
        </p>
      </div>

      {/* Promo code */}
      <h2 className="mt-6 text-base font-bold text-text-primary">Promo code</h2>
      <div className="mt-3 pb-6">
        <PromoForm />
      </div>
    </div>
  );
}
