export function OrDivider() {
  return (
    <div className="flex items-center gap-4" aria-hidden="true">
      <span className="bg-line h-px flex-1" />
      <span className="text-ink-faint text-[0.8125rem]">or</span>
      <span className="bg-line h-px flex-1" />
    </div>
  );
}
