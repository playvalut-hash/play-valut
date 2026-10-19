import { redirect } from "next/navigation";

/** Root → player lobby; the proxy sends guests to /login. */
export default function RootPage() {
  redirect("/app");
}
