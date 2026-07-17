/**
 * The public surface of the invitations feature.
 *
 * THIS FILE MUST BE CLIENT-SAFE. It is imported by both server and client code,
 * and a barrel that re-exports a `server-only` module drags the whole server
 * graph into the browser bundle.
 *
 * Not hypothetical: this file originally re-exported `queries.ts`, and
 * `accept-invite-form.tsx` — a client component — imported the barrel to get a
 * Zod schema. Turbopack refused the build, pointing at supabase/server.ts →
 * next/headers. The schema was innocent; the barrel was not. The failure was
 * loud, which is the only reason it is a footnote rather than a leak.
 *
 * The rule for every feature index in this codebase:
 *
 *   · exportable — schemas, types, and "use server" actions (Next replaces
 *     those with RPC stubs in a client bundle, so naming them here is safe)
 *   · NOT exportable — queries.ts, or anything else carrying `server-only`
 *
 * The app layer imports `./queries` directly: a page is server-side by default,
 * and the structure doc's own table expects pages to render the feature they
 * sit on. If another FEATURE ever needs these queries, add a `server.ts` entry
 * beside this file rather than widening it.
 *
 * Also deliberately absent: tokens.ts. Generation and hashing are internals,
 * and a token helper reachable from elsewhere is an invitation for someone to
 * hash a token somewhere that is not here.
 */

export { createInvitation, acceptInvitation } from "./actions";
export {
  acceptInviteSchema,
  createInvitationSchema,
  type AcceptInviteInput,
  type CreateInvitationInput,
} from "./schemas";
