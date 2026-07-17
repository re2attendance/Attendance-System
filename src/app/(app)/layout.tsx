import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";

/* The signed-in shell. requireUser() redirects to /login if there is no
   session — a convenience, not a gate: middleware already redirected, and RLS
   is what actually protects the data (ADR-005). This is here so a page in this
   group can assume a user exists. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
