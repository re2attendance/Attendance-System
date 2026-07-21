"use client";

import { AnimatePresence, motion } from "motion/react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { ClassSelect, type ClassOption } from "@/components/ui/class-select";
import { Field, Input } from "@/components/ui/field";
import { FormError } from "@/components/ui/form-error";
import { signUpWithPassword } from "@/lib/auth/actions";
import { env } from "@/lib/env";
import { INDEX_NUMBER } from "@/lib/validation/identity";

export function SignUpForm({ classes }: { classes: ClassOption[] }) {
  const [result, submit, pending] = useActionState(signUpWithPassword, undefined);
  const [indexNumber, setIndexNumber] = useState("");

  const complete = INDEX_NUMBER.test(indexNumber);

  return (
    <form action={submit} className="space-y-5" noValidate>
      <FormError message={result?.error} />

      <Field label="Full name">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="fullName"
            autoComplete="name"
            placeholder="Ama Mensah"
            aria-describedby={describedBy}
            invalid={invalid}
            required
          />
        )}
      </Field>

      <div>
        <Field
          label="Index number"
          hint={complete ? undefined : "The 7 digits on your student ID."}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="indexNumber"
              value={indexNumber}
              onChange={(event) =>
                // Digits only, capped at 7. Filtering as they type is gentler than
                // accepting a wrong value and rejecting it after they press the button.
                setIndexNumber(event.target.value.replace(/\D/g, "").slice(0, 7))
              }
              inputMode="numeric"
              autoComplete="username"
              spellCheck={false}
              placeholder="1000004"
              aria-describedby={describedBy}
              invalid={invalid}
              required
            />
          )}
        </Field>

        {/* The signature moment. 0004 requires the email prefix to equal the index number,
            so rather than ask for the address and reject a mismatch, we show it being
            built (D-069). The student sees the identity the system will hold for them,
            and there is no second field to get wrong. */}
        <AnimatePresence initial={false}>
          {complete ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="bg-brand-50 mt-3 flex items-center gap-2.5 rounded-xl px-4 py-3">
                <svg
                  className="text-brand-600 size-4 shrink-0"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 8.5 6 11.5 13 4.5" />
                </svg>
                <p className="text-ink-soft min-w-0 text-[0.8125rem]">
                  Your university email will be{" "}
                  <span className="text-ink font-semibold break-all">
                    {indexNumber}@{env.NEXT_PUBLIC_UNIVERSITY_EMAIL_DOMAIN}
                  </span>
                </p>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <Field label="Your class">{(props) => <ClassSelect {...props} classes={classes} />}</Field>

      <Field label="Password" hint="At least 8 characters.">
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            aria-describedby={describedBy}
            invalid={invalid}
            required
          />
        )}
      </Field>

      <Button type="submit" busy={pending}>
        Create account
      </Button>
    </form>
  );
}
