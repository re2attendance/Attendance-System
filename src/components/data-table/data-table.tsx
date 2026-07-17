"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";

import { EmptyState } from "@/components/feedback/empty-state";
import { cn } from "@/lib/utils";

/**
 * The table.
 *
 * §11.4: "Tables → cards below `md`. Never horizontal-scroll a data table on a
 * phone. Same query, two presentations, one shared component."
 *
 * So this renders BOTH and lets CSS choose. Not a `useMediaQuery` — that needs
 * JS to decide, which means the server renders one guess and the client
 * corrects it, which is a layout shift on the slowest connection in the room.
 * The markup is duplicated; the query is not. The cost is a few hidden nodes
 * and the benefit is that a student on a cracked phone never sees the wrong
 * layout, even for a frame.
 *
 * Sorting and pagination are SERVER-side (§3: "server-side pagination/sort/
 * filter"), so this component is deliberately dumb: it renders what it is
 * given. `manualPagination`/`manualSorting` tell TanStack not to try. A client
 * that sorts 300 students × 40 sessions has already downloaded 12,000 cells to
 * do it.
 *
 * The card view needs to know what to LABEL each cell with, which a `<td>` gets
 * for free from its column header. Hence `cardLabel` on the column meta — the
 * one thing a caller must think about that a desktop-only table would not ask.
 */

export type DataTableColumn<T> = ColumnDef<T> & {
  meta?: {
    /** Label shown beside the value in the card layout, below `md`. */
    cardLabel?: string;
    /** Hide in the card layout — for columns that are noise on a phone. */
    hideOnMobile?: boolean;
  };
};

export function DataTable<T>({
  columns,
  rows,
  empty,
  rowKey,
  className,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** §11.7: an instruction, not a mood. Every list needs one (§11.8). */
  empty: { title: string; next?: string; action?: React.ReactNode };
  rowKey: (row: T) => string;
  className?: string;
}) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  if (rows.length === 0) {
    return <EmptyState title={empty.title} next={empty.next} action={empty.action} />;
  }

  return (
    <div className={className}>
      {/* ── Desktop: a real table. 44px rows (§11.4). ─────────────────────── */}
      <div className="hidden rounded-card border border-line md:block">
        <table className="w-full border-collapse">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-line">
                {group.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    /* §11.2: uppercase-with-letterspacing is reserved for table
                       column heads ONLY. This is the one place it is allowed,
                       and the reason the rule exists is that it is everywhere
                       else that it goes wrong. */
                    className="px-4 py-2.5 text-left text-12 font-medium tracking-wide text-mute uppercase"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="h-11 border-b border-line last:border-0 hover:bg-wash"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 text-13 text-ink">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Mobile: cards. 56px tappable, 44×44 minimum (§11.4). ──────────── */}
      <ul className="grid gap-2 md:hidden">
        {table.getRowModel().rows.map((row) => (
          <li
            key={rowKey(row.original)}
            className="rounded-card border border-line px-3 py-2.5"
          >
            <dl className="grid gap-1.5">
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as
                  | DataTableColumn<T>["meta"]
                  | undefined;
                if (meta?.hideOnMobile) return null;

                return (
                  <div
                    key={cell.id}
                    className="flex min-h-6 items-baseline justify-between gap-3"
                  >
                    <dt className="shrink-0 text-12 text-mute">
                      {meta?.cardLabel ??
                        (typeof cell.column.columnDef.header === "string"
                          ? cell.column.columnDef.header
                          : cell.column.id)}
                    </dt>
                    <dd
                      className={cn(
                        "min-w-0 text-right text-13 text-ink",
                        // The first column is the row's identity — a name, a
                        // course code. It reads as the card's heading rather
                        // than as one field among several.
                        cell.column.getIndex() === 0 && "font-medium",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
