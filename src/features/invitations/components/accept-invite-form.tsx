"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { acceptInviteSchema, type AcceptInviteInput } from "@/features/invitations";
import { acceptInvitation } from "../actions";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  instructor: "Instructor",
  course_rep: "Course representative",
  student: "Student",
};

export function AcceptInviteForm({
  token,
  email,
  role,
  institutionName,
}: {
  token: string;
  email: string;
  role: string;
  institutionName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptInviteInput>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { token, fullName: "", password: "", confirmPassword: "" },
  });

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => {
        setFormError(null);
        startTransition(async () => {
          const result = await acceptInvitation(values);
          if (result?.error) setFormError(result.error);
        });
      })}
      className="grid gap-4"
    >
      <div>
        <h1 className="text-24 font-semibold text-ink">Set up your account</h1>
        <p className="mt-1 text-13 text-mute">
          {institutionName} invited you as{" "}
          <span className="text-ink">{ROLE_LABELS[role] ?? role}</span>.
        </p>
      </div>

      {/* The email is shown and not editable. It comes from the invitation, and
          it is what the account will be — accept_invitation() refuses if the
          two disagree. Showing it lets someone spot "that's not my address"
          before they set a password. */}
      <div className="rounded-card border border-line px-3 py-2">
        <div className="text-12 text-mute">Signing up as</div>
        <div className="font-mono text-13 text-ink">{email}</div>
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
        label="Full name"
        autoComplete="name"
        hint="As it should appear on the register."
        error={errors.fullName?.message}
        {...register("fullName")}
      />

      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errors.password?.message}
        {...register("password")}
      />

      <Field
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <input type="hidden" {...register("token")} />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Setting up…" : "Create account"}
      </Button>
    </form>
  );
}
