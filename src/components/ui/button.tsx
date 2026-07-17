import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/* Adapted from shadcn's button. shadcn components live in this repo and are
   ours to edit (§3), so this is conformed to the design direction rather than
   left stock. Changes from upstream, each deliberate:

   · rounded-md → rounded-control (6px). §11.4 fixes control radius at 6.
   · shadow-xs dropped from `outline`. §11.4: shadows exist only on things that
     float above the page — popover, dialog, sheet, dropdown, toast. A button
     sits on the page.
   · text-sm → text-14. Upstream means 14px by `text-sm`; our scale is named by
     pixel size (§11.2) so `text-sm` does not exist and the build stops. That is
     the point of the naming — when this component was first imported the scale
     still reused Tailwind's names, `text-sm` silently resolved to 13px, and the
     button was a step small until someone noticed by eye.
   · focus ring removed. globals.css puts a 2px --signal outline on every
     :focus-visible element, which is one of yellow's five sanctioned uses.
     Keeping shadcn's ring-[3px] would double it up.
   · default height 36 → 44. §11.4 sets a 44×44 minimum hit target everywhere.
     `sm` and `xs` stay available for pointer-dense desktop surfaces (table row
     actions), so the accessible size is the default and going smaller is an
     explicit, local decision.
   · `default` variant is the yellow fill with --ink text (~12:1) — sanctioned
     use #1 of five. There is no other yellow in this file. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-control text-14 font-medium whitespace-nowrap transition-colors duration-150 ease-out outline-none disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-line bg-paper text-ink hover:bg-wash",
        secondary:
          "bg-secondary text-secondary-foreground border border-line hover:bg-wash",
        ghost: "text-ink hover:bg-wash",
        link: "text-deep underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3",
        sm: "h-9 gap-1.5 px-3 has-[>svg]:px-2.5",
        xs: "h-6 gap-1 rounded-chip px-2 text-12 has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        lg: "h-12 px-6 has-[>svg]:px-4",
        icon: "size-11",
        "icon-sm": "size-9",
        "icon-xs": "size-6 rounded-chip [&_svg:not([class*='size-'])]:size-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
