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
    <select
      id={id}
      name="classId"
      defaultValue=""
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      required
      className="bg-sunken text-ink focus:border-brand-500 focus:ring-brand-500/15 h-13 w-full appearance-none rounded-xl border border-transparent bg-[length:1.25rem] bg-[right_1rem_center] bg-no-repeat px-4 pr-11 transition focus:bg-white focus:ring-4 focus:outline-none"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%235a6478' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 8 4 4 4-4'/%3E%3C/svg%3E\")",
      }}
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
  );
}
