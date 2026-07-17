import "server-only";
import { randomInt } from "node:crypto";
import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";
import type { UserDoc } from "./types";

/** Permanent per-user connect codes.
 *
 * A user shares their code; whoever enters it becomes their friend instantly
 * (the code IS the consent — see docs/requirements.md §3.2). */

/** Deliberately excludes I, O, 0, 1 — a code is read aloud and typed by hand,
 *  and those four are the classic misreads. 32 symbols also makes each
 *  character exactly 5 bits. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** 32^8 ≈ 1.1e12 codes. Guessing one specific user's code is hopeless, but a
 *  permanent code is a standing target for *enumeration* — scanning the space
 *  to harvest any valid code. Length alone doesn't fix that; rate limiting the
 *  lookup endpoint does. See RATE_LIMIT in app/api/friends/connect/route.ts. */
export function generateConnectCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    // randomInt is CSPRNG-backed. Math.random() would be predictable enough to
    // let someone reproduce another user's code from a few samples.
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/** Normalises user input: codes are displayed uppercase and may be typed with
 *  spaces or dashes. */
export function normalizeConnectCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isWellFormedConnectCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((char) => ALPHABET.includes(char));
}

/** Returns the user's code, assigning one on first read.
 *
 * Lazy rather than at-signup on purpose. There are three ways a user can exist
 * without a code, and only one of them goes through /api/signup:
 *   1. Google sign-in — @auth/mongodb-adapter's createUser writes the user
 *      directly and never calls our route.
 *   2. Users who predate this feature.
 *   3. Any future user-creation path.
 * Assigning on read covers all three with no migration.
 */
export async function getOrCreateConnectCode(userId: string): Promise<string> {
  const db = await getDb();
  const users = db.collection<UserDoc>("users");
  const _id = new ObjectId(userId);

  const existing = await users.findOne({ _id }, { projection: { connectCode: 1 } });
  if (!existing) throw new Error(`No such user: ${userId}`);
  if (existing.connectCode) return existing.connectCode;

  // Retry: the unique index on connectCode can reject a generated value either
  // because it collided with another user's (astronomically unlikely) or
  // because a concurrent request for THIS user won the race (quite likely — two
  // tabs opening the profile at once).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateConnectCode();
    try {
      const result = await users.findOneAndUpdate(
        // The `connectCode: { $exists: false }` filter is the concurrency guard:
        // only the first writer matches, so a user can never end up with two
        // codes or have their code silently replaced.
        { _id, connectCode: { $exists: false } },
        { $set: { connectCode: code } },
        { returnDocument: "after", projection: { connectCode: 1 } },
      );

      if (result?.connectCode) return result.connectCode;

      // No match: someone else assigned one microseconds ago. Read theirs.
      const now = await users.findOne({ _id }, { projection: { connectCode: 1 } });
      if (now?.connectCode) return now.connectCode;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      // Collided with another user's code — try a different one.
    }
  }

  throw new Error("Could not assign a connect code after several attempts.");
}

/** MongoDB duplicate-key error. Shared so the check isn't rewritten per call
 *  site (signup already does this inline for email). */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  );
}
