"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * §0: "Every destructive action goes through a confirmation dialog and an audit
 * log entry." This is the dialog; safe-action writes the entry.
 *
 * The signature is shaped to make a bad confirmation hard to write:
 *
 *   · `consequence` is REQUIRED and is the sentence that does the work. "Are
 *     you sure?" is not a confirmation — it asks a question the user cannot
 *     answer, because it does not tell them what happens. "This voids 47
 *     approved records for 47 students" does.
 *   · `confirmLabel` defaults to nothing, so the button says what it does. §11.7
 *     wants consistent vocabulary end to end: the trigger says "Revoke", the
 *     dialog says "Revoke", the toast says "Revoked".
 *
 * Deliberately NOT a type-the-name-to-confirm dialog. Those train people to
 * type names. The counts in `consequence` are what makes someone stop.
 */
export function ConfirmDialog({
  trigger,
  title,
  consequence,
  confirmLabel,
  destructive = true,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  /** What will actually happen. Include counts. This is the whole point. */
  consequence: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{consequence}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                await onConfirm();
                setOpen(false);
              })
            }
          >
            {isPending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
