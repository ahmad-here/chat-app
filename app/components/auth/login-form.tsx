"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormField } from "./form-field";
import { GoogleButton } from "./google-button";
import { AuthDivider } from "./auth-divider";
import { FormAlert } from "./form-alert";

interface LoginFormProps {
  callbackUrl: string;
  /** Error code Auth.js put in the URL after a failed provider redirect. */
  initialError?: string;
}

/** Auth.js error codes are internal identifiers, not user-facing copy.
 *  "OAuthAccountNotLinked" tells a user nothing about what to do next. */
function describeError(code: string): string {
  switch (code) {
    case "CredentialsSignin":
      return "Wrong email or password.";
    case "OAuthAccountNotLinked":
      // The realistic cause: they signed up with a password, and are now trying
      // Google with the same email. Auth.js blocks the automatic link because
      // it can't prove the same person owns both.
      return "This email is already registered with a password. Sign in with your password below.";
    case "OAuthSignin":
    case "OAuthCallback":
      return "Could not sign in with Google. Please try again.";
    case "AccessDenied":
      return "Access denied.";
    default:
      return "Something went wrong. Please try again.";
  }
}

export function LoginForm({ callbackUrl, initialError }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? describeError(initialError) : null,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // redirect: false so a failure can be rendered in place. With the default
      // (true) Auth.js does a full page redirect back to ?error=..., losing
      // whatever the user typed.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(describeError(result.error));
        setIsSubmitting(false);
        return;
      }

      // router.refresh() re-runs the Server Components with the new session
      // cookie. Without it, navigating back to a cached RSC payload can render
      // the signed-out view despite a valid session.
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <FormAlert>{error}</FormAlert>}

      <GoogleButton callbackUrl={callbackUrl} disabled={isSubmitting} />

      <AuthDivider />

      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          disabled={isSubmitting}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          disabled={isSubmitting}
        />

        <button
          type="submit"
          disabled={isSubmitting || !email || !password}
          className="mt-1 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
