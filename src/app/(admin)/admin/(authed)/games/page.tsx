import { redirect } from "next/navigation";

import { getAdminSession, getGames } from "../../../_actions";
import GamesManager from "./games-manager";

/** Games Library page — admin CRUD over the games catalog. */
export default async function GamesPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const games = await getGames();
  return <GamesManager admin={session} games={games} />;
}
