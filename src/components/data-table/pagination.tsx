"use client";

import { parseAsInteger, useQueryState } from "nuqs";

import { Button } from "@/components/ui/button";

/**
 * Server-side pagination, with the page in the URL.
 *
 * The URL part is the point (ADR-004): a rep filtering their queue and pasting
 * the link to a co-rep should send the queue, not the app. A page number in
 * React state is a page number nobody else can see, and one the back button
 * cannot reach.
 *
 * `shallow: false` makes nuqs round-trip to the server on change, which is what
 * makes this actually server-side rather than a nicer-looking client paginator.
 */
export function DataTablePagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const [, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions({ shallow: false }),
  );

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between gap-4 pt-3">
      {/* Tabular figures so the count does not jitter as pages change (§11.2). */}
      <p className="font-mono text-12 text-mute" data-numeric>
        {from}–{to} of {total}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= lastPage}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
