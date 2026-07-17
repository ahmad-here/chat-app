import Link from "next/link";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footerPrompt: string;
  footerLinkHref: string;
  footerLinkLabel: string;
}

/** Shared frame for login and signup so the two pages can't drift apart. */
export function AuthShell({
  title,
  subtitle,
  children,
  footerPrompt,
  footerLinkHref,
  footerLinkLabel,
}: AuthShellProps) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-raised p-6 shadow-sm">
          <div className="mb-5">
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>
          </div>

          {children}
        </div>

        <p className="mt-4 text-center text-sm text-muted">
          {footerPrompt}{" "}
          <Link
            href={footerLinkHref}
            className="font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {footerLinkLabel}
          </Link>
        </p>
      </div>
    </main>
  );
}
