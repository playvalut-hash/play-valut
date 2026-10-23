import { describe, expect, it } from "vitest";

import {
  bonusLine,
  depositAmountSchema,
  formatReload,
  generateUsername,
  normalizeTag,
  tileBonusText,
  validateDepositAmount,
} from "@/lib/utils";
import { matchChatIntent } from "@/lib/chat-intent";

const GAME = { signupBonusPct: 50, reloadBonusPct: 20 };
const GAMES = ["Juwa 777", "Orion Stars", "Game Vault", "Milky Way"];

describe("R3/R4 bonus rules", () => {
  it("shows signup on a main tile for a regular player", () => {
    expect(bonusLine(GAME, { onTile: true })).toBe("Signup +50%");
    expect(tileBonusText(GAME, { onTile: true })).toBe(
      "Signup +50% · Reload +20%",
    );
  });

  it("hides signup for Paid + Active (R3), reload still shows", () => {
    expect(bonusLine(GAME, { onTile: true, isPaid: true, isActive: true })).toBeNull();
    expect(tileBonusText(GAME, { onTile: true, isPaid: true, isActive: true })).toBe(
      "Reload +20%",
    );
  });

  it("restores signup when Paid but still Creating, or untagged", () => {
    expect(bonusLine(GAME, { onTile: true, isPaid: true, isActive: false })).toBe(
      "Signup +50%",
    );
    expect(bonusLine(GAME, { onTile: true, isPaid: false, isActive: true })).toBe(
      "Signup +50%",
    );
  });

  it("never shows bonus off the main tile (R4)", () => {
    expect(bonusLine(GAME, { onTile: false })).toBeNull();
    expect(bonusLine(GAME, { onTile: false, isPaid: true, isActive: true })).toBeNull();
  });

  it("formats reload text", () => {
    expect(formatReload(GAME)).toBe("Reload +20%");
  });
});

describe("tag normalization", () => {
  it("lowercases and trims", () => {
    expect(normalizeTag("  Paid ")).toBe("paid");
    expect(normalizeTag("High Roller")).toBe("high roller");
    expect(normalizeTag("VIP")).toBe("vip");
  });
});

describe("username generation", () => {
  it("produces unique game-prefixed usernames", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const u = generateUsername("juwa-777");
      expect(u.startsWith("juwa777")).toBe(true);
      seen.add(u);
    }
    expect(seen.size).toBe(200);
  });
});

describe("deposit amount validation", () => {
  it("accepts 1–5000", () => {
    expect(depositAmountSchema.safeParse(1).success).toBe(true);
    expect(depositAmountSchema.safeParse(5).success).toBe(true);
    expect(depositAmountSchema.safeParse(5000).success).toBe(true);
    expect(depositAmountSchema.safeParse(100).success).toBe(true);
  });
  it("rejects out-of-range values", () => {
    expect(depositAmountSchema.safeParse(0).success).toBe(false);
    expect(depositAmountSchema.safeParse(0.5).success).toBe(false);
    expect(depositAmountSchema.safeParse(5000.01).success).toBe(false);
    expect(depositAmountSchema.safeParse(-10).success).toBe(false);
    expect(depositAmountSchema.safeParse("abc").success).toBe(false);
  });
  it("validateDepositAmount returns null when valid, message when not", () => {
    expect(validateDepositAmount(50)).toBeNull();
    expect(validateDepositAmount(1)).toBeNull();
    expect(validateDepositAmount(0)).not.toBeNull();
  });
});

describe("chat intent matcher", () => {
  it("routes exact game names to account_request (Game Vault guard)", () => {
    expect(matchChatIntent("Game Vault", GAMES)).toBe("account_request");
    expect(matchChatIntent("juwa 777", GAMES)).toBe("account_request");
    expect(matchChatIntent("  Milky Way  ", GAMES)).toBe("account_request");
  });

  it("routes list requests to games_list", () => {
    expect(matchChatIntent("game list", GAMES)).toBe("games_list");
    expect(matchChatIntent("what games do you have?", GAMES)).toBe("games_list");
    expect(matchChatIntent("free play", GAMES)).toBe("games_list");
  });

  it("handles typos and Roman Urdu", () => {
    expect(matchChatIntent("salaaam", GAMES)).toBe("greeting");
    expect(matchChatIntent("deposite karna hai", GAMES)).toBe("deposit");
    expect(matchChatIntent("pese jama karne hain", GAMES)).toBe("deposit");
    expect(matchChatIntent("game chahiye", GAMES)).toBe("account_request");
    expect(matchChatIntent("account bana do", GAMES)).toBe("account_request");
    expect(matchChatIntent("shukriya", GAMES)).toBe("thanks");
    expect(matchChatIntent("thank you", GAMES)).toBe("thanks");
    expect(matchChatIntent("no thank you", GAMES)).toBe("closing");
    expect(matchChatIntent("no thanks", GAMES)).toBe("closing");
    expect(matchChatIntent("that's all", GAMES)).toBe("closing");
    expect(matchChatIntent("nothing else", GAMES)).toBe("closing");
    expect(matchChatIntent("ok bye", GAMES)).toBe("closing");
    expect(matchChatIntent("aur kuch nahi chahiye", GAMES)).toBe("closing");
  });

  it("routes cashout mentions to the cashout intent (manual handling)", () => {
    expect(matchChatIntent("paisa nikalna hai", GAMES)).toBe("cashout");
    expect(matchChatIntent("I want to withdraw", GAMES)).toBe("cashout");
  });

  it("stays silent on anything else", () => {
    expect(matchChatIntent("ok", GAMES)).toBe("silent");
    expect(matchChatIntent("", GAMES)).toBe("silent");
    expect(matchChatIntent("hmm interesting", GAMES)).toBe("silent");
  });
});
