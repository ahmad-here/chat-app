# Architecture

**Status:** Draft. Records decisions made as of 2026-07-17 and the open ones that
block implementation.
**Related:** [requirements.md](./requirements.md) · [ui-guidelines.md](./ui-guidelines.md) · [roadmap.md](./roadmap.md)

Per [CLAUDE.md](../CLAUDE.md), major architectural decisions get explained. This
file is where they live.

## 1. Current state

Auth and real-time 1:1 chat are **built and verified**. What exists:

| Area | Where |
|---|---|
| Custom Node server + Socket.IO | [server.mts](../server.mts) |
| Auth (credentials + Google) | [auth.ts](../auth.ts), [auth.config.ts](../auth.config.ts) |
| Route protection | [proxy.ts](../proxy.ts) (optimistic), [lib/dal.ts](../lib/dal.ts) (real) |
| Data access + authorization | [lib/chat-data.ts](../lib/chat-data.ts) |
| Connect codes | [lib/connect-code.ts](../lib/connect-code.ts) |
| Indexes | [lib/indexes.ts](../lib/indexes.ts), run from [instrumentation.ts](../instrumentation.ts) |
| Socket protocol | [lib/socket-events.ts](../lib/socket-events.ts), [app/components/use-chat-socket.ts](../app/components/use-chat-socket.ts) |

Verified end-to-end against a real MongoDB by `npm run verify:auth` (15 checks)
and `npm run verify:chat` (28 checks — two real sockets exchanging a message).

**Not built:** the AI assistant ([requirements.md §3.4](./requirements.md)),
Markdown rendering and syntax highlighting, and Google OAuth is **unverified**
pending credentials.

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
an incident. The in-memory rate limiter in [lib/rate-limit.ts](../lib/rate-limit.ts)
has exactly the same property, for the same reason.

### As built

**`server.mts` — the extension is load-bearing.** Node 24 strips TypeScript types
natively, so there is no build step (this resolves the old `server.js` vs
`server.ts` question). But `package.json` has no `"type": "module"`, so a `.ts`
file would load as **CommonJS** and its `import` statements would fail. `.mts` is
unconditionally ESM.

Three constraints follow, and each one fails in a way that doesn't point at the
cause:

- Node ESM needs **explicit file extensions** on relative imports, so shared
  modules import each other as `./x.ts` (enabled by `allowImportingTsExtensions`).
- **Never `import "server-only"`** in anything `server.mts` imports. That package
  exists only inside Next's compiled bundle and is unresolvable in plain Node.
  This is why [lib/chat-data.ts](../lib/chat-data.ts) omits it while
  [lib/dal.ts](../lib/dal.ts) keeps it. The safety net is that `mongodb` cannot be
  bundled for the browser, so a client component importing it fails at build.
- tsconfig `paths` (`@/…`) don't resolve — Node never reads tsconfig.

**Socket.IO is attached after `app.prepare()`, and the order matters.** engine.io's
`attach()` captures the HTTP server's existing `upgrade` listeners, removes them,
and installs one that delegates non-matching paths back. Attach before Next has
registered its dev HMR listener and there is nothing to capture — HMR then breaks
silently, with no error, just a dev server that stops hot-reloading. Paths don't
collide (`/socket.io` vs `/_next/webpack-hmr`), and engine.io intercepts its own
path before Next's handler runs — verified: `/socket.io/?EIO=4` returns a
handshake, not a login redirect.

**Handshake auth.** The session JWT is **encrypted** (JWE, A256CBC-HS512), so
`jsonwebtoken` cannot read it — only Auth.js's own `getToken`. It needs a `req`
but reads only `.headers`, so the handshake headers suffice.

> **The trap:** `secureCookie` must be derived from **AUTH_URL's protocol, not
> `NODE_ENV`**. Auth.js picks the cookie name from `url.protocol === "https:"`,
> and the decryption **salt is derived from that same cookie name**. Guess wrong
> and both the name and the salt are wrong, so `getToken` returns `null` and
> every socket silently fails to authenticate. Keying off `NODE_ENV` — the
> obvious guess — breaks the moment production runs behind http, or dev over
> https.

**Message flow.** Client emits `message:send` → server re-checks membership and
persists → server broadcasts `message:new` to the room **including the author**.
The author's client does **not** insert optimistically: rendering only from the
server echo means exactly one code path puts a message on screen, which removes
the duplicate-message bug by construction rather than by deduplication.

**Room authorization.** One room per conversation, name derived from the id. A
`chat:join` is a *request*: the server checks `participantIds` in the database
before honouring it, and answers with an ack so the client knows it was refused.
Verified — a non-participant is refused the room and receives nothing.

**The reconnection gap.** Socket.IO reconnects transparently, which is precisely
what makes this easy to miss: rejoining a room does **not** backfill what was
missed while offline, so the connection looks healthy while the client sits on a
hole in its history. The client refetches `/api/chats/[chatId]/messages` on every
`connect` (not just the first).

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

Password hashing uses bcrypt at 12 rounds (`app/api/signup/route.ts`) — slow by
design, which is what makes a stolen hash expensive to brute-force.

### Google sign-in and account linking

Implemented 2026-07-17. `allowDangerousEmailAccountLinking` is **off**, and that
is a deliberate security decision, not a default we forgot to change.

With it on, signing in with Google would automatically attach to an existing
password account that has the same email. That is unsafe *here* specifically
because **signup does not verify email ownership**: anyone can register
`victim@gmail.com` with a password of their choosing. If Google then auto-linked,
the moment the real owner signed in with Google, the attacker's password would
unlock their account.

The cost is a real UX wrinkle: a user who signed up with a password and later
clicks "Continue with Google" gets Auth.js's `OAuthAccountNotLinked` error. The
login page translates that into "This email is already registered with a
password. Sign in with your password below" rather than showing the raw code.

**Revisit once email verification exists** — that removes the precondition that
makes linking unsafe.

### Runtime split

`auth.config.ts` is edge-safe (Google only, no adapter, no bcrypt) and is what
`proxy.ts` imports. `auth.ts` adds the MongoDB adapter and the Credentials
provider, and is Node-only. Importing `auth.ts` into the proxy breaks the build
with an opaque module-not-found error for `dns`/`net`/`tls`.

### Route protection

Two layers, per Next's auth guide:

- **`proxy.ts`** — optimistic redirects only. Runs on every request including
  prefetches, so it only decodes the session cookie and never queries MongoDB.
  Note it is `proxy.ts`, not `middleware.ts`: Next 16 renamed the convention.
  It deliberately **skips `/api`** — redirecting a fetch to an HTML login page is
  nonsense, and an earlier version that only skipped `/api/auth` broke signup
  entirely (you needed a session to create an account).
- **`lib/dal.ts`** — the real boundary. `verifySession()` is called next to the
  data. Not in a layout: partial rendering means layouts don't re-render on
  client-side navigation, so a check there silently stops running.

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

**Resolved: the raw driver, no ODM.** The Auth.js adapter wants a raw
`MongoClient`, so adding Mongoose would mean running both. Collection types are
enforced with the driver's generics (`collection<ChatDoc>(…)`) and the persistence
shapes in [lib/types.ts](../lib/types.ts).

**One pool, via `globalThis`.** The cache in [lib/mongodb.ts](../lib/mongodb.ts) is
unconditional, not dev-only. Dev needs it because hot reload re-evaluates the
module and would leak a pool per edit. Production needs it too now: the custom
server runs *outside* Next's bundle, so Node's module graph and Turbopack's each
hold their own instance of that file — two instances, two pools in one process,
unless they meet on `globalThis`.

### Correctness lives in the indexes, not the code

Every "does this already exist?" check races: two concurrent requests both read
"no" before either writes. Application logic cannot close that window; a unique
index can. So each of these is enforced by the database and the code simply
handles the duplicate-key rejection:

| Invariant | Index |
|---|---|
| One account per email | `users.email` unique |
| One code per user, unique across users | `users.connectCode` unique + sparse |
| One friendship per pair | `friendships.{userA, userB}` unique, canonically ordered |
| One 1:1 chat per pair | `chats.pairKey` unique + sparse |

Sparse matters twice: connect codes are assigned lazily and chats may later be
groups — without it, every document still lacking the field would collide on
`null` and only the first would ever insert.

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

Resolved: transport and hosting (§3, §8), `server.mts` (§3), delete semantics and
conversation creation ([requirements.md §6](./requirements.md#6-open-questions)),
ODM vs raw driver (§5).

Still open:

1. **AI context scope and streaming fan-out** (§6) — the assistant isn't built.
2. **Connect-code rotation.** Codes are permanent and cannot currently be
   revoked. A `regenerate` action is the obvious extension; deferred because
   nothing depends on it yet.
3. **Email verification** — still absent, and still the reason Google accounts
   aren't auto-linked to password accounts (§4).
4. **Multi-instance scaling** — needs a Socket.IO adapter and shared rate-limit
   storage (§3). Not a concern at one instance.
