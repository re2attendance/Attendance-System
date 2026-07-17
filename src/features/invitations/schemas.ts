import { z } from "zod";

import { emailSchema, passwordSchema } from "@/features/auth";

/* These describe invitations, not authentication. They lived in features/auth
   only because the email and password primitives do — which is exactly what a
   feature's index.ts is for, and exactly what the import-boundary rule caught.

   One schema per form, used by React Hook Form AND the Server Action: the
   client check saves a round-trip, the server parse is the one that counts, and
   two copies would drift in the client's favour. */

export const acceptInviteSchema = z
  .object({
    token: z.string().min(1),
    fullName: z
      .string()
      .min(1, "Enter your full name.")
      .max(120, "That name is too long.")
      .transform((v) => v.trim()),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "instructor", "course_rep", "student"]),
  scopeType: z.enum([
    "global",
    "institution",
    "faculty",
    "department",
    "course",
    "class_section",
  ]),
  scopeId: z.uuid().nullable().default(null),
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
