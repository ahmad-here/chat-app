/** End-to-end verification of the friends + real-time chat flow.
 *
 * Spins up an in-memory mongod, boots the real custom server (server.mts, so
 * Socket.IO is genuinely attached), then drives two independent users through
 * the actual HTTP and WebSocket surfaces. Nothing is mocked: two real socket
 * clients, one sends, the other must receive.
 *
 * Run: npm run verify:chat
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import crypto from "node:crypto";
import { io as ioClient } from "socket.io-client";

const PORT = 3333;
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

const server = spawn(process.execPath, ["server.mts"], {
  env: {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(PORT),
    MONGODB_URI: uri,
    MONGODB_DB: "verify",
    AUTH_SECRET: crypto.randomBytes(32).toString("base64"),
    AUTH_URL: BASE,
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

/** Signs up + logs in, returning the session cookie. */
async function makeUser(name, email, password) {
  const signup = await fetch(`${BASE}/api/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (signup.status !== 201) throw new Error(`signup failed: ${signup.status}`);

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
    body: new URLSearchParams({ email, password, csrfToken, redirect: "false", json: "true" }),
    redirect: "manual",
  });
  const session = (res.headers.getSetCookie?.() ?? []).find((c) =>
    c.includes("session-token"),
  );
  if (!session) throw new Error("no session cookie");
  return session.split(";")[0];
}

const api = (cookie) => async (path, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...init.headers },
  });

/** Opens a socket carrying a real session cookie, exactly as a browser would. */
function connectSocket(cookie) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BASE, {
      path: "/socket.io",
      extraHeaders: { Cookie: cookie },
      transports: ["websocket"],
      reconnection: false,
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
    setTimeout(() => reject(new Error("socket connect timeout")), 15000);
  });
}

try {
  // The custom server compiles the app on first request, so wait generously.
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${BASE}/login`);
      if (r.ok) { ready = true; break; }
    } catch {}
    await sleep(1000);
  }
  if (!ready) {
    console.error("server never became ready\n", serverLog.slice(-3000));
    process.exit(1);
  }

  const stamp = Date.now();
  const aliceCookie = await makeUser("Alice", `alice${stamp}@example.com`, "password-alice");
  const bobCookie = await makeUser("Bob", `bob${stamp}@example.com`, "password-bob");
  const alice = api(aliceCookie);
  const bob = api(bobCookie);

  // ---- connect codes ----
  const aliceCode = (await (await alice("/api/me/code")).json()).code;
  const bobCode = (await (await bob("/api/me/code")).json()).code;
  check("each user gets a connect code", Boolean(aliceCode && bobCode));
  check("codes are distinct", aliceCode !== bobCode);
  check("code is stable across reads", aliceCode === (await (await alice("/api/me/code")).json()).code);
  check(
    "code avoids ambiguous characters (no I/O/0/1)",
    !/[IO01]/.test(aliceCode),
    `got ${aliceCode}`,
  );

  // ---- cannot connect to yourself ----
  const self = await alice("/api/friends/connect", {
    method: "POST",
    body: JSON.stringify({ code: aliceCode }),
  });
  check("cannot connect with your own code", self.status === 400, `got ${self.status}`);

  // ---- bad code ----
  const bogus = await alice("/api/friends/connect", {
    method: "POST",
    body: JSON.stringify({ code: "ZZZZZZZZ" }),
  });
  check("unknown code is rejected", bogus.status === 404, `got ${bogus.status}`);

  // ---- connect ----
  const connect = await alice("/api/friends/connect", {
    method: "POST",
    body: JSON.stringify({ code: bobCode }),
  });
  check("connecting with a valid code succeeds", connect.status === 201, `got ${connect.status}`);

  // Symmetric: Bob should see Alice without doing anything.
  const bobFriends = (await (await bob("/api/friends")).json()).friends;
  check("friendship is symmetric (Bob sees Alice)", bobFriends.some((f) => f.name === "Alice"));

  // Duplicate connect is a no-op, not an error, and must not create a second row.
  const again = await bob("/api/friends/connect", {
    method: "POST",
    body: JSON.stringify({ code: aliceCode }),
  });
  const againBody = await again.json();
  check("re-connecting is a no-op, not a duplicate", again.status === 200 && againBody.alreadyConnected === true);
  check("still exactly one friend after re-connect", (await (await bob("/api/friends")).json()).friends.length === 1);

  // Alice's view of her friends — i.e. Bob. (bobFriends[0] is *Alice*; using it
  // here would have Alice starting a chat with herself.)
  const aliceFriends = (await (await alice("/api/friends")).json()).friends;
  check("Alice sees Bob as a friend", aliceFriends.length === 1 && aliceFriends[0].name === "Bob");
  const bobId = aliceFriends[0].id;
  check("friend has no chat before one is started", aliceFriends[0].chatId === null);

  // ---- start chat (twice, concurrently: must yield ONE conversation) ----
  const [c1, c2] = await Promise.all([
    alice("/api/chats", { method: "POST", body: JSON.stringify({ friendId: bobId }) }),
    alice("/api/chats", { method: "POST", body: JSON.stringify({ friendId: bobId }) }),
  ]);
  const chatId1 = (await c1.json()).chatId;
  const chatId2 = (await c2.json()).chatId;
  check("concurrent 'Start chat' yields ONE conversation", chatId1 === chatId2, `${chatId1} vs ${chatId2}`);

  const chatId = chatId1;

  // ---- a stranger cannot start a chat with a non-friend ----
  const strangerCookie = await makeUser("Mallory", `mallory${stamp}@example.com`, "password-mallory");
  const mallory = api(strangerCookie);
  const intrude = await mallory("/api/chats", {
    method: "POST",
    body: JSON.stringify({ friendId: bobId }),
  });
  check("cannot start a chat with a non-friend", intrude.status === 403, `got ${intrude.status}`);

  // ---- a stranger cannot read the conversation ----
  const peek = await mallory(`/api/chats/${chatId}/messages`);
  check("non-participant cannot read history (404, not empty)", peek.status === 404, `got ${peek.status}`);

  // ---- sockets ----
  const anon = ioClient(BASE, { path: "/socket.io", transports: ["websocket"], reconnection: false });
  const anonRejected = await new Promise((resolve) => {
    anon.on("connect", () => resolve(false));
    anon.on("connect_error", () => resolve(true));
    setTimeout(() => resolve(false), 8000);
  });
  anon.disconnect();
  check("socket without a session is rejected", anonRejected);

  const aliceSocket = await connectSocket(aliceCookie);
  const bobSocket = await connectSocket(bobCookie);
  check("authenticated sockets connect", aliceSocket.connected && bobSocket.connected);

  // A non-participant must not be able to join by guessing the room.
  const mallorySocket = await connectSocket(strangerCookie);
  const malloryJoined = await new Promise((resolve) => {
    mallorySocket.emit("chat:join", chatId, (ok) => resolve(ok));
    setTimeout(() => resolve(null), 5000);
  });
  check("non-participant is refused the room", malloryJoined === false, `got ${malloryJoined}`);

  const aliceJoined = await new Promise((resolve) => {
    aliceSocket.emit("chat:join", chatId, (ok) => resolve(ok));
    setTimeout(() => resolve(null), 5000);
  });
  const bobJoined = await new Promise((resolve) => {
    bobSocket.emit("chat:join", chatId, (ok) => resolve(ok));
    setTimeout(() => resolve(null), 5000);
  });
  check("participants join the room", aliceJoined === true && bobJoined === true);

  // ---- THE ACTUAL POINT: Alice sends, Bob receives, in real time ----
  const bobReceived = new Promise((resolve) => {
    bobSocket.on("message:new", (m) => resolve(m));
    setTimeout(() => resolve(null), 8000);
  });
  const aliceEcho = new Promise((resolve) => {
    aliceSocket.on("message:new", (m) => resolve(m));
    setTimeout(() => resolve(null), 8000);
  });
  const malloryLeak = new Promise((resolve) => {
    mallorySocket.on("message:new", (m) => resolve(m));
    setTimeout(() => resolve(null), 6000);
  });

  aliceSocket.emit("message:send", { chatId, content: "Hello Bob, this is real." });

  const got = await bobReceived;
  check("Bob receives Alice's message over the socket", got?.content === "Hello Bob, this is real.", `got ${JSON.stringify(got)}`);
  check("the author also gets the echo (no optimistic insert needed)", (await aliceEcho)?.content === "Hello Bob, this is real.");
  check("non-participant receives NOTHING", (await malloryLeak) === null);

  // ---- persistence ----
  const history = (await (await bob(`/api/chats/${chatId}/messages`)).json()).messages;
  check("message is persisted and refetchable", history.length === 1 && history[0].content === "Hello Bob, this is real.");
  check("message records its author", history[0].authorId && history[0].role === "user");

  // ---- empty / oversized messages rejected ----
  const emptyAck = await new Promise((resolve) => {
    aliceSocket.emit("message:send", { chatId, content: "   " }, (r) => resolve(r));
    setTimeout(() => resolve(null), 5000);
  });
  check("blank message is rejected", emptyAck?.ok === false, `got ${JSON.stringify(emptyAck)}`);

  // ---- delete is per-user ----
  await alice(`/api/chats/${chatId}`, { method: "DELETE" });
  const aliceHome = await fetch(`${BASE}/`, { headers: { Cookie: aliceCookie } });
  const aliceHtml = await aliceHome.text();
  check("after delete, chat is hidden from Alice's list", !aliceHtml.includes(">Bob<"));
  const bobStillHas = (await (await bob(`/api/chats/${chatId}/messages`)).json()).messages;
  check("Bob keeps the conversation and history", bobStillHas.length === 1);

  // A new message brings it back for Alice.
  bobSocket.emit("message:send", { chatId, content: "You still there?" });
  await sleep(1500);
  const aliceHome2 = await fetch(`${BASE}/`, { headers: { Cookie: aliceCookie } });
  check("a new message un-hides the chat for Alice", (await aliceHome2.text()).includes(">Bob<"));

  aliceSocket.disconnect();
  bobSocket.disconnect();
  mallorySocket.disconnect();
} catch (error) {
  console.error("\nverification threw:", error);
  console.error(serverLog.slice(-3000));
  fail++;
} finally {
  server.kill();
  await mongo.stop();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
