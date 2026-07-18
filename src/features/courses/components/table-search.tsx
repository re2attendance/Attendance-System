"use client";

import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useState } from "react";

import { Input } from "@/components/ui/input";

/**
 * Search that lives in the URL (ADR-004), so a filtered list is a shareable
 * link and the back button reaches the unfiltered one. `shallow: false`
 * round-trips to the server, because the filtering is server-side (§3) — the
 * page never downloads rows it then hides.
 *
 * Submit-to-search, not search-as-you-type: one round-trip when the registrar
 * is done typing, not one per keystroke. Any change resets to page 1, because
 * "CSC 401" on page 3 of the unfiltered list is not page 3 of the results.
 */
export function TableSearch({ placeholder }: { placeholder: string }) {
  const [q, setQ] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ shallow: false }),
  );
  const [, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  );
  const [value, setValue] = useState(q);

  return (
    <form
      className="w-full sm:max-w-xs"
      onSubmit={(e) => {
        e.preventDefault();
        void setPage(1);
        void setQ(value.trim() || null);
      }}
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        type="search"
      />
    </form>
  );
}
