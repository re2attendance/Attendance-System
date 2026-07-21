import Link from "next/link";

import { PageHeading } from "@/components/ui/page-heading";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · UPSA Attendance" };

export default function SignInPage() {
  return (
    <>
      <PageHeading title="Welcome back" emoji="🤗">
        Sign in to record and check your attendance.
      </PageHeading>

      <SignInForm />

      <p className="text-ink-soft mt-8 text-[0.9375rem]">
        New here?{" "}
        <Link href="/sign-up" className="text-brand-600 hover:text-brand-700 rounded font-semibold">
          Create an account
        </Link>
      </p>
    </>
  );
}
