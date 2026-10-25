import Link from "next/link";

/** Public privacy policy (v3). Static page — no session needed, and the
 *  proxy matcher never covers /privacy, so guests can open it from the
 *  Google consent screen. Wording matches the real data practices:
 *  Supabase storage, AES-256-GCM game credentials, 30-day screenshot
 *  retention for decided deposits, immediate deletion on chat clear. */
export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-[#0b0e14] text-[#eef2f7]">
      <main className="mx-auto w-full max-w-3xl px-5 py-10">
        <Link href="/" className="text-sm font-semibold text-[#d4af37] hover:underline">
          ← Back to PlayVault
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[#6d7a8f]">Last updated: October 25, 2026</p>

        <section className="mt-8 space-y-6 text-[15px] leading-relaxed text-[#a7b2c3]">
          <div>
            <h2 className="text-lg font-bold text-[#eef2f7]">What PlayVault is</h2>
            <p className="mt-1">
              PlayVault is the front desk for sweepstakes game players. We
              set up your game accounts, verify your deposits from
              screenshots, and answer you on live chat. We do not operate
              the games themselves — those run in their own apps.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#eef2f7]">What we collect</h2>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Account information: your name and email address, from
                email sign-up or Google sign-in.
              </li>
              <li>
                Game accounts you ask us to create: the game name and the
                username we generate for you.
              </li>
              <li>
                Deposits: the amount, the payment method you chose, and
                the screenshot you upload for verification.
              </li>
              <li>
                Support chats: the messages you send to our support team.
              </li>
              <li>
                Sign-in session cookies, used only to keep you logged in.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#eef2f7]">How we protect it</h2>
            <p className="mt-1">
              Game account passwords are stored encrypted (AES-256-GCM)
              and are only shown to you and to the support agents serving
              you. Deposit screenshots are automatically deleted 30 days
              after your deposit is decided, and immediately if you clear
              your chat. We never sell your personal information, and we
              do not share it with anyone except the support agents who
              serve your account.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#eef2f7]">Guest mode</h2>
            <p className="mt-1">
              You can chat and browse as a guest without an account. A
              guest session is stored under a temporary id (shown as
              Guest-XXXX to support). If you activate the guest session
              with Google or email, the same account continues — your
              chat and deposits carry over.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-[#eef2f7]">Your choices</h2>
            <p className="mt-1">
              You can sign out at any time, and you can clear your chat
              from the app, which deletes its screenshots immediately.
              For anything else about your data, reach us on live chat
              inside the app.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
