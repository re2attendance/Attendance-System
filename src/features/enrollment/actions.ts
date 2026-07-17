"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { mintInvitationToken } from "@/features/invitations/server";
import { AppError } from "@/lib/errors";
import { authedAction } from "@/lib/safe-action";
import { planImport } from "./csv-import/plan";

/**
 * The CSV importer's two actions: preview, then commit.
 *
 * Both re-run the same `planImport`. The commit does NOT trust a plan sent back
 * from the client — that would let anyone post a plan that enrols themselves
 * anywhere, and it would also go stale: a section deleted between preview and
 * commit, or a student who accepted an invitation in the meantime. Re-planning
 * costs two queries and removes both problems.
 */

const previewSchema = z.object({
  csv: z.string().min(1, "Choose a file.").max(2_000_000, "That file is too large (2MB limit)."),
  semesterId: z.uuid("Choose a semester."),
});

const commitSchema = previewSchema.extend({
  /**
   * What the preview told the user. If the world changed underneath them
   * — someone deleted a section, a student accepted an invitation — the commit
   * refuses rather than quietly doing something they did not agree to.
   *
   * §0's "every destructive action goes through a confirmation dialog" is about
   * intent, and intent is attached to what they were shown.
   */
  expectedEnroll: z.number().int().min(0),
  expectedInvite: z.number().int().min(0),
});

export const previewRosterImport = authedAction
  .metadata({ name: "preview-roster-import", authorize: "section.manage" })
  .inputSchema(previewSchema)
  .action(async ({ parsedInput }) => {
    const plan = await planImport(parsedInput.csv, parsedInput.semesterId);

    if ("headerError" in plan) {
      throw new AppError(plan.headerError);
    }

    return {
      counts: plan.counts,
      // Capped for the wire. A 300-row import does not need 300 rows of preview
      // to be trustworthy — the counts and every error do the work, and the
      // errors are the part someone acts on.
      sample: plan.rows.slice(0, 50),
      errors: plan.errors.slice(0, 200),
      errorsTruncated: plan.errors.length > 200,
    };
  });

export const commitRosterImport = authedAction
  .metadata({
    name: "commit-roster-import",
    authorize: "section.manage",
    audit: { action: "roster.imported", entityType: "class_section" },
  })
  .inputSchema(commitSchema)
  .action(async ({ parsedInput, ctx }) => {
    const plan = await planImport(parsedInput.csv, parsedInput.semesterId);

    if ("headerError" in plan) throw new AppError(plan.headerError);

    // The world moved between preview and commit.
    if (
      plan.counts.enroll !== parsedInput.expectedEnroll ||
      plan.counts.invite !== parsedInput.expectedInvite
    ) {
      throw new AppError(
        `This file no longer imports what the preview showed — it would now enrol ${plan.counts.enroll} and invite ${plan.counts.invite}. Someone may have changed a section or accepted an invitation. Preview it again.`,
      );
    }

    const importable = plan.rows.filter((r) => r.outcome !== "already_enrolled");

    if (importable.length === 0) {
      throw new AppError(
        plan.counts.alreadyEnrolled > 0
          ? "Every student in this file is already enrolled. Nothing to do."
          : "There is nothing importable in this file.",
      );
    }

    // A token per student who needs inviting. Generated HERE — 256 bits of
    // crypto.randomBytes — and only the hash crosses to the database (§8:
    // hashed at rest). The plaintext exists in this function and, once Phase 9
    // sends the emails, in the invitation link. Nowhere else.
    //
    // Right now nothing emails them, so these invitations are created and
    // unreachable. That is a real gap and it is named in the report rather than
    // hidden: Phase 9 sends them, and until then an admin invites by hand.
    const payload = importable.map((row) => ({
      email: row.email,
      full_name: row.fullName,
      matric_number: row.matricNumber,
      section_id: row.sectionId,
      token_hash: row.outcome === "invite" ? mintInvitationToken().tokenHash : null,
    }));

    const { data, error } = await ctx.supabase
      .rpc("import_roster", { p_rows: payload })
      .single();

    if (error) {
      if (error.code === "42501") {
        throw new AppError("You cannot import a roster.");
      }
      // The RPC is one transaction: if this failed, NOTHING was written. Worth
      // saying, because "did it half-work?" is the first thing a registrar will
      // ask and the answer determines whether they dare retry.
      throw new AppError(
        `The import failed and nothing was changed: ${error.message}`,
      );
    }

    revalidatePath("/admin/sections");
    revalidatePath("/admin/import");

    return {
      enrolled: data.enrolled,
      invited: data.invited,
      alreadyEnrolled: data.already_enrolled,
    };
  });
