import Link from "next/link";

/** Public terms of service (v3). Static page — same public treatment
 *  as /privacy. Wording stays honest: manual deposit verification,
 *  third-party games, 18+, blocking for abuse. No licence or
 *  registration claims are made. */
export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-[#0b0e14] text-[#eef2f7]">
      <main className="mx-auto w-full max-w-3xl px-5 py-10">
        <Link href="/" className="text-sm font-semibold text-[#d4af37] hover:underline">
          ← Back to PlayVault
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold">Terms of Service</h1>
        <p className="mt-2 text-sm text-[#6d7a8f]">Last updated: October 25, 2026</p>

        <section className="mt-8 space-y-6 text-[15px] leading-relaxed text-[#a7b2c3]">
          <div>
            <h2 className="text-lg font-bold text-[#eef2f7]">What PlayVault does</h2>
            <p className="mt-1">
              PlayVault is a front desk for sweepstakes game players. We
              create your game accounts on request, verify your deposits
              from screenshots, and provide live chat support. The games
              themselves are operated by third parties in their own apps
              — PlayVault does not run the games and does not control
              their outcomes.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#eef2f7]">Eligibility</h2>
            <p className="mt-1">
              You must be 18 years or older to use PlayVault. You may
              also browse and chat as a guest without an account; guest
              sessions carry the same rules as signed-in accounts.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#eef2f7]">Your account</h2>
            <p className="mt-1">
              You are responsible for keeping your game login details
              safe and for not sharing them with anyone outside our
              support chat. PlayVault may block accounts that abuse the
              service, submit false deposits, or harass support staff.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#eef2f7]">Deposits</h2>
            <p className="mt-1">
              Deposits are verified manually by our support team from
              the screenshot you upload — they are not instant and
              PlayVault is not a payment processor. A deposit with a
              wrong, unclear, or mismatched screenshot may take longer
              to verify or may be rejected. Always double-check the
              payment details shown in the app before sending.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#eef2f7]">Changes</h2>
            <p className="mt-1">
              Features, games, and payment methods may change over time.
              If these terms change, the updated version on this page
              applies from the date shown above. Questions? Reach us on
              live chat inside the app.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
