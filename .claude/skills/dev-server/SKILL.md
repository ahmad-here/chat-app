---
name: dev-server
description: Launch, drive, and verify the Chatapp Next.js dev server. Use when asked to run, start, preview, or screenshot the app, or to confirm a change actually works in the browser rather than only passing lint/typecheck.
---

# Running the Chatapp dev server

All commands run from the `chat/` directory — that is the npm project root and the git
repository root. The repo root is NOT the `Chatapp/` parent directory.

## Start

```bash
npm run dev
```

Serves on http://localhost:3000 by default. Next picks the next free port if 3000 is
taken — read the actual URL from the startup output rather than assuming 3000.

Start it with `run_in_background: true` so it keeps running across turns, then poll the
URL until it answers instead of sleeping a fixed amount.

## Verify a change

Lint and typecheck do not prove a UI change works — the hooks in
`.claude/settings.json` already cover those on every edit and turn end. To actually
verify, load the affected route and observe the rendered result.

## Other commands

| Task | Command |
|---|---|
| Production build | `npm run build` |
| Serve production build | `npm run start` |
| Lint whole project | `npm run lint` |
| Typecheck | `npx tsc --noEmit` |

`npm run lint` maps to bare `eslint` (flat config in `eslint.config.mjs`).

## Notes

- Most Next.js rules in this config report as **warnings**, so `eslint` exits 0 even
  when it has findings. Read its output; do not trust the exit code alone.
- Stop a backgrounded dev server when finished rather than leaving it holding the port.
