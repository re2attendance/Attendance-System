"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { requestPasswordReset } from "@/lib/auth/actions";

export function ForgotPasswordForm() {
  const [result, submit, pending] = useActionState(requestPasswordReset, undefined);

  // Success and "no such account" look identical on purpose — see the action.
  if (result?.sent) {
    return (
      <p role="status" className="bg-brand-50 text-ink-soft rounded-xl px-4 py-3.5 text-[0.875rem]">
        If that account exists, a reset link is on its way. Check your university email.
      </p>
    );
  }

  return (
    <form action={submit} className="space-y-5" noValidate>
      <FormError message={result?.error} />

      <Field label="Index number">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="identifier"
            inputMode="numeric"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="10000045"
            aria-describedby={describedBy}
            invalid={invalid}
            required
          />
        )}
      </Field>

      <Button type="submit" busy={pending}>
        Send reset link
      </Button>
    </form>
  );
}
