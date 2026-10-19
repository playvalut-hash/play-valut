/* Quick-reply presets (client-safe — not a server action). */
export const QUICK_REPLIES: Record<string, { label: string; message: string }> = {
  greeting: {
    label: "Greeting",
    message:
      "Hi there! Welcome to PlayVault support. How can I help you today?",
  },
  bonus_info: {
    label: "Bonus info",
    message:
      "We offer a signup bonus on your first load and a reload bonus on every load after that. Bonuses are applied automatically when your account is loaded.",
  },
  deposit_help: {
    label: "Deposit help",
    message:
      "To deposit: open Wallet, tap Deposit, choose a payment method, complete the payment, then upload your screenshot here. I will verify it as soon as it arrives.",
  },
  wait_moment: {
    label: "One moment",
    message: "One moment please — I'm checking that for you right now.",
  },
  thanks: {
    label: "Thanks",
    message: "You're very welcome! Good luck and enjoy the games.",
  },
  support_hours: {
    label: "Support hours",
    message:
      "Support is available daily. If I'm away, leave your message here and I'll reply as soon as I'm back.",
  },
};

