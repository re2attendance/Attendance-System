export type ClassOption = { id: string; name: string; level: number };

// A native <select>, not a custom listbox: on a phone it opens the platform picker, which
// is faster, reachable one-handed, and accessible without rebuilding the keyboard, focus
// and screen-reader handling a custom one would need.
export function ClassSelect({
  id,
  describedBy,
  invalid,
  classes,
}: {
  id: string;
  describedBy?: string;
  invalid?: boolean;
  classes: ClassOption[];
}) {
  return (
    // The chevron is a real element rather than a background data-URI, because a data-URI
    // has to hardcode its stroke colour and would stay near-black on the dark theme.
    <div className="relative">
      <select
        id={id}
        name="classId"
        defaultValue=""
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        required
        className="bg-sunken text-ink focus:border-brand-500 focus:ring-brand-500/15 focus:bg-raised h-13 w-full appearance-none rounded-xl border border-transparent px-4 pr-11 transition focus:ring-4 focus:outline-none"
      >
        <option value="" disabled>
          Select your class
        </option>
        {classes.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <svg
        className="text-ink-soft pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 8 4 4 4-4" />
      </svg>
    </div>
  );
}
