"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resetPassword } from "../actions";
import { resetPasswordSchema, type ResetPasswordInput } from "../schemas";
import { Field } from "@/components/ui/field";

export function ResetPasswordForm() {
  const router = useRouter();

  const { execute, isPending, result } = useAction(resetPassword, {
    onSuccess() {
      // §11.7: the interface's vocabulary is consistent end to end. The button
      // says "Set new password"; the toast says it in the past tense.
      toast.success("Password changed");
      router.replace("/");
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const serverError = result?.serverError;

  return (
    <form
      noValidate
      onSubmit={handleSubmit((values) => execute(values))}
      className="grid gap-4"
    >
      <div>
        <h1 className="text-24 font-semibold text-ink">Set a new password</h1>
        <p className="mt-1 text-13 text-mute">
          Choose something you don&rsquo;t use anywhere else.
        </p>
      </div>

      {serverError ? (
        <p
          role="alert"
          className="rounded-control border border-line px-3 py-2 text-13 text-status-absent"
        >
          {serverError}
        </p>
      ) : null}

      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={errors.password?.message}
        {...register("password")}
      />

      <Field
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <Button type="submit" disabled={isPending}>
        {isPending ? "Setting…" : "Set new password"}
      </Button>

      <p className="text-13">
        <Link href="/login" className="text-deep underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
