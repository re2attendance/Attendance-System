"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { signInWithPassword } from "@/lib/auth/actions";

export function SignInForm() {
  const [result, submit, pending] = useActionState(signInWithPassword, undefined);

  return (
    <form action={submit} className="space-y-5" noValidate>
      <FormError message={result?.error} />

      <Field label="Index number" hint="Or the email address your account was created with.">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="identifier"
            // inputMode over type="number": a numeric keypad without the spinner, the
            // scroll-wheel value changes, or the silent dropping of a leading zero that
            // type="number" does to an identifier like 0100045.
            inputMode="numeric"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="1000004"
            aria-describedby={describedBy}
            invalid={invalid}
            required
          />
        )}
      </Field>

      <Field
        label="Password"
        action={
          <Link
            href="/forgot-password"
            className="text-brand-600 hover:text-brand-700 rounded text-[0.8125rem] font-medium"
          >
            Forgot password
          </Link>
        }
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            aria-describedby={describedBy}
            invalid={invalid}
            required
          />
        )}
      </Field>

      <Button type="submit" busy={pending}>
        Sign in
      </Button>
    </form>
  );
}
