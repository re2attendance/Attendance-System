/**
 * Errors a user is allowed to read.
 *
 * Everything else becomes "Something went wrong on our side." — which §11.7
 * rightly calls a bad error message, and which is nevertheless correct for an
 * unexpected one: a raw Postgres error in a toast tells a student nothing they
 * can act on and tells an attacker the shape of the schema.
 *
 * So the rule is: if a user can do something about it, throw an AppError with a
 * message that says what happened and what to do. If they cannot, let it throw
 * and let Sentry see it.
 */
export class AppError extends Error {
  readonly code: string;

  constructor(message: string, code = "app_error") {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

/** The caller is not who they need to be. */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do this.") {
    super(message, "forbidden");
    this.name = "ForbiddenError";
  }
}

/** The caller is not signed in at all. */
export class UnauthenticatedError extends AppError {
  constructor(message = "Sign in to continue.") {
    super(message, "unauthenticated");
    this.name = "UnauthenticatedError";
  }
}

/**
 * Someone else got there first. §6.3's named case: two reps approving the same
 * request, where the loser must see a friendly toast rather than a 500.
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "conflict");
    this.name = "ConflictError";
  }
}
