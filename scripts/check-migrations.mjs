#!/usr/bin/env node

// Guards the two migration mistakes that Supabase Branching makes expensive.
//
// Branching applies everything in supabase/migrations/ to the PRODUCTION database the
// moment it lands on `main` (D-059). There is no promotion step and no approval gate
// afterwards, so the pull request is the only place anything can be intercepted. This
// runs there, as a required check.
//
// It refuses two things:
//
//   1. Editing a migration that has already been merged. Branching applied it when it
//      landed and will not apply it again, so the edit changes the repo and not the
//      database — and the two silently disagree from then on. Migrations are append-only
//      once merged; write a new one.
//
//   2. Adding a migration that destroys data without saying so. Not a ban: a
//      `-- DESTRUCTIVE: <reason>` line anywhere in the file is enough. The point is that
//      dropping a column is a decision someone made on purpose, and the reason belongs
//      next to the SQL forever rather than in a pull request comment that nobody reads
//      again. Same move the schema makes elsewhere — permitted, but stamped, so it is
//      countable rather than merely possible.
//
// Run locally with `pnpm check:migrations`.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = process.env.MIGRATION_BASE_REF ?? "origin/main";
const DIR = "supabase/migrations/";

// Operations that lose rows or columns. Deliberately not listed: dropping a function,
// trigger, policy, index or constraint. Those are how the schema is edited — 0016 drops
// and recreates check constraints and replaces effective_settings — and none of them
// destroys data. Flagging them would train everyone to add the marker by reflex, which
// is the failure mode this check exists to avoid.
const DESTRUCTIVE = [
  [/\bdrop\s+table\b/, "drop table"],
  [/\bdrop\s+schema\b/, "drop schema"],
  [/\bdrop\s+column\b/, "drop column"],
  [/\btruncate\b/, "truncate"],
  [/\bdelete\s+from\b/, "delete from"],
];

const MARKER = /^[^\S\n]*--[^\S\n]*DESTRUCTIVE:[^\S\n]*\S/m;

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

// Comments are stripped before matching, so prose about TRUNCATE — of which 0012 has
// three lines — is not a finding. Statements are then split apart so that
// `revoke truncate on all tables ...`, which hands a privilege back rather than
// deleting anything, can be told apart from an actual TRUNCATE.
function destructiveOps(source) {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .toLowerCase();

  const found = new Set();
  for (const statement of stripped.split(";")) {
    if (/^\s*(revoke|grant)\b/.test(statement)) continue;
    for (const [pattern, label] of DESTRUCTIVE) {
      if (pattern.test(statement)) found.add(label);
    }
  }
  return [...found];
}

// Diffed against the merge base rather than as a `base...HEAD` commit range, so that
// work in progress counts too. In CI everything is committed and the two are identical;
// locally the range form would report a clean tree right up until you commit, which is
// the wrong moment to find out.
let changes;
try {
  const mergeBase = git("merge-base", BASE, "HEAD").trim();
  changes = git("diff", "--name-status", mergeBase, "--", DIR);
} catch {
  console.error(
    `Cannot diff against ${BASE}. In CI this needs actions/checkout with fetch-depth: 0.`,
  );
  process.exit(2);
}

const problems = [];

for (const line of changes.split("\n").filter(Boolean)) {
  const fields = line.split("\t");
  const status = fields[0][0];
  const path = fields[fields.length - 1];

  if (status === "M" || status === "D" || status === "R") {
    problems.push(
      `${path}\n` +
        `    This migration is already on main, so Branching has already applied it to\n` +
        `    production. Editing it now changes the repo without changing the database.\n` +
        `    Add a new migration instead.`,
    );
    continue;
  }

  if (status !== "A") continue;

  const ops = destructiveOps(readFileSync(path, "utf8"));
  if (ops.length > 0 && !MARKER.test(readFileSync(path, "utf8"))) {
    problems.push(
      `${path}\n` +
        `    Destroys data (${ops.join(", ")}) and does not say why.\n` +
        `    Add a line to the migration:  -- DESTRUCTIVE: <why this is intended>`,
    );
  }
}

if (problems.length > 0) {
  console.error(
    `\nMigration guard failed — ${problems.length} problem(s).\n` +
      `Merging to main deploys these straight to the production database.\n`,
  );
  for (const problem of problems) console.error(`  ${problem}\n`);
  process.exit(1);
}

console.log("Migration guard: clean.");
