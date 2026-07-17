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

- [x] **[server.mts](../server.mts) hosting Next.js.** Landed with Socket.IO
      rather than before it — the user asked for the backend in one go. `dev` →
      `node server.mts`, `start` → `cross-env NODE_ENV=production node server.mts`
      (cross-env because `NODE_ENV=x cmd` is bash syntax that fails on Windows).
      The `.js` vs `.ts` question resolved to **`.mts`**: Node 24 strips types
      natively so there's no build step, and `.mts` is unconditionally ESM where a
      `.ts` would have loaded as CommonJS and failed on its own imports.
- [x] **Updated [.claude/skills/dev-server](../.claude/skills/dev-server/SKILL.md)**
      in the same change — it documented `npm run dev` → `next dev`, which became
      wrong the moment `server.mts` landed.
- [x] **Fixed the two scaffold issues** — `body` now uses the Geist font token
      instead of hard-coded Arial, and dark mode moved from an OS-only media query
      to the three-state `data-theme` mechanism
      ([ui-guidelines.md §2](./ui-guidelines.md#2-scaffold-issues-fixed)).
- [x] **Expanded the palette** — elevation (`background`/`surface`/`raised`),
      `border`, `muted`, `accent`, and the three bubble variants.
- [x] **App shell** — responsive two-pane layout: conversation list, message list,
      composer, theme toggle, friends panel. Now driven by **real data**;
      `lib/placeholder-data.ts` has been deleted.
- [ ] Markdown rendering + syntax highlighting. **Not started** — needs a
      sanitizing renderer; message bubbles currently render plain text
      ([ui-guidelines.md §7](./ui-guidelines.md#7-markdown-and-code-blocks)).
- [x] MongoDB connection with an **unconditional** `globalThis` cache — not
      dev-only: the custom server runs outside Next's bundle, so without it the
      process holds two pools ([architecture.md §5](./architecture.md#5-data-layer)).
- [x] Indexes created at boot from [instrumentation.ts](../instrumentation.ts) —
      including the four **unique** indexes that are the only real defence against
      duplicate accounts, codes, friendships, and conversations.

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

## Phase 3 — Friends, conversations and messages

Built together with Phase 4 rather than before it, at the user's direction. The
original plan sequenced them apart so the data model could be proven under plain
request/response first; in the event the schema held, and `npm run verify:chat`
covers both layers.

- [x] **Friends by connect code** — permanent per-user code, instant connect.
      New concept, absent from the original data model
      ([requirements.md §3.2](./requirements.md)).
- [x] Start a 1:1 conversation with a friend; list the user's conversations.
- [x] Open a conversation and load history **server-side** (from `?chat=<id>`, so
      it's linkable and survives reload rather than flashing empty).
- [x] Send a message (persisted; visible on refresh).
- [x] Delete = hide-for-me; a new message un-hides it.
- [x] ~~Rename~~ — **removed.** 1:1 titles are derived per viewer; there is no
      stored title to rename.
- [x] **Server-side authorization on every read and write**, verified with a
      third account: a non-friend can't start a chat, a non-participant gets 404
      on history (not an empty thread), and is refused the socket room.
- [ ] Markdown rendering, **sanitized**
      ([ui-guidelines.md §7](./ui-guidelines.md#7-markdown-and-code-blocks)), plus
      syntax highlighting. **Still open** — bubbles render plain text; shipping an
      unsanitized renderer would be stored XSS for every participant.

**Done when:** two accounts can each hold conversations, neither can see the
other's, and a refresh shows the full history. **Met** — `npm run verify:chat`.

## Phase 4 — Real-time (Socket.IO)

Everything before this works without a live connection; nothing from here on does.
Builds on the Phase 1 server shell — this phase attaches Socket.IO to a `server.js`
that already exists and already serves the app.

- [x] Attach the Socket.IO server to the HTTP server in `server.mts` — **after**
      `app.prepare()`, or engine.io swallows Next's HMR upgrade listener and hot
      reload silently dies ([architecture.md §3](./architecture.md#3-the-central-problem-real-time-between-users)).
- [x] **Authenticate the socket on connect** against the Auth.js session. The JWT
      is *encrypted*, so only Auth.js's `getToken` can read it; `secureCookie`
      must come from AUTH_URL's protocol, not `NODE_ENV`, or every socket fails
      to authenticate silently.
- [x] **Authorize room joins server-side** against `chats.participantIds` — the
      client's chatId is a request, never a grant.
- [x] Emit to the conversation room on write; subscribe on the client.
- [x] Handle reconnection and the gap it leaves — the client refetches history on
      every `connect`, not just the first.
- [x] Avoid the double-render — solved by construction: the author renders from
      the server echo rather than inserting optimistically, so there is only one
      code path that puts a message on screen.

**Done when:** two browsers, two accounts, one conversation — a message sent in one
appears in the other with no refresh; and after killing the network on one client
and restoring it, that client shows the messages it missed while offline.

**Status:** the delivery half is **verified** by `npm run verify:chat` (28 checks,
two real sockets — Alice sends, Bob receives, a third user gets nothing). The
**offline-gap half is not**: the refetch-on-reconnect path is written and
reasoned about but no test kills the network and restores it. Worth adding.

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

Automated, via [.claude/settings.json](../.claude/settings.json):

| When | Hook | What it does |
|---|---|---|
| Before `Write` | [check-duplicate-component.mjs](../.claude/hooks/check-duplicate-component.mjs) | **Blocks** a write that would export a component name another file already exports, enforcing CLAUDE.md's "no duplicated code" at the moment it's cheap to fix |
| After `Write`/`Edit` | [lint-file.mjs](../.claude/hooks/lint-file.mjs) | ESLint `--fix` on the touched file |
| Turn end | [typecheck.mjs](../.claude/hooks/typecheck.mjs) | `tsc --noEmit` across the project |

The duplicate check deliberately ignores `export default` and Next.js convention
filenames (`page`/`layout`/`route`/…) — those repeat by design, one per route, so
matching them would flag `/login/page.tsx` against `/signup/page.tsx` forever. It
matches only named PascalCase value exports, where a collision is a real
duplicate. Types are exempt: a shared name there is often deliberate.

On demand:

```bash
npm run verify:auth   # 15 checks — signup, bcrypt, duplicates, sessions, redirects
npm run verify:chat   # 28 checks — codes, friendships, rooms, real socket delivery
```

**None of this proves a feature works.** Every "done when" above is a behaviour
observed in a running app. Lint and typecheck are a floor, not the bar — the
[dev-server skill](../.claude/skills/dev-server/SKILL.md) covers driving the app.
