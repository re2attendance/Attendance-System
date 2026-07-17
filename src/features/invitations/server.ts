import "server-only";

/**
 * The SERVER-ONLY public surface of the invitations feature.
 *
 * ADR-013 said: "If another FEATURE ever needs a server-only query, add a
 * `server.ts` entry beside index.ts rather than widening it." This is that day.
 *
 * The CSV importer (features/enrollment) creates invitations for students who
 * have no account, so it needs to mint tokens. It cannot import
 * `invitations/tokens` directly — the boundary rule forbids reaching into
 * another feature's internals, and rightly: a token helper reachable from
 * anywhere is an invitation for someone to hash a token somewhere that is not
 * here. And it cannot come from index.ts, because that file is imported by
 * client components and tokens.ts carries `server-only`.
 *
 * So: two entries. index.ts is the client-safe surface; this is the one that
 * needs a server. Both are feature entry points to eslint-plugin-boundaries.
 */

export { mintInvitationToken, hashToken, INVITE_TTL_DAYS, inviteExpiry } from "./tokens";
export { getInvitationByToken, type InvitationPreview } from "./queries";
