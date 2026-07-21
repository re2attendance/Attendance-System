// These schemas mirror constraints in migration 0004. The tests below are written from
// the constraints, not from the schema code, so that a schema edited out of step with the
// database fails here rather than at a Postgres error the student has to read.

import { describe, expect, it } from "vitest";

import { signIn, signUp } from "./identity";

const valid = {
  fullName: "Ama Mensah",
  indexNumber: "1000004",
  email: "1000004@upsamail.edu.gh",
  password: "correct horse battery",
  classId: "00000000-0000-0000-0000-0000000000e1",
};

describe("signUp", () => {
  it("accepts a well-formed registration", () => {
    expect(signUp.safeParse(valid).success).toBe(true);
  });

  // profiles_email_matches_index — the rule that stops someone registering under a
  // classmate's index while typing their own into the form.
  it("rejects an email whose prefix is not the index number", () => {
    const result = signUp.safeParse({ ...valid, email: "1000005@upsamail.edu.gh" });
    expect(result.success).toBe(false);
    // Reported against `email`, not the form as a whole, so the message lands under the
    // field the student has to change.
    expect(result.error?.issues[0]?.path).toEqual(["email"]);
  });

  // profiles_index_is_7_digits
  it.each(["100004", "10000045", "100000a", "", " 1000004 x"])(
    "rejects the index number %j",
    (indexNumber) => {
      expect(signUp.safeParse({ ...valid, indexNumber }).success).toBe(false);
    },
  );

  it("rejects an email from outside the university domain", () => {
    expect(signUp.safeParse({ ...valid, email: "1000004@gmail.com" }).success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    expect(signUp.safeParse({ ...valid, password: "short12" }).success).toBe(false);
  });

  it("requires a class, and requires it to look like a uuid", () => {
    expect(signUp.safeParse({ ...valid, classId: "" }).success).toBe(false);
    expect(signUp.safeParse({ ...valid, classId: "class-a" }).success).toBe(false);
  });

  // Regression: z.uuid() enforces RFC version/variant bits that Postgres does not, so it
  // rejects ids the database accepts — including every id in the pgTAP fixtures and any
  // hand-picked one in the seeded class list. `valid.classId` above is such an id, so
  // this is really asserted by every other test in this block; it is spelled out here
  // because the failure mode is a form that refuses a class that genuinely exists.
  it("accepts a class id that Postgres accepts but RFC 9562 does not", () => {
    const notRfcVersioned = "00000000-0000-0000-0000-0000000000e1";
    expect(signUp.safeParse({ ...valid, classId: notRfcVersioned }).success).toBe(true);
  });

  // The address is lowercased before it is compared, because profiles.email is citext:
  // the database would consider these the same address, so the prefix check must too.
  it("normalises case so the index check matches what the database will store", () => {
    const result = signUp.safeParse({
      ...valid,
      email: "1000004@UPSAMAIL.EDU.GH",
    });
    expect(result.success).toBe(true);
    expect(result.data?.email).toBe("1000004@upsamail.edu.gh");
  });

  it("trims a name padded with spaces, and rejects one that is only spaces", () => {
    expect(signUp.safeParse({ ...valid, fullName: "  Ama  " }).data?.fullName).toBe("Ama");
    expect(signUp.safeParse({ ...valid, fullName: "   " }).success).toBe(false);
  });
});

describe("signIn", () => {
  it("accepts any non-empty password", () => {
    // An account may predate a password-rule change; the login form is the wrong place
    // to tell someone their existing password is too short.
    expect(signIn.safeParse({ email: valid.email, password: "old" }).success).toBe(true);
  });

  it("still requires a university address", () => {
    expect(signIn.safeParse({ email: "someone@gmail.com", password: "whatever" }).success).toBe(
      false,
    );
  });
});
