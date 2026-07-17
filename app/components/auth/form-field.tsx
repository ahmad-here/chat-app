interface FormFieldProps {
  id: string;
  label: string;
  type: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  /** Field-level message. Presence switches the field into its error state. */
  error?: string;
  autoComplete?: string;
  disabled?: boolean;
  /** Rendered under the field when there's no error — e.g. password rules.
   *  Shown up front rather than only after a failure. */
  hint?: string;
}

export function FormField({
  id,
  label,
  type,
  value,
  onChange,
  error,
  autoComplete,
  disabled,
  hint,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        // Tells assistive tech the field is invalid — colour alone doesn't.
        aria-invalid={error ? true : undefined}
        // Points at whichever message is actually rendered, so a screen reader
        // reads it when the field takes focus.
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-1 ${
          error
            ? "border-danger focus-visible:outline-danger"
            : "border-border focus-visible:outline-accent"
        }`}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
