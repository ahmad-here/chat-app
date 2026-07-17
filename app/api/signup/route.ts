import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/mongodb";
import { normalizeEmail, validateSignup } from "@/lib/validation";
import type { UserDoc } from "@/lib/types";

/** Account creation.
 *
 * Auth.js has no signup endpoint for credentials — it only ever verifies an
 * existing user (auth.ts `authorize`). Creating the user is the app's job. */

// bcrypt is deliberately slow, which is the point: it makes offline brute-force
// of a stolen hash expensive. 12 rounds is the usual balance in 2026 — high
// enough to hurt an attacker, low enough (~200ms) not to hurt signup.
const BCRYPT_ROUNDS = 12;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { name, email, password } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Re-validated server-side: the client checks are UX only and can be skipped
  // entirely by posting straight to this endpoint.
  const fieldErrors = validateSignup({ name, email, password });
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ fieldErrors }, { status: 400 });
  }

  const normalizedEmail = normalizeEmail(email);
  const db = await getDb();
  const users = db.collection<UserDoc>("users");

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  try {
    await users.insertOne({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      image: null,
      createdAt: new Date(),
    } as UserDoc);
  } catch (error) {
    // Rely on the unique index rather than a read-then-write check: two
    // concurrent signups can both see "email free" before either inserts, and
    // only the database can settle that race. 11000 = duplicate key.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: unknown }).code === 11000
    ) {
      return NextResponse.json(
        { fieldErrors: { email: "An account with this email already exists." } },
        { status: 409 },
      );
    }
    console.error("[signup] insert failed", error);
    return NextResponse.json(
      { error: "Could not create the account. Please try again." },
      { status: 500 },
    );
  }

  // No session is issued here. The client signs in immediately afterwards via
  // Auth.js, so there is exactly one code path that mints a session.
  return NextResponse.json({ ok: true }, { status: 201 });
}
