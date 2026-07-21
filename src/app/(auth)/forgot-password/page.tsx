import Link from "next/link";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Reset your password · UPSA Attendance" };

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-ink text-[2rem] leading-[1.15] font-bold tracking-[-0.02em]">
          Reset your password
        </h1>
        <p className="text-ink-soft mt-2 text-[0.9375rem]">
          Enter your index number and we will email you a link.
        </p>
      </div>

      <ForgotPasswordForm />

      <p className="text-ink-soft mt-8 text-[0.9375rem]">
        <Link href="/sign-in" className="text-brand-600 hover:text-brand-700 rounded font-semibold">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
