/** Form-level error message.
 *
 * role="alert" makes assistive tech announce it the moment it appears. A plain
 * <p> would look identical and be silently missed by a screen-reader user, who
 * would have no idea the submit failed.
 *
 * Uses the danger tokens, not literal reds: Tailwind's `dark:` variant follows
 * prefers-color-scheme and would ignore an explicit [data-theme] choice. */
export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger"
    >
      {children}
    </p>
  );
}
