---
name: dev-server
description: Launch, drive, and verify the Chatapp dev server (custom Node server + Socket.IO). Use when asked to run, start, preview, or screenshot the app, or to confirm a change actually works in the real app rather than only passing lint/typecheck.
---

# Running the Chatapp dev server

All commands run from the `chat/` directory — that is the npm project root and the git
repository root, NOT the `Chatapp/` parent.

## This app does NOT use `next dev`

It runs a **custom Node server** (`server.mts`) that hosts Next.js *and* the Socket.IO
server on one HTTP server. Real-time chat needs a persistent connection, which a Next
route handler cannot hold. See [architecture.md §3](../../../docs/architecture.md).

```bash
npm run dev      # -> node server.mts
npm run start    # -> cross-env NODE_ENV=production node server.mts (needs `npm run build` first)
```

`next dev` / `next start` are **not** the entrypoints. Running `next dev` directly starts
Next without Socket.IO, so the app loads but no message ever arrives — a failure that
looks like a bug in the chat code.

Serves on http://localhost:3000 (override with `PORT`). Start it with
`run_in_background: true`, then poll the URL until it answers rather than sleeping.

## `server.mts`, not `server.ts` or `server.js`

Node 24 strips TypeScript types natively, so there is no build step. The `.mts` extension
is load-bearing: `package.json` has no `"type": "module"`, so a `.ts` file would load as
CommonJS and its `import` statements would fail. `.mts` is always ESM.

Consequences when editing it or anything it imports:
- Relative imports need explicit `.ts` extensions (Node ESM), enabled by
  `allowImportingTsExtensions` in tsconfig.
- **Never `import "server-only"`** in a module `server.mts` imports. That package only
  exists inside Next's compiled bundle and is unresolvable in plain Node.
- No `enum` / `namespace` anywhere in its import graph.

## Prerequisites

Needs `.env.local` (see `.env.example`): `MONGODB_URI`, `AUTH_SECRET`, and — for the
Google button — `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

**Without MongoDB running, the app boots but every page fails on first query.** The index
creation in `instrumentation.ts` logs an error and continues rather than crashing.

## Verify a change

Lint and typecheck do not prove anything works — the hooks in `.claude/settings.json`
already cover those on every edit and turn end. To actually verify:

```bash
npm run verify:auth   # 15 checks: signup, bcrypt, duplicate rejection, sessions, redirects
npm run verify:chat   # 28 checks: connect codes, friendships, rooms, real socket delivery
```

Both spin up an in-memory MongoDB and drive the real HTTP/WebSocket surfaces — no mocks.
`verify:chat` boots `server.mts` itself, so it exercises the actual Socket.IO wiring. They
each need a free port (3222 / 3333) and **no other dev server running** — Next refuses to
start a second one.

For UI work, load the affected route and look at it. These scripts prove the backend, not
that the interface reads well.

## Other commands

| Task | Command |
|---|---|
| Production build | `npm run build` |
| Lint whole project | `npm run lint` |
| Typecheck | `npx tsc --noEmit` |

## Notes

- Most Next.js lint rules here report as **warnings**, so `eslint` exits 0 even with
  findings. Read the output; don't trust the exit code.
- Only one dev server can run at a time. If a port is stuck after a kill, find the owner
  with `Get-NetTCPConnection -LocalPort 3000` and `Stop-Process -Force`.
- Stop a backgrounded server when finished rather than leaving it holding the port.
