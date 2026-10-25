import { redirect } from "next/navigation";

import {
  getAdminSession,
  getTickerEnabled,
  listOffers,
} from "../../../_actions";
import OffersManager from "./offers-manager";

/** Offers page — admin CRUD over the ticker lines every player sees. */
export default async function OffersPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const [{ offers, needsMigration }, tickerEnabled] = await Promise.all([
    listOffers(session.id),
    getTickerEnabled(session.id),
  ]);
  return (
    <OffersManager
      admin={session}
      offers={offers}
      needsMigration={needsMigration}
      tickerEnabled={tickerEnabled}
    />
  );
}
