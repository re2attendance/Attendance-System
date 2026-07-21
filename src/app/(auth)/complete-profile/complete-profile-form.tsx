"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { ClassSelect, type ClassOption } from "@/components/ui/class-select";
import { Field, Input } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { completeProfile } from "@/lib/auth/actions";

export function CompleteProfileForm({
  classes,
  suggestedName,
}: {
  classes: ClassOption[];
  suggestedName: string;
}) {
  const [result, submit, pending] = useActionState(completeProfile, undefined);

  return (
    <form action={submit} className="space-y-5" noValidate>
      <FormError message={result?.error} />

      {/* Prefilled from Google, still editable: the name on a Google account is often not
          the name on a class register. */}
      <Field label="Full name">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="fullName"
            defaultValue={suggestedName}
            autoComplete="name"
            placeholder="Ama Mensah"
            aria-describedby={describedBy}
            invalid={invalid}
            required
          />
        )}
      </Field>

      <Field label="Your class">{(props) => <ClassSelect {...props} classes={classes} />}</Field>

      <Button type="submit" busy={pending}>
        Finish setting up
      </Button>
    </form>
  );
}
