import Link from "next/link";

import { OrDivider } from "@/components/ui/divider";
import { GoogleButton } from "@/components/ui/google-button";
import { createClient } from "@/lib/supabase/server";
import type { ClassOption } from "@/components/ui/class-select";
import { SignUpForm } from "./sign-up-form";

export const metadata = { title: "Create an account · Attendance" };

export default async function SignUpPage() {
  const supabase = await createClient();

  // Readable by anyone signed in or not — a student has to pick their class before they
  // have an account, so 0012 leaves `classes` publicly selectable.
  const { data } = await supabase
    .from("classes")
    .select("id, name, level")
    .order("level")
    .order("name");

  const classes: ClassOption[] = data ?? [];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-ink text-[2rem] leading-[1.15] font-bold tracking-[-0.02em]">
          Create your account
        </h1>
        <p className="text-ink-soft mt-2 text-[0.9375rem]">Use the details on your student ID.</p>
      </div>

      {classes.length === 0 ? (
        // Not an error the student caused, and not something they can fix — so it says
        // what happened and who fixes it, rather than showing a form whose one required
        // dropdown is empty.
        <p
          role="status"
          className="border-line bg-sunken text-ink-soft rounded-xl border px-4 py-3.5 text-[0.875rem]"
        >
          Signing up is not open yet — no classes have been set up. Ask your administrator to add
          them, then come back.
        </p>
      ) : (
        <div className="space-y-5">
          <GoogleButton label="Sign up with Google" />
          <OrDivider />
          <SignUpForm classes={classes} />
        </div>
      )}

      <p className="text-ink-soft mt-8 text-[0.9375rem]">
        Already have an account?{" "}
        <Link href="/sign-in" className="text-brand-600 hover:text-brand-700 rounded font-semibold">
          Sign in
        </Link>
      </p>
    </>
  );
}
