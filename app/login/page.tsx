import type { Metadata } from "next";
import { AuthShell } from "@/app/components/auth/auth-shell";
import { LoginForm } from "@/app/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in · Chat",
};

/** searchParams is a Promise in Next 16 — it must be awaited. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;

  // Only accept a relative path. An attacker-supplied absolute URL here would
  // turn login into an open redirect: ?callbackUrl=https://evil.example sends
  // the user off-site straight after authenticating.
  const raw = params.callbackUrl;
  const callbackUrl =
    raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to continue to your conversations."
      footerPrompt="New here?"
      footerLinkHref="/signup"
      footerLinkLabel="Create an account"
    >
      <LoginForm callbackUrl={callbackUrl} initialError={params.error} />
    </AuthShell>
  );
}
