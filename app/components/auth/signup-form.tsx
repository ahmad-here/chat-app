"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormField } from "./form-field";
import { GoogleButton } from "./google-button";
import { AuthDivider } from "./auth-divider";
import { FormAlert } from "./form-alert";
import {
  PASSWORD_MIN_LENGTH,
  validateSignup,
  type FieldErrors,
} from "@/lib/validation";

interface SignupFormProps {
  callbackUrl: string;
}

interface SignupResponse {
  fieldErrors?: FieldErrors;
  error?: string;
}

export function SignupForm({ callbackUrl }: SignupFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // Client-side validation is for fast feedback only. The server runs the
    // same rules from the same module — this can be bypassed entirely.
    const errors = validateSignup({ name, email, password });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!response.ok) {
        const data: SignupResponse = await response.json().catch(() => ({}));
        if (data.fieldErrors) {
          // e.g. "email already exists" from the unique index.
          setFieldErrors(data.fieldErrors);
        } else {
          setFormError(data.error ?? "Could not create the account.");
        }
        setIsSubmitting(false);
        return;
      }

      // Sign in immediately rather than bouncing to /login. The password is
      // already in hand; making them retype it to reach the app they just
      // signed up for is friction with no purpose.
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // The account exists, so don't strand them — send them to login.
        setFormError("Account created, but sign-in failed. Please sign in.");
        setIsSubmitting(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}

      <GoogleButton callbackUrl={callbackUrl} disabled={isSubmitting} />

      <AuthDivider />

      <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        <FormField
          id="name"
          label="Name"
          type="text"
          value={name}
          onChange={setName}
          error={fieldErrors.name}
          autoComplete="name"
          disabled={isSubmitting}
        />
        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={fieldErrors.email}
          autoComplete="email"
          disabled={isSubmitting}
        />
        <FormField
          id="password"
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          autoComplete="new-password"
          disabled={isSubmitting}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
