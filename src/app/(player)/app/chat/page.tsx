import { createClient } from "@/lib/supabase/server";
import ChatClient from "./_chat-client";

/** Messenger-style support chat (F8–F13, F17, F18). */
export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null; // proxy guarantees a session
  return <ChatClient playerId={user.id} />;
}
