import Link from "next/link";

import { OrDivider } from "@/components/ui/divider";
import { GoogleButton } from "@/components/ui/google-button";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · Attendance" };

export default function SignInPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-ink text-[2rem] leading-[1.15] font-bold tracking-[-0.02em]">
          Welcome back
        </h1>
        <p className="text-ink-soft mt-2 text-[0.9375rem]">
          Sign in to record and check your attendance.
        </p>
      </div>

      <div className="space-y-5">
        <GoogleButton label="Continue with Google" />
        <OrDivider />
        <SignInForm />
      </div>

      <p className="text-ink-soft mt-8 text-[0.9375rem]">
        New here?{" "}
        <Link href="/sign-up" className="text-brand-600 hover:text-brand-700 rounded font-semibold">
          Create an account
        </Link>
      </p>
    </>
  );
}
