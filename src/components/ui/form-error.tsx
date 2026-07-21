/**
 * The form-level failure: wrong password, an account that could not be created.
 *
 * `role="alert"` rather than a polite live region — unlike a field message that fires
 * while someone is still typing, this one only appears after a submission has already
 * failed, so interrupting is the correct behaviour.
 */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="bg-danger-soft text-danger flex gap-2.5 rounded-xl px-4 py-3 text-[0.8125rem]"
    >
      <svg
        className="mt-px size-4 shrink-0"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.4" />
        <path d="M8 5v3.6M8 11h.01" />
      </svg>
      {message}
    </p>
  );
}
