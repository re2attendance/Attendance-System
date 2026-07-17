import type { Metadata } from "next";

import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Set a new password · Attendance" };

/* Reachable only with a recovery session, which the emailed link establishes
   via /auth/callback. Someone arriving without one is not blocked here — the
   updateUser call simply fails, and the form says so. Guarding it in the page
   would mean trusting a cookie to decide, which is the thing middleware is not
   allowed to do (ADR-005). */
export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
