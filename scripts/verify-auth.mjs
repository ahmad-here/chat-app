/** End-to-end verification of the auth flow against a real MongoDB.
 *
 * Spins up an in-memory mongod, points a dev server at it, and drives the
 * actual HTTP endpoints — signup, duplicate rejection, and credentials login
 * via the real Auth.js callback. Nothing is mocked.
 *
 * Run: node scripts/verify-auth.mjs
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import crypto from "node:crypto";

const PORT = 3222;
const BASE = `http://localhost:${PORT}`;

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const mongo = await MongoMemoryServer.create();
const uri = mongo.getUri();
console.log(`mongod: ${uri}\n`);

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--port", String(PORT)],
  {
    env: {
      ...process.env,
      MONGODB_URI: uri,
      MONGODB_DB: "verify",
      AUTH_SECRET: crypto.randomBytes(32).toString("base64"),
      AUTH_URL: BASE,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/login`);
      if (r.ok) return true;
    } catch {}
    await sleep(1000);
  }
  return false;
}

try {
  if (!(await waitReady())) {
    console.error("server never became ready\n", serverLog.slice(-2000));
    process.exit(1);
  }

  const email = `user${Date.now()}@example.com`;
  const password = "correct-horse-battery";

  // ---- signup ----
  const signup = await fetch(`${BASE}/api/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Real User", email, password }),
  });
  check("signup returns 201", signup.status === 201, `got ${signup.status}`);

  // ---- the user is actually persisted, hashed ----
  const { MongoClient } = await import("mongodb");
  const client = await new MongoClient(uri).connect();
  const doc = await client.db("verify").collection("users").findOne({ email });
  check("user persisted", Boolean(doc));
  check("password is NOT stored in plaintext", doc?.passwordHash !== password);
  check(
    "passwordHash is a bcrypt hash",
    typeof doc?.passwordHash === "string" && /^\$2[aby]\$/.test(doc.passwordHash),
    `got: ${String(doc?.passwordHash).slice(0, 12)}…`,
  );
  check("email normalised to lowercase", doc?.email === email.toLowerCase());

  // ---- unique index exists (the thing that stops duplicate accounts) ----
  const idx = await client.db("verify").collection("users").indexes();
  const emailIdx = idx.find((i) => i.key?.email === 1);
  check("unique index on users.email", emailIdx?.unique === true);

  // ---- duplicate signup rejected ----
  const dup = await fetch(`${BASE}/api/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Impostor", email, password: "another-password" }),
  });
  const dupBody = await dup.json();
  check("duplicate email rejected with 409", dup.status === 409, `got ${dup.status}`);
  check("duplicate error names the email field", Boolean(dupBody?.fieldErrors?.email));

  // ---- login: real Auth.js credentials callback ----
  async function login(pw) {
    const jar = [];
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    for (const c of csrfRes.headers.getSetCookie?.() ?? []) jar.push(c.split(";")[0]);
    const { csrfToken } = await csrfRes.json();

    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: jar.join("; "),
      },
      body: new URLSearchParams({ email, password: pw, csrfToken, redirect: "false", json: "true" }),
      redirect: "manual",
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const sessionCookie = setCookies.find((c) => c.includes("session-token"));
    return { res, sessionCookie };
  }

  const good = await login(password);
  check("correct password issues a session cookie", Boolean(good.sessionCookie));

  const bad = await login("wrong-password");
  check("wrong password issues NO session cookie", !bad.sessionCookie);

  // ---- the session actually authenticates a request ----
  if (good.sessionCookie) {
    const cookie = good.sessionCookie.split(";")[0];
    const sess = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: cookie } });
    const sessBody = await sess.json();
    check("session endpoint returns the user", sessBody?.user?.email === email.toLowerCase());
    check("session exposes user.id (jwt/session callbacks)", Boolean(sessBody?.user?.id));
    check(
      "session never leaks passwordHash",
      !JSON.stringify(sessBody).includes("passwordHash") &&
        !JSON.stringify(sessBody).includes("$2b$"),
    );

    const home = await fetch(`${BASE}/`, { headers: { Cookie: cookie }, redirect: "manual" });
    check("authenticated GET / is not redirected", home.status === 200, `got ${home.status}`);
  }

  const anon = await fetch(`${BASE}/`, { redirect: "manual" });
  check("anonymous GET / redirects to /login", anon.status === 307);

  await client.close();
} finally {
  server.kill();
  await mongo.stop();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
