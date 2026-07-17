"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { login } from "../actions";
import { loginSchema, type LoginInput } from "../schemas";
import { Field } from "@/components/ui/field";

export function LoginForm({ next }: { next?: string }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    // The same schema the action parses. The client check saves a round-trip;
    // the server's is the one that counts.
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", next },
  });

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => {
        setFormError(null);
        startTransition(async () => {
          // On success this redirects and never returns. Only a failure comes
          // back with a value.
          const result = await login(values);
          if (result?.error) setFormError(result.error);
        });
      })}
      className="grid gap-4"
    >
      <div>
        <h1 className="text-24 font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-13 text-mute">
          Use the email your institution invited.
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
        // The keyboard a student gets on a phone. Wrong inputMode is the
        // difference between typing an address and fighting autocapitalise.
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        error={errors.email?.message}
        {...register("email")}
      />

      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />

      <input type="hidden" {...register("next")} />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-13">
        <Link
          href="/forgot-password"
          className="text-deep underline underline-offset-4"
        >
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
