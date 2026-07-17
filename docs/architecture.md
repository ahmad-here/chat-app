# Architecture

**Status:** Draft. Records decisions made as of 2026-07-17 and the open ones that
block implementation.
**Related:** [requirements.md](./requirements.md) · [ui-guidelines.md](./ui-guidelines.md) · [roadmap.md](./roadmap.md)

Per [CLAUDE.md](../CLAUDE.md), major architectural decisions get explained. This
file is where they live.

## 1. Current state

The repository is a **fresh `create-next-app` scaffold**. One commit; the only
application code is [app/layout.tsx](../app/layout.tsx) and
[app/page.tsx](../app/page.tsx). None of the features in
[requirements.md](./requirements.md) exist yet. Everything below is design, not
description — do not read it as a map of code that is already here.

## 2. Decided stack

| Layer | Choice | Source |
|---|---|---|
| Framework | Next.js 16 (App Router) | Installed: `next@16.2.10` |
| Language | TypeScript, strict, no `any` | [CLAUDE.md](../CLAUDE.md) |
| Styling | Tailwind CSS v4 | Installed: `@tailwindcss/postcss` |
| Database | MongoDB | Decided |
| Auth | Auth.js (NextAuth v5) | Decided |
| Real-time | Socket.IO on a custom Node server | Decided — see §3 |
| Hosting | Long-lived Node process (not serverless) | Forced by the real-time decision — see §9 |
| AI | Claude via `@anthropic-ai/sdk` | Not yet installed |

**Next.js 16 diverges from training data.** [AGENTS.md](../AGENTS.md) says so
explicitly, and the version-exact docs ship in the repo at
`node_modules/next/dist/docs/`. Read those before writing App Router code — the
[nextjs-16 skill](../.claude/skills/nextjs-16/SKILL.md) maps topics to pages.

## 3. The central problem: real-time between users

**Decision: custom Node server + Socket.IO.** Made 2026-07-17.

Human↔human real-time means a message from user A must reach user B's browser
while B is connected. That requires a persistent connection or a push channel.
**Next.js route handlers cannot hold one on a serverless host** — functions are
short-lived and don't share memory, so a Socket.IO server instantiated in a route
handler doesn't survive between invocations and doesn't see connections held by
another instance. This constraint is about the *hosting model*, not Next.js
itself: on a long-running Node process the same code works.

The transport choice and the hosting choice were therefore one decision. The
options considered:

| Option | How it works | Cost |
|---|---|---|
| Hosted pub/sub (Pusher, Ably) | Server publishes on write; browsers subscribe. Vendor holds the sockets. | Works on serverless/Vercel unchanged. Third-party dependency and per-message pricing. |
| **Custom Node server + Socket.IO** ← chosen | Next.js runs behind a long-lived Node process that owns the WebSocket server. | Full control, no vendor, no per-message cost. Gives up serverless deploy; you now run and scale a stateful process. |
| MongoDB Change Streams + SSE | Server tails the oplog and pushes over Server-Sent Events. | No extra vendor; reuses the database already chosen. Needs a long-lived process (same constraint as Socket.IO), and requires a replica set — Change Streams do not work on a standalone `mongod`. |

Socket.IO was chosen over the hosted-pub/sub recommendation: it trades operational
work for full control and no vendor dependency or per-message billing. **This
decision also settles the deployment target** (§9) — the two are inseparable.

### What this commits us to

Sourced from the version-exact guide at
`node_modules/next/dist/docs/01-app/02-guides/custom-server.md`, not from memory.
Next.js explicitly frames a custom server as an "eject" path — fine here, since
holding WebSockets is exactly a requirement its integrated router can't meet.

1. **A `server.js` entrypoint owns the HTTP server.** It creates the Node HTTP
   server, hands requests to Next's `getRequestHandler()`, and attaches Socket.IO
   to the same server. Next accepts the server it runs behind via the `httpServer`
   option.
2. **`server.js` does not run through the Next.js compiler or bundler.** It must
   be syntax-compatible with the Node version running it. A `server.ts` needs its
   own compile step or a loader — TypeScript here does not come for free the way
   it does inside `app/`. Decide this when the file is written.
3. **`output: "standalone"` and a custom server cannot be used together** — the
   docs state this outright: standalone emits its own minimal `server.js` and does
   not trace custom server files. This closes off the standard minimal-Docker
   recipe; a container build has to be assembled differently.
4. **The npm scripts change.** `dev` becomes `node server.js` and `start` becomes
   `NODE_ENV=production node server.js`. `next dev` / `next start` stop being the
   entrypoints, which makes [.claude/skills/dev-server](../.claude/skills/dev-server/SKILL.md)
   stale the moment this lands — update it in the same change.

**Authorize every subscription server-side.** A client must not be able to
subscribe to a conversation it isn't a participant in. With Socket.IO this means
authenticating the socket on connect against the Auth.js session and checking
membership before joining a room — never trusting a room name the client asks
for. Rooms are the natural unit: one room per conversation.

**Scaling past one process is now our problem.** Socket.IO connections are held
in the memory of a single process, so two instances behind a load balancer will
not see each other's connections. If this ever runs on more than one instance it
needs a Socket.IO adapter backed by shared state to broker events between them.
Not a v1 concern at one instance — but it is the thing that breaks first under
horizontal scaling, and it's worth knowing now rather than discovering it during
an incident.

## 4. Auth

Auth.js v5 with the MongoDB adapter (`@auth/mongodb-adapter`).

**Constraint worth knowing before you design the session layer:** the Auth.js
**Credentials provider** (which is what email/password login requires) does not
support database sessions — it only works with **JWT sessions**. The adapter
still handles user persistence, but sessions live in a signed cookie rather than
a sessions collection. This is an upstream design constraint, not a
configuration choice, and it has consequences:

- Revoking a session server-side isn't automatic — a valid JWT stays valid until
  it expires.
- Anything in the JWT is a snapshot from login. Changing a user's name or avatar
  won't appear in the session until the token refreshes.

If server-side session revocation turns out to be a hard requirement, that
changes the auth design and should be raised before implementation starts.

Password hashing must use a slow, salted algorithm designed for passwords
(bcrypt/argon2) — never a bare cryptographic hash.

## 5. Data layer

Collections and fields are in [requirements.md §4](./requirements.md#4-data-model).

**Connection handling.** Next.js dev mode hot-reloads modules, which will open a
new MongoDB connection on every reload and exhaust the pool. Cache the client on
`globalThis` in development — the standard pattern, and what the Auth.js MongoDB
adapter docs show.

**Indexes** are a correctness and performance requirement, not an optimization:

- `users.email` — unique. This is what enforces "reject duplicate emails";
  application-level checking alone races.
- `chats.participantIds` — every authorization check reads it.
- `messages.{chatId, createdAt}` — compound, serves history reads and ordering.

**Whether to use an ODM (Mongoose) or the raw driver is undecided.** The Auth.js
adapter wants a raw `MongoClient`, so a Mongoose-only setup means running both.

## 6. AI integration

Use the official SDK (`@anthropic-ai/sdk`) — not raw `fetch`.

- **Model:** `claude-opus-4-8` (Claude Opus 4.8) unless there's a reason to choose
  otherwise. Model IDs are exact strings and take no date suffix.
- **Streaming:** stream the reply rather than waiting for a complete response —
  it's what makes the assistant feel responsive, and it avoids request timeouts
  on long outputs.
- **Thinking:** for anything non-trivial, adaptive thinking
  (`thinking: { type: "adaptive" }`). Note it must be set explicitly on Opus 4.8
  — omitting the field runs *without* thinking.
- **The API key is server-side only.** It must never reach the browser: no
  `NEXT_PUBLIC_` prefix, no client component imports the SDK. Calls go through a
  route handler.

Two things to settle when this is built (both listed as open questions in
[requirements.md §6](./requirements.md#6-open-questions)): how much conversation
context the assistant receives, and whether partial tokens fan out to other
participants or only the finished message does.

## 7. Component boundaries

Per [CLAUDE.md](../CLAUDE.md): prefer Server Components; use Client Components
only where needed. For this app the boundary falls naturally:

- **Server Components** — conversation list, initial message history, anything
  that reads from MongoDB on load.
- **Client Components** — only what needs interactivity or a live subscription:
  the message input, the live message list, the theme toggle.

The rule of thumb: a component becomes a Client Component when it needs state,
an event handler, or the real-time subscription — and the boundary should sit as
low in the tree as possible so the surrounding page stays server-rendered.

Syntax highlighting is worth calling out. Highlighting libraries are large, and
pulling one into a Client Component ships it to the browser. Highlighting on the
server keeps it out of the bundle — but AI responses stream in and are
highlighted client-side by nature, so this may need both paths. Decide with real
measurements, not upfront.

## 8. Deployment

Not an open choice anymore — the Socket.IO decision (§3) made it. The app must run
as a **long-lived Node process**. Vercel's serverless model is ruled out; the
target is a platform that runs a persistent container or process (Render, Railway,
Fly.io, a VPS, or self-managed containers).

Next.js supports this fully — the deploying guide lists "Node.js server" as
supporting *all* Next.js features. The wrinkles are the custom-server ones in §3:
no `output: "standalone"`, and `server.js` sitting outside the compiler.

Two things to settle at deploy time, neither blocking now:

- **Sticky sessions.** Socket.IO's HTTP long-polling fallback requires every
  request from a client to reach the same process. Behind a load balancer without
  sticky sessions the handshake fails intermittently — a classic
  works-locally-fails-in-prod bug. Pinning to the WebSocket transport avoids it;
  otherwise the balancer needs configuring.
- **Proxy upgrade support.** Any reverse proxy in front must pass through the
  HTTP connection upgrade, or WebSockets never establish.

## 9. Open decisions

Ordered by how much they block. Transport and hosting are now resolved (§3, §8).

1. **Delete semantics** — for-everyone vs for-me changes the `chats` schema.
   See [requirements.md §6](./requirements.md#6-open-questions).
2. **`server.js` vs `server.ts`** (§3) — the entrypoint is outside the Next
   compiler, so TypeScript there needs its own compile step or a loader. Settle
   when the file is written.
3. **ODM vs raw driver** (§5).
4. **AI context scope and streaming fan-out** (§6).
