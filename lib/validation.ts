/** Shared signup validation.
 *
 * Lives in one module so the client and the server apply identical rules. The
 * client copy is a UX affordance only — the server never trusts it, because a
 * request can be sent without ever loading the page. */

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MAX_LENGTH = 60;

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

/** Field name -> message. Empty object means valid. */
export type FieldErrors = Partial<Record<keyof SignupInput, string>>;

// Deliberately permissive. Strict email regexes reject valid addresses
// (plus-addressing, new TLDs, unicode); real validation is delivering a mail.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignup(input: SignupInput): FieldErrors {
  const errors: FieldErrors = {};

  const name = input.name.trim();
  if (!name) {
    errors.name = "Enter your name.";
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  }

  const email = input.email.trim();
  if (!email) {
    errors.email = "Enter your email.";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!input.password) {
    errors.password = "Enter a password.";
  } else if (input.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  return errors;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
