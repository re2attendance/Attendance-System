import type { Metadata } from "next";

import { LoginForm } from "@/features/auth/components/login-form";
import { safeNextPath } from "@/features/auth";

export const metadata: Metadata = {
  title: "Sign in · Attendance",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Validated here as well as in the action. `next` arrives from the URL, so it
  // is attacker-supplied: an unchecked value makes our own login page an
  // open-redirect — a link that signs you in and bounces you to a clone, with
  // our domain in the address bar the whole way.
  return <LoginForm next={safeNextPath(next) ?? undefined} />;
}
