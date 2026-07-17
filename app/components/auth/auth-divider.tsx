/** "or" rule between the Google button and the credentials form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
