"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "../actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas";
import { Field } from "@/components/ui/field";

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  /* Success is reported for ANY well-formed address, including ones with no
     account. The action behaves the same way. Telling the truth here — "no such
     user" — would let anyone test which of 10,000 addresses are enrolled. */
  if (sent) {
    return (
      <div className="grid gap-4">
        <h1 className="text-24 font-semibold text-ink">Check your email</h1>
        <p className="text-13 text-mute">
          If that address has an account, a reset link is on its way. It expires
          in one hour.
        </p>
        <p className="text-13">
          <Link href="/login" className="text-deep underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => {
        setFormError(null);
        startTransition(async () => {
          const result = await requestPasswordReset(values);
          if (result?.error) setFormError(result.error);
          else setSent(true);
        });
      })}
      className="grid gap-4"
    >
      <div>
        <h1 className="text-24 font-semibold text-ink">Forgot your password?</h1>
        <p className="mt-1 text-13 text-mute">
          Enter your email and we&rsquo;ll send you a link to set a new one.
        </p>
      </div>

      {formError ? (
        <p
          role="alert"
          className="rounded-control border border-line px-3 py-2 text-13 text-status-absent"
        >
          {formError}
        </p>
      ) : null}

      <Field
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        error={errors.email?.message}
        {...register("email")}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-13">
        <Link href="/login" className="text-deep underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
