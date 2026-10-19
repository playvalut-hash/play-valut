import Tabs from "./_tabs";


/** All pages here are auth-gated: skip prerendering. */
export const instant = false;

/**
 * Player app shell: phone frame (max-width 440px) centered on desktop,
 * bottom tab bar. Zero admin surface (R8).
 */
export default function PlayerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-near-black flex justify-center">
      <div className="relative flex min-h-dvh w-full max-w-[440px] flex-col bg-navy md:border-x md:border-surface-border">
        <main className="flex-1 pb-24">{children}</main>
        <Tabs />
      </div>
    </div>
  );
}
