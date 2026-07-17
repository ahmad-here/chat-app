# Roadmap

**Status:** Draft as of 2026-07-17. Phases are **ordered but undated** — no
timeline has been agreed, and inventing one here would be fiction.
**Related:** [requirements.md](./requirements.md) · [architecture.md](./architecture.md) · [ui-guidelines.md](./ui-guidelines.md)

Sequenced so each phase is verifiable on its own and the riskiest unknown gets
retired early. Per [CLAUDE.md](../CLAUDE.md): plan before implementing, one task
at a time, project stays buildable throughout.

## Phase 0 — Decisions (blocks everything)

Not implementation work. These are answers, and several later phases cannot start
without them.

- [x] **Real-time transport + hosting target** — decided 2026-07-17: **custom Node
      server + Socket.IO**, which also settles hosting as a long-lived Node process
      (not serverless). See
      [architecture.md §3](./architecture.md#3-the-central-problem-real-time-between-users)
      and [§8](./architecture.md#8-deployment).
- [ ] Conversation delete semantics — for-everyone or for-me
      ([requirements.md §6](./requirements.md#6-open-questions))
- [ ] How conversations get created; 1:1 or group
- [x] **Dark mode** — decided 2026-07-17: a **three-state toggle** (light / system /
      dark) defaulting to the OS. A superset of OS-only, so it satisfies the
      requirement either way, and the expensive-to-retrofit option.
      ([ui-guidelines.md §2](./ui-guidelines.md#2-scaffold-issues-fixed))
- [ ] ODM vs raw MongoDB driver
- [ ] `server.js` vs `server.ts` — the entrypoint sits outside the Next compiler,
      so TypeScript there needs its own compile step or a loader
      ([architecture.md §3](./architecture.md#3-the-central-problem-real-time-between-users))
- [ ] AI invocation trigger, context scope, and streaming fan-out

## Phase 1 — Foundation

Small, no product features, makes everything after it cheaper.

**The custom server shell lands here, not in Phase 4.** Socket.IO itself isn't
needed until then, but the *entrypoint* change is foundational: it replaces
`next dev` / `next start` and rewrites the npm scripts. Doing it now means every
later phase is developed and run the way production runs. Deferring it to Phase 4
means everything built in Phases 1–3 runs under an entrypoint we're going to throw
away — and the swap lands at the same moment as the trickiest feature. Separating
them keeps one hard thing per step.

- [ ] **`server.js` hosting Next.js, no Socket.IO yet.** Creates the Node HTTP
      server, delegates to Next's `getRequestHandler()`, passes itself via the
      `httpServer` option. Update `dev` → `node server.js` and `start` →
      `NODE_ENV=production node server.js`. Resolve the `.js` vs `.ts` question
      first — the file is outside the Next compiler.
- [ ] **Update [.claude/skills/dev-server](../.claude/skills/dev-server/SKILL.md)
      in the same change** — it documents `npm run dev` → `next dev`, which becomes
      wrong the moment `server.js` lands. A skill that lies is worse than no skill.
- [x] **Fixed the two scaffold issues** — `body` now uses the Geist font token
      instead of hard-coded Arial, and dark mode moved from an OS-only media query
      to the three-state `data-theme` mechanism
      ([ui-guidelines.md §2](./ui-guidelines.md#2-scaffold-issues-fixed)).
- [x] **Expanded the palette** — elevation (`background`/`surface`/`raised`),
      `border`, `muted`, `accent`, and the three bubble variants.
- [x] **App shell** — responsive two-pane layout with placeholder content:
      conversation list (rename/delete), message list, composer, theme toggle.
      Placeholder data lives in `lib/placeholder-data.ts`; types in `lib/types.ts`
      mirror [requirements.md §4](./requirements.md#4-data-model).
- [ ] Markdown rendering + syntax highlighting. **Not started** — needs a
      sanitizing renderer; message bubbles currently render plain text
      ([ui-guidelines.md §7](./ui-guidelines.md#7-markdown-and-code-blocks)).
- [ ] MongoDB connection with the dev-mode `globalThis` cache
      ([architecture.md §5](./architecture.md#5-data-layer)).
- [ ] Create the indexes — including the **unique** index on `users.email`, which
      is what actually enforces duplicate rejection.

**Done when:** the app builds and serves under `node server.js` in both dev and
production mode, with hot reload still working in dev.

## Phase 2 — Auth

First real feature. Independent of the real-time work — but the session design
matters to it: Phase 4 has to authenticate the Socket.IO handshake against
whatever this phase builds
([architecture.md §4](./architecture.md#4-auth)).

- [x] Auth.js v5 + MongoDB adapter, Credentials provider, **JWT sessions** — the
      constraint in [architecture.md §4](./architecture.md#4-auth) holds:
      Credentials does not support database sessions.
- [x] Signup: email, password, display name. bcrypt at 12 rounds. Duplicates are
      rejected by the **unique index**, not an application-level check, because
      two concurrent signups can both read "email free" before either writes.
- [x] Login, logout, session persistence across reload.
- [x] Route protection — `proxy.ts` (optimistic) + `lib/dal.ts` (real check).
- [x] **Google sign-in.** Account linking deliberately off — see
      [architecture.md §4](./architecture.md#4-auth).
- [ ] **Blocked on config:** Google needs `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
      in `.env.local`. Unverified until those exist — the button renders and the
      provider registers, but no real Google round-trip has been performed.
- [ ] Password reset, email verification — deferred
      ([requirements.md §2](./requirements.md#2-scope)). Email verification is a
      precondition for safely auto-linking Google to password accounts.

**Done when:** a user can sign up, log out, log back in, and reach a protected
page — verified in the browser, not just by passing types.

**Status:** the credentials half is verified end-to-end against a real MongoDB by
`scripts/verify-auth.mjs` (15 checks: hashing, duplicate rejection, session
issuance, redirect behaviour). Run it with `npm run verify:auth`. The Google half
is **not** verified — it needs OAuth credentials.

## Phase 3 — Conversations and messages (no real-time yet)

Deliberately built without the live connection. Request/response is easier to
debug, and it proves the data model and authorization before a transport is
layered on. If something's wrong with the schema, you find out here.

- [ ] Create a conversation; list the current user's conversations.
- [ ] Open a conversation and load history.
- [ ] Send a message (persisted; visible on refresh).
- [ ] Rename and delete, per the Phase 0 delete decision.
- [ ] **Server-side authorization on every read and write** — a user must not
      reach a conversation they don't participate in. Test this explicitly with a
      second account rather than assuming it.
- [ ] Markdown rendering, **sanitized**
      ([ui-guidelines.md §7](./ui-guidelines.md#7-markdown-and-code-blocks)), plus
      syntax highlighting.

**Done when:** two accounts can each hold conversations, neither can see the
other's, and a refresh shows the full history.

## Phase 4 — Real-time (Socket.IO)

Everything before this works without a live connection; nothing from here on does.
Builds on the Phase 1 server shell — this phase attaches Socket.IO to a `server.js`
that already exists and already serves the app.

- [ ] Attach the Socket.IO server to the existing HTTP server in `server.js`.
- [ ] **Authenticate the socket on connect** against the Auth.js session. An
      unauthenticated socket gets nothing. Note the JWT-session shape from
      [architecture.md §4](./architecture.md#4-auth) — the socket handshake has to
      read the session cookie, which is not the same code path as a route handler.
- [ ] **Authorize room joins server-side.** One room per conversation. Check
      membership against `chats.participantIds` before joining — never trust a room
      name the client asks for
      ([architecture.md §3](./architecture.md#3-the-central-problem-real-time-between-users)).
- [ ] Emit to the conversation room on write; subscribe on the client.
- [ ] Handle reconnection and the gap it leaves: a dropped connection means missed
      messages, so reconnect has to re-fetch history rather than just rejoin the
      room. Socket.IO reconnects automatically — which makes this easy to miss,
      because the connection looks healthy while the client silently sits on a
      hole in its history.
- [ ] Avoid the double-render — the sender shouldn't see their own message twice
      when the echo arrives.

**Done when:** two browsers, two accounts, one conversation — a message sent in one
appears in the other with no refresh; and after killing the network on one client
and restoring it, that client shows the messages it missed while offline.

**Deferred, deliberately:** multi-instance scaling needs a Socket.IO adapter to
broker events between processes
([architecture.md §3](./architecture.md#3-the-central-problem-real-time-between-users)).
At one instance it's unnecessary. It's the first thing that breaks under horizontal
scaling, so it's recorded rather than forgotten.

## Phase 5 — AI assistant

Last because it depends on the message pipeline and the fan-out path already
working.

- [ ] `@anthropic-ai/sdk`, server-side only. **The API key must never reach the
      browser** ([architecture.md §6](./architecture.md#6-ai-integration)).
- [ ] Route handler calling `claude-opus-4-8` with streaming and adaptive thinking
      (set `thinking: { type: "adaptive" }` explicitly — omitting it on Opus 4.8
      runs without thinking).
- [ ] Invocation trigger, per the Phase 0 decision.
- [ ] Persist the reply as a message and fan it out.
- [ ] Stream to the invoker; fan out to others per the Phase 0 decision.

**Done when:** a user invokes the assistant, sees the reply stream in, and the
other participant sees the completed message.

## Deferred to v2

From [requirements.md §2](./requirements.md#2-scope) — recorded so they don't get
pulled into v1 by accident: attachments, message edit/delete, read receipts,
typing indicators, presence, notifications, message search, OAuth login,
reactions, threads.

## How work gets verified

Per [CLAUDE.md](../CLAUDE.md), the project stays buildable throughout. Automated
checks already run:

- ESLint on every file edit, and `tsc --noEmit` at the end of each turn — see
  [.claude/settings.json](../.claude/settings.json).
- **Neither proves a feature works.** Every "done when" above is a behavior
  observed in a running app. Lint and typecheck are a floor, not the bar — the
  [dev-server skill](../.claude/skills/dev-server/SKILL.md) covers driving the
  app.
