import type { ReactNode } from "react";

/**
 * A screen's title and subtitle, with an optional emoji.
 *
 * The emoji is the reason this is a component rather than markup repeated on two pages.
 * Dropping one into a 2rem heading distorts the layout in two ways that are easy to miss
 * on a desktop browser and obvious on a phone:
 *
 *   1. **It orphans.** "Create your account 🎒" wraps to three lines on a narrow screen
 *      and leaves the emoji alone on the last one. So the emoji is bound to the final
 *      word with a non-breaking space inside a `whitespace-nowrap` span — the pair moves
 *      as a unit or not at all.
 *
 *   2. **It grows the line.** Emoji come from a system font whose ascent and descent
 *      exceed the Latin face's, so an inline emoji can push the heading's line box taller
 *      and shift everything beneath it. `inline-block` with `leading-none` caps the span's
 *      height at its own font size, which is smaller than the line it sits on.
 *
 * It is `aria-hidden` because the heading text already says everything: a screen reader
 * announcing "Welcome back, smiling face with open hands" is noise, not information.
 */
export function PageHeading({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji?: string;
  children?: ReactNode;
}) {
  const words = title.trim().split(" ");
  const lastWord = words.pop() ?? "";
  const leadingWords = words.join(" ");

  return (
    <div className="mb-8">
      <h1 className="text-ink text-[2rem] leading-[1.15] font-bold tracking-[-0.02em]">
        {leadingWords ? `${leadingWords} ` : null}
        <span className="whitespace-nowrap">
          {lastWord}
          {emoji ? (
            <>
              {" "}
              <span
                aria-hidden="true"
                className="inline-block align-[-0.06em] text-[0.8em] leading-none"
              >
                {emoji}
              </span>
            </>
          ) : null}
        </span>
      </h1>
      {children ? <p className="text-ink-soft mt-2 text-[0.9375rem]">{children}</p> : null}
    </div>
  );
}
