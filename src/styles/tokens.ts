/**
 * PlayVault design tokens — single source of truth for colors, radius, shadows.
 *
 * UI/UX standard (PRD §7): no hardcoded colors in components — import from here.
 */
export const tokens = {
  colors: {
    /** Primary app background (home lobby). */
    navy: "#0c1424",
    /** Deepest surfaces (chat, sheets, overlays). */
    nearBlack: "#0B0E14",
    /** Brand gold — primary actions, highlights, active states. */
    gold: "#D4AF37",
    /** Light gold — gradients, hover states. */
    goldLight: "#E8C96A",
    /** Success states (Approved, Active). */
    success: "#22c55e",
    /** Danger states (Reject, Delete). */
    danger: "#ef4444",
    /** Paid tag + informational accents. */
    teal: "#2bb3a3",

    text: {
      /** Headings, primary content. */
      primary: "#f4f1e8",
      /** Secondary labels, timestamps, hints. */
      secondary: "#a8a29e",
      /** Muted placeholders, disabled text. */
      muted: "#6b7280",
      /** Text on gold buttons/badges. */
      onGold: "#0c1424",
    },

    surface: {
      /** Cards, sheets, message bubbles. */
      card: "#141b2e",
      /** Elevated cards, popovers, modals. */
      elevated: "#1a2338",
      /** Borders, dividers. */
      border: "#26314b",
      /** Input backgrounds. */
      input: "#0f1626",
    },
  },

  radius: {
    sm: "0.375rem",
    md: "0.75rem",
    lg: "1rem",
    xl: "1.5rem",
    full: "9999px",
  },

  shadows: {
    /** Soft card lift on dark background. */
    card: "0 4px 16px rgba(0, 0, 0, 0.35)",
    /** Gold buttons / highlighted tiles. */
    gold: "0 4px 20px rgba(212, 175, 55, 0.25)",
    /** Modals and sheets. */
    modal: "0 12px 48px rgba(0, 0, 0, 0.55)",
  },

  /** Player app phone frame (desktop). */
  phoneFrame: {
    maxWidth: "440px",
  },
} as const;

export type Tokens = typeof tokens;
