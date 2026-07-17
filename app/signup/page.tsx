import type { Metadata } from "next";
import { AuthShell } from "@/app/components/auth/auth-shell";
import { SignupForm } from "@/app/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create an account · Chat",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;

  // Same open-redirect guard as the login page: relative paths only.
  const raw = params.callbackUrl;
  const callbackUrl =
    raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start chatting in a few seconds."
      footerPrompt="Already have an account?"
      footerLinkHref="/login"
      footerLinkLabel="Sign in"
    >
      <SignupForm callbackUrl={callbackUrl} />
    </AuthShell>
  );
}
