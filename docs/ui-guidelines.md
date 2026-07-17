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

## 2. Two scaffold issues to fix before building on it

Both are inherited from `create-next-app`, not mistakes anyone made here — but
they'll cause confusion if left.

**The Geist fonts are loaded but not applied.** [layout.tsx](../app/layout.tsx)
loads `Geist` and `Geist_Mono` and exposes them as `--font-geist-sans` /
`--font-geist-mono`, and `@theme` wires those to `--font-sans` / `--font-mono`.
But `globals.css` then sets:

```css
body { font-family: Arial, Helvetica, sans-serif; }
```

That hard-coded rule wins, so the app renders in Arial and the Geist download is
wasted. Replace it with the token (`font-sans` on `<body>`, or
`font-family: var(--font-sans)`) so the tokens are the single source of truth.

**Dark mode is currently OS-only.** The dark palette lives behind
`@media (prefers-color-scheme: dark)`, so it follows the operating system and
cannot be toggled.
[requirements.md](./requirements.md) lists "dark mode" without specifying which —
if a user-facing toggle is wanted, the media query is the wrong mechanism and
must move to a class or `data-theme` selector (in Tailwind v4, via
`@custom-variant`). **Decide this before writing themed components**, because
retrofitting a toggle means touching every one of them.

## 3. Token discipline

**Never hard-code a color in a component.** Use the semantic utilities
(`bg-background`, `text-foreground`) so both themes work automatically. A literal
`bg-white` or `text-[#171717]` is a light-mode-only component that silently breaks
in dark mode — and it won't fail a build or a test, so nothing catches it but
review.

The current palette is two tokens deep — enough for the scaffold, not enough for
a chat UI. Expect to add tokens for surface elevation (sidebar vs message pane),
borders, muted/secondary text, and accent. Add them the same way: a `:root`
value, a dark-mode override, and a `--color-*` entry in `@theme`.

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
