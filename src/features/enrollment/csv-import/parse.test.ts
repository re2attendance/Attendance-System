import { describe, expect, it } from "vitest";

import { matchHeaders, parseCsv } from "./parse";

/* The CSV importer is the first thing a real administrator touches. These tests
   are mostly about FAILING well, because that is the part that decides whether
   a rollout survives contact with a registrar's actual export. */

const HEADER = "matric_number,full_name,email,course_code,section_code";

function csv(...rows: string[]) {
  return [HEADER, ...rows].join("\n");
}

describe("header matching", () => {
  it("accepts the canonical headers", () => {
    const r = matchHeaders(HEADER);
    expect(r.ok).toBe(true);
  });

  it("accepts the spellings a registrar's export actually uses", () => {
    // Every one of these is the same file from a different office.
    const variants = [
      "Matric No.,Name,Email Address,Course,Section",
      "STUDENT ID,FULL NAME,MAIL,SUBJECT,CLASS",
      "Index Number,Student Name,Email,Course Code,Group",
      "matricno,fullname,email,coursecode,stream",
    ];

    for (const v of variants) {
      expect(matchHeaders(v).ok, v).toBe(true);
    }
  });

  it("is insensitive to case, spaces, punctuation and underscores", () => {
    expect(matchHeaders("  MATRIC_NUMBER , Full-Name , E-mail , course.code , SECTION ").ok).toBe(
      true,
    );
  });

  it("names what is missing AND what it found", () => {
    const r = matchHeaders("matric_number,full_name");
    expect(r.ok).toBe(false);
    if (r.ok) return;

    // Naming the missing columns turns a guessing game into a fix.
    expect(r.message).toContain("email");
    expect(r.message).toContain("courseCode");
    // Echoing what WAS found is how someone spots they uploaded last term's
    // file rather than a file with an odd column name.
    expect(r.message).toContain("matricnumber");
  });
});

describe("parsing", () => {
  it("reads a clean file", () => {
    const result = parseCsv(
      csv(
        "CSC/2021/0001,Kofi Mensah,kofi@st.edu,CSC 401,A",
        "CSC/2021/0002,Ama Owusu,ama@st.edu,CSC 401,A",
      ),
    );
    expect("headerError" in result).toBe(false);
    if ("headerError" in result) return;

    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]!.matricNumber).toBe("CSC/2021/0001");
  });

  it("normalises the things that are the same thing", () => {
    const result = parseCsv(
      csv("  CSC/2021/0003 ,  Yaw   Asante  ,  YAW@ST.EDU  , csc  401 , a "),
    );
    if ("headerError" in result) throw new Error(result.headerError);

    const row = result.rows[0]!;
    expect(row.email).toBe("yaw@st.edu"); // lowercased
    expect(row.courseCode).toBe("CSC 401"); // upper, single-spaced
    expect(row.sectionCode).toBe("A"); // upper
    expect(row.fullName).toBe("Yaw Asante"); // internal whitespace collapsed
  });

  it("handles quoted fields containing commas", () => {
    const result = parseCsv(csv('CSC/2021/0004,"Mensah, Kofi Jr.",k@st.edu,CSC 401,A'));
    if ("headerError" in result) throw new Error(result.headerError);

    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]!.fullName).toBe("Mensah, Kofi Jr.");
  });

  it("handles doubled quotes as an escape", () => {
    const result = parseCsv(csv('CSC/2021/0005,"Kofi ""KK"" Mensah",k@st.edu,CSC 401,A'));
    if ("headerError" in result) throw new Error(result.headerError);

    expect(result.rows[0]!.fullName).toBe('Kofi "KK" Mensah');
  });

  it("strips the UTF-8 BOM Excel adds", () => {
    // Without this the first header is "﻿matric_number", unmatchable, and
    // invisible on screen — the most baffling CSV bug there is.
    const result = parseCsv("﻿" + csv("CSC/2021/0006,Ama,a@st.edu,CSC 401,A"));
    expect("headerError" in result).toBe(false);
  });

  it("handles CRLF and lone-CR line endings", () => {
    const crlf = parseCsv(HEADER + "\r\n" + "CSC/2021/0007,Ama,a@st.edu,CSC 401,A\r\n");
    expect("headerError" in crlf).toBe(false);

    const cr = parseCsv(HEADER + "\r" + "CSC/2021/0008,Ama,a@st.edu,CSC 401,A");
    expect("headerError" in cr).toBe(false);
  });

  it("ignores blank lines rather than reporting them as bad rows", () => {
    const result = parseCsv(
      HEADER + "\n\nCSC/2021/0009,Ama,a@st.edu,CSC 401,A\n\n\n",
    );
    if ("headerError" in result) throw new Error(result.headerError);

    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });
});

describe("failing well", () => {
  it("reports the line number in THEIR file, header included", () => {
    // Their spreadsheet's row 3 must be line 3 here. An off-by-one sends
    // someone to fix the wrong row, and they will fix it.
    const result = parseCsv(
      csv(
        "CSC/2021/0010,Ama,a@st.edu,CSC 401,A", // line 2
        ",Blank Matric,b@st.edu,CSC 401,A", // line 3
      ),
    );
    if ("headerError" in result) throw new Error(result.headerError);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.line).toBe(3);
  });

  it("says what is wrong in a sentence, not a stack trace", () => {
    const result = parseCsv(csv("CSC/2021/0011,Ama,not-an-email,CSC 401,A"));
    if ("headerError" in result) throw new Error(result.headerError);

    expect(result.errors[0]!.message).toBe("the email is not a valid address");
  });

  it("reports EVERY problem in a row at once", () => {
    // Fixing one blank cell only to discover another on the next run is how
    // people stop trusting the preview.
    const result = parseCsv(csv(",,,CSC 401,A"));
    if ("headerError" in result) throw new Error(result.headerError);

    const msg = result.errors[0]!.message;
    expect(msg).toContain("matric number is blank");
    expect(msg).toContain("name is blank");
    expect(msg).toContain("email is blank");
  });

  it("keeps the good rows when some are bad — the preview must show both", () => {
    const result = parseCsv(
      csv(
        "CSC/2021/0012,Ama,a@st.edu,CSC 401,A",
        ",Bad Row,b@st.edu,CSC 401,A",
        "CSC/2021/0013,Yaw,y@st.edu,CSC 401,A",
      ),
    );
    if ("headerError" in result) throw new Error(result.headerError);

    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
  });

  it("catches duplicates WITHIN the file and points at the first occurrence", () => {
    // Two exports concatenated, or a student listed twice. The DB's unique
    // constraint would catch it — but only after the preview promised it would
    // work, which is the failure that matters.
    const result = parseCsv(
      csv(
        "CSC/2021/0014,Ama,a@st.edu,CSC 401,A", // line 2
        "CSC/2021/0015,Yaw,y@st.edu,CSC 401,A", // line 3
        "CSC/2021/0014,Ama Again,a@st.edu,CSC 401,A", // line 4 — dupe of line 2
      ),
    );
    if ("headerError" in result) throw new Error(result.headerError);

    expect(result.rows).toHaveLength(2);
    expect(result.duplicateLines).toEqual([4]);
    expect(result.errors[0]!.message).toContain("line 2");
  });

  it("does not treat the same student in a DIFFERENT section as a duplicate", () => {
    // A student legitimately takes CSC 401 and MTH 401.
    const result = parseCsv(
      csv(
        "CSC/2021/0016,Ama,a@st.edu,CSC 401,A",
        "CSC/2021/0016,Ama,a@st.edu,MTH 401,A",
      ),
    );
    if ("headerError" in result) throw new Error(result.headerError);

    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
  });

  it("refuses an empty file with a sentence", () => {
    const result = parseCsv("");
    expect(result).toEqual({ headerError: "That file is empty." });
  });

  it("refuses a header with no students", () => {
    const result = parseCsv(HEADER);
    expect("headerError" in result).toBe(true);
    if (!("headerError" in result)) return;
    expect(result.headerError).toContain("no students");
  });

  it("treats a short row as blanks, not a crash", () => {
    // A trailing comma dropped by a spreadsheet. Reported, never guessed at.
    const result = parseCsv(csv("CSC/2021/0017,Ama,a@st.edu"));
    if ("headerError" in result) throw new Error(result.headerError);

    expect(result.rows).toHaveLength(0);
    expect(result.errors[0]!.message).toContain("course code is blank");
  });
});
