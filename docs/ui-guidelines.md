# UI Guidelines

**Status:** Draft as of 2026-07-17.
**Related:** [requirements.md](./requirements.md) · [architecture.md](./architecture.md) · [roadmap.md](./roadmap.md)

## 1. What already exists

Unlike most of these docs, this one describes real code. The scaffold in
[app/globals.css](../app/globals.css) and [app/layout.tsx](../app/layout.tsx)
already establishes a token system worth building on rather than replacing.

**Tailwind CSS v4**, configured CSS-first. There is no `tailwind.config.js` and
you should not add one — v4 declares theme tokens in CSS via `@theme`:

```css
@import "tailwindcss";

:root { --background: #ffffff; --foreground: #171717; }

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}
```

The `--color-*` names in `@theme` are what generate utilities: `--color-background`
produces `bg-background`, `text-background`, and so on. Add a token here and the
utilities exist; there's no config file to touch.

## 2. Scaffold issues (fixed)

Both were inherited from `create-next-app`. Recorded because the fixes are load-
bearing and easy to undo by accident.

**The Geist fonts were loaded but not applied.** [layout.tsx](../app/layout.tsx)
loads `Geist` / `Geist_Mono` and exposes them as `--font-geist-sans` /
`--font-geist-mono`, and `@theme` wires those to `--font-sans` / `--font-mono`.
But `globals.css` then hard-coded `font-family: Arial, Helvetica, sans-serif` on
`body`, which won — the app rendered in Arial and the Geist download was dead
weight. `body` now uses `var(--font-sans)`, so the tokens are the single source
of truth. **Don't reintroduce a literal font stack on `body`.**

**Dark mode is now a three-state toggle.** Decision: a user-facing toggle that
defaults to the OS — a superset of OS-only, and the option that would have been
expensive to retrofit. The mechanism:

| `<html>` state | Result |
|---|---|
| no `data-theme` | follows the OS via `prefers-color-scheme` |
| `data-theme="light"` | forced light, overrides the OS |
| `data-theme="dark"` | forced dark, overrides the OS |

The OS rule is scoped `:root:not([data-theme="light"])` so an explicit light
choice beats a dark OS setting. Note the palette is driven entirely by CSS
variables swapped per theme — there is no Tailwind `dark:` variant in use and no
`@custom-variant` needed. Components get theming for free by using the semantic
utilities (§3).

**The theme is applied by an inline script in `<head>`**
([layout.tsx](../app/layout.tsx)), which runs during HTML parsing before first
paint. This is the pattern Next 16 prescribes in
`node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`.
It matters: `useEffect` runs *after* paint, so the user would see the wrong theme
flash first. `<html>` carries `suppressHydrationWarning` because the script
mutates the DOM before React hydrates.

[ThemeToggle](../app/components/theme-toggle.tsx) reads `localStorage` via
`useSyncExternalStore` rather than `useState` + `useEffect` — the latter trips
the `react-hooks/set-state-in-effect` lint rule and causes cascading renders.
`getServerSnapshot` returns `"system"` so the server render matches the HTML the
inline script then corrects.

## 3. Token discipline

**Never hard-code a color in a component.** Use the semantic utilities
(`bg-background`, `text-foreground`) so both themes work automatically. A literal
`bg-white` or `text-[#171717]` is a light-mode-only component that silently breaks
in dark mode — and it won't fail a build or a test, so nothing catches it but
review.

The palette now covers elevation (`background` < `surface` < `raised`), `border`,
`muted`, `accent`, and the three message-bubble variants (own / other / AI). Add
new tokens the same way: a `:root` value, matching overrides in **both** the
`prefers-color-scheme` block and the `[data-theme="dark"]` block, and a
`--color-*` entry in `@theme`. Missing one of the two dark blocks is the easy
mistake — the token then works in OS dark mode but not when dark is chosen
explicitly (or vice versa).

## 4. Layout

The chat UI is the classic two-pane shape: conversation list beside the active
conversation. Responsive behavior is the interesting part.

- **Desktop** — sidebar and conversation side by side.
- **Mobile** — one at a time. The sidebar becomes a drawer or a separate route.

Tailwind is mobile-first: unprefixed utilities are the small-screen case, and
`md:` / `lg:` add larger breakpoints. Write the mobile layout first and layer
desktop on top, not the reverse.

[layout.tsx](../app/layout.tsx) already sets up full-height flex
(`h-full` on `<html>`, `min-h-full flex flex-col` on `<body>`), which the chat
shell needs — a message list that scrolls within a fixed viewport requires an
unbroken height chain from the root.

## 5. Components

Per [CLAUDE.md](../CLAUDE.md): small, modular, reusable, no duplication.

Keep Client Components as low in the tree as possible
([architecture.md §7](./architecture.md#7-component-boundaries)). A message list
that subscribes to real-time updates must be a Client Component; the page around
it shouldn't have to be.

## 6. Semantic HTML and accessibility

Required by [CLAUDE.md](../CLAUDE.md), and a chat UI has specific obligations
beyond the usual:

- Real structure: `<nav>` for the conversation list, `<main>` for the
  conversation, `<form>` for the composer, `<button>` for buttons. A `<div>` with
  an `onClick` is not a button — it isn't focusable and doesn't respond to Enter
  or Space.
- **New messages need to be announced.** Messages arriving over a live connection
  are invisible to a screen reader unless the container is a live region
  (`aria-live="polite"`). This is the accessibility requirement most easily
  missed in a real-time app, because nothing about the visual result reveals it.
- Every interactive element is keyboard-reachable, with a visible focus style.
- Contrast must hold in **both** themes — verify dark separately; it's where
  muted text usually fails.

## 7. Markdown and code blocks

Message bodies are Markdown ([requirements.md §3.3](./requirements.md#33-messages)).

**Sanitize the rendered output.** Message content is untrusted input from other
users, and Markdown allows raw HTML by default — an unsanitized renderer is a
stored XSS vulnerability that fires for every participant who opens the
conversation. This is the single highest-risk item in the UI layer.

Code blocks get syntax highlighting. Highlighting libraries are heavy; see
[architecture.md §7](./architecture.md#7-component-boundaries) for the
server-vs-client tradeoff. Whatever renders them, code blocks need `font-mono`
(once the font tokens are fixed, per §2) and must scroll horizontally within
their own container rather than forcing the page to scroll sideways on mobile.
