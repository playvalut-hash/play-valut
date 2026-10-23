/**
 * Staff permission metadata (Build 43) — plain module (NOT a server
 * actions file) so client components can import the labels directly.
 */
import type { StaffPermissionKey } from "./_actions";

export const STAFF_PERMISSION_META: Array<{
  key: StaffPermissionKey;
  label: string;
  hint: string;
}> = [
  {
    key: "player_block",
    label: "Block / Unblock players",
    hint: "Blocked players are locked out of the app until unblocked.",
  },
  {
    key: "chat_clear",
    label: "Clear player chat",
    hint: "Deletes a player's whole chat history. Cannot be undone.",
  },
  {
    key: "shortcuts_manage",
    label: "Manage text shortcuts",
    hint: "Create and edit the shared chat shortcuts (text expander) for all staff.",
  },
  {
    key: "player_delete",
    label: "Delete players",
    hint: "Permanently deletes the player, their accounts, deposits and chat. Cannot be undone.",
  },
];
