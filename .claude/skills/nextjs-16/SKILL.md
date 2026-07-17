---
name: nextjs-16
description: Look up the Next.js 16 APIs bundled with this repo before writing App Router code — routing, layouts, server/client components, data fetching, mutations, route handlers, caching, metadata. Use BEFORE writing or editing anything under app/, and whenever a Next.js API's current signature is in question.
---

# Next.js 16 in this repo

This project pins `next@16.2.10`. Per `AGENTS.md`, this version has breaking changes
against what is in training data — **APIs, conventions, and file structure may all
differ from what you remember.** Do not write App Router code from memory.

The authoritative docs for the exact installed version ship inside the repo:

```
node_modules/next/dist/docs/
```

Read the relevant page there before writing code. It beats both memory and the public
docs website, which may describe a different version.

## Where to look

| Topic | Path under `node_modules/next/dist/docs/` |
|---|---|
| Layouts and pages | `01-app/01-getting-started/03-layouts-and-pages.md` |
| Linking and navigation | `01-app/01-getting-started/04-linking-and-navigating.md` |
| Server vs client components | `01-app/01-getting-started/05-server-and-client-components.md` |
| Fetching data | `01-app/01-getting-started/06-fetching-data.md` |
| Mutating data (forms, actions) | `01-app/01-getting-started/07-mutating-data.md` |
| Caching | `01-app/01-getting-started/08-caching.md` |
| Revalidating | `01-app/01-getting-started/09-revalidating.md` |
| Error handling | `01-app/01-getting-started/10-error-handling.md` |
| Route handlers (API routes) | `01-app/01-getting-started/15-route-handlers.md` |
| Images | `01-app/01-getting-started/12-images.md` |
| Metadata and OG images | `01-app/01-getting-started/14-metadata-and-og-images.md` |
| Full API reference | `01-app/03-api-reference/` |
| Guides | `01-app/02-guides/` |

Grep `01-app/03-api-reference/` when you need an exact signature and don't know which
page owns it.

## Applies to this project's feature areas

Reach for the docs above when building any of:

- **Auth (login/signup)** — route handlers, mutating data, proxy/middleware
- **Chat + real-time messages** — server/client components, streaming, route handlers
- **Conversations (create/rename/delete)** — mutating data, revalidating
- **Dark mode** — CSS, layouts
- **Markdown + code highlighting** — server vs client component boundaries

## Heed deprecation notices

If a docs page marks something deprecated, do not use it, even if it is what you'd
reach for by habit.
