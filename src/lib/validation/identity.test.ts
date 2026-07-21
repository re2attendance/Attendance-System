// These schemas mirror constraints in migration 0004. The tests are written from the
// constraints rather than from the schema code, so a schema edited out of step with the
// database fails here instead of at a Postgres error the student has to read.

import { describe, expect, it } from "vitest";

import { INDEX_LENGTH, emailForIdentifier, emailForIndex, signIn, signUp } from "./identity";

const valid = {
  fullName: "Ama Mensah",
  indexNumber: "10000045",
  password: "correct horse battery",
  classId: "00000000-0000-0000-0000-0000000000e1",
};

describe("signUp", () => {
  it("accepts a well-formed registration", () => {
    expect(signUp.safeParse(valid).success).toBe(true);
  });

  // profiles_index_is_7_digits
  it.each(["1000004", "100000456", "1000004a", "", " 10000045 x"])(
    "rejects the index number %j",
    (indexNumber) => {
      expect(signUp.safeParse({ ...valid, indexNumber }).success).toBe(false);
    },
  );

  // 0021 moved the length from 7 to 8. Pinned explicitly, because a stray edit back to
  // {7} would otherwise only surface as Postgres rejecting a row the form had accepted.
  it("rejects the 7-digit index numbers that 0004 used to allow", () => {
    expect(signUp.safeParse({ ...valid, indexNumber: "1000004" }).success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    expect(signUp.safeParse({ ...valid, password: "short12" }).success).toBe(false);
  });

  it("requires a class, and requires it to look like a uuid", () => {
    expect(signUp.safeParse({ ...valid, classId: "" }).success).toBe(false);
    expect(signUp.safeParse({ ...valid, classId: "class-a" }).success).toBe(false);
  });

  // Regression: z.uuid() enforces RFC 9562 version/variant bits that Postgres does not,
  // so it refuses ids the database accepts — every id in the pgTAP fixtures, and the
  // hand-picked ones the seeded class list will use. The failure mode is a form that
  // rejects a class which genuinely exists.
  it("accepts a class id that Postgres accepts but RFC 9562 does not", () => {
    expect(
      signUp.safeParse({
        ...valid,
        classId: "00000000-0000-0000-0000-0000000000e1",
      }).success,
    ).toBe(true);
  });

  it("trims a name padded with spaces, and rejects one that is only spaces", () => {
    expect(signUp.safeParse({ ...valid, fullName: "  Ama  " }).data?.fullName).toBe("Ama");
    expect(signUp.safeParse({ ...valid, fullName: "   " }).success).toBe(false);
  });

  // The design decision, asserted: there is no email to get wrong (D-069).
  it("takes no email at all — the address is derived, so it cannot mismatch", () => {
    expect("email" in signUp.shape).toBe(false);
  });
});

// The copy is generated from INDEX_LENGTH rather than typed, because it drifted once:
// 0021 moved the rule to 8 and left "Enter your 7-digit index number" on the reset screen,
// telling students the opposite of what the form accepted. This fails if that returns.
describe("error messages track the rule", () => {
  it("quotes the real index length, on both the signup and the sign-in field", () => {
    const signUpMessage = signUp.safeParse({ ...valid, indexNumber: "12" }).error?.issues[0]
      ?.message;
    const signInMessage = signIn.safeParse({ identifier: "12", password: "x" }).error?.issues[0]
      ?.message;

    for (const message of [signUpMessage, signInMessage]) {
      expect(message).toContain(String(INDEX_LENGTH));
      expect(message).not.toMatch(/\b7\b/);
    }
  });
});

describe("emailForIndex", () => {
  it("builds the address 0004 expects", () => {
    expect(emailForIndex("10000045")).toBe("10000045@upsamail.edu.gh");
  });

  // profiles.email is citext, so the database treats these as one address. Anything we
  // derive has to agree with that or the uniqueness check happens on the wrong string.
  it("is lowercase, matching the citext column", () => {
    expect(emailForIndex("10000045")).toBe(emailForIndex("10000045").toLowerCase());
  });
});

describe("signIn", () => {
  it("accepts an 8-digit index number", () => {
    expect(signIn.safeParse({ identifier: "10000045", password: "x" }).success).toBe(true);
  });

  // The admin has no index number and no profile (0004), so the same field has to take
  // an address, and that address is not on the university domain.
  it("accepts an email address, including one off the university domain", () => {
    expect(signIn.safeParse({ identifier: "admin@example.org", password: "x" }).success).toBe(true);
  });

  it.each(["123456", "not-an-email", ""])("rejects the identifier %j", (identifier) => {
    expect(signIn.safeParse({ identifier, password: "x" }).success).toBe(false);
  });

  it("accepts any non-empty password", () => {
    // An account may predate a password-rule change; the login form is the wrong place
    // to tell someone their existing password is too short.
    expect(signIn.safeParse({ identifier: "10000045", password: "old" }).success).toBe(true);
  });

  it("requires a password", () => {
    expect(signIn.safeParse({ identifier: "10000045", password: "" }).success).toBe(false);
  });
});

describe("emailForIdentifier", () => {
  it("expands an index number into its university address", () => {
    expect(emailForIdentifier("10000045")).toBe("10000045@upsamail.edu.gh");
  });

  it("passes an address through untouched but lowercased", () => {
    expect(emailForIdentifier("  Admin@Example.org ")).toBe("admin@example.org");
  });
});
