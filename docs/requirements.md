# Requirements

**Status:** Draft. Captures scope as of 2026-07-17.
**Related:** [architecture.md](./architecture.md) · [ui-guidelines.md](./ui-guidelines.md) · [roadmap.md](./roadmap.md)

## 1. Product summary

A modern real-time chat application. Users sign up, hold conversations with other
users, and can invoke an AI assistant within a conversation. Messages appear
without a page refresh. The app is responsive and supports a dark theme.

**Chat model: human ↔ human, AI-assisted.** Multiple users exchange messages in
real time; AI is a participant/helper layered on top. This is *not* a
single-user ChatGPT-style app, and that distinction drives most of
[architecture.md](./architecture.md) — it requires message fan-out to other
connected users, not just streaming a response back to the requester.

## 2. Scope

### In scope (v1)

| Area | Requirement |
|---|---|
| Auth | Email/password signup and login; authenticated session persists across reloads |
| Auth | **Google sign-in** ("Continue with Google") — added 2026-07-17, previously out of scope |
| Auth | Unauthenticated users are redirected away from chat routes |
| Chat | Send and receive messages in real time, without polling or refresh |
| Chat | A user can hold multiple conversations concurrently |
| Chat | Rename a conversation |
| Chat | Delete a conversation |
| Chat | Message history loads when a conversation is opened |
| AI | A user can invoke the AI assistant inside a conversation; its reply is visible to conversation participants |
| UI | Dark mode |
| UI | Responsive from small mobile to desktop |
| UI | Markdown rendering in messages |
| UI | Syntax highlighting in code blocks |
| Data | Persist users, chats, and messages |

### Explicitly out of scope for v1

Recorded so they aren't assumed. Each is a plausible v2 candidate.

- File and image attachments
- Message editing and deletion (individual messages — conversation delete is in scope)
- Read receipts, typing indicators, presence ("online now")
- Push/email notifications
- Search across messages
- Group conversations beyond the basic participant model
- OAuth providers *other than* Google — Google moved in-scope 2026-07-17
- **Email verification.** Signup does not prove the person owns the address they
  register. This has a direct consequence: a Google sign-in is deliberately not
  auto-linked to an existing password account with the same email, because
  someone could pre-register an address they don't own. See
  [architecture.md §4](./architecture.md#4-auth).
- Password reset / forgot-password
- Message reactions, threads, pinning

## 3. Functional requirements

### 3.1 Authentication

- **Signup** — email, password, display name. Reject duplicate emails. Passwords
  are hashed, never stored in plaintext.
- **Login** — email + password. Failed attempts do not reveal whether the email
  exists.
- **Session** — survives reload and browser restart until expiry or logout.
- **Route protection** — chat routes require a session. Unauthenticated access
  redirects to login.

### 3.2 Conversations

- A conversation has participants and an ordered message history.
- A user sees only conversations they participate in. This is an **authorization
  requirement, not a UI filter** — the server must enforce it on every read and
  write, including the real-time channel.
- **Rename** — any participant may rename; the new title is visible to all
  participants.
- **Delete** — semantics must be decided (see Open questions): does delete remove
  the conversation for everyone, or only for the acting user?

### 3.3 Messages

- A message belongs to one conversation and has one author (a user, or the AI
  assistant).
- Messages render in send order with a stable, unambiguous ordering.
- A message sent by one participant appears for other connected participants in
  real time.
- Message body is Markdown. Rendering must be **sanitized** — message content is
  untrusted user input, and Markdown permits raw HTML by default.

### 3.4 AI assistant

- A user can invoke the assistant within a conversation.
- The assistant's reply is persisted as a message and fanned out to participants
  like any other message.
- The reply streams token-by-token to the invoking user; whether partial tokens
  also stream to *other* participants is an open question (below).
- The assistant sees conversation context; how much, and whether other users'
  messages are included, needs a product decision before implementation.

## 4. Data model

The three collections named in the brief, with the fields the requirements above
imply. Field-level types are settled in [architecture.md](./architecture.md).

### users
| Field | Notes |
|---|---|
| `_id` | Primary key |
| `email` | Unique, indexed |
| `name` | Display name |
| `passwordHash` | Never plaintext; never returned to the client |
| `image` | Optional avatar |
| `createdAt` | |

### chats
| Field | Notes |
|---|---|
| `_id` | Primary key |
| `title` | Mutable (rename) |
| `participantIds` | Array of user ids; indexed — every access check reads this |
| `createdAt` / `updatedAt` | `updatedAt` drives conversation-list ordering |

### messages
| Field | Notes |
|---|---|
| `_id` | Primary key |
| `chatId` | Indexed; compound with `createdAt` for history reads |
| `authorId` | User id, or a marker for the AI assistant |
| `role` | Distinguishes human vs assistant messages |
| `content` | Markdown text |
| `createdAt` | Ordering key |

## 5. Non-functional requirements

- **Security** — enforce conversation membership server-side on every read,
  write, and real-time subscription. Sanitize rendered Markdown. Never expose
  `passwordHash`.
- **Buildable at all times** — per [CLAUDE.md](../CLAUDE.md). Lint and typecheck
  hooks run automatically; see [.claude/settings.json](../.claude/settings.json).
- **Type safety** — no `any` (per CLAUDE.md).
- **Accessibility** — semantic HTML; see [ui-guidelines.md](./ui-guidelines.md).

## 6. Open questions

These block implementation of the features they touch. None are answerable from
the repo — they need a product decision.

1. **Conversation delete semantics.** Delete for everyone, or leave/hide for the
   acting user only? Affects the `chats` schema (a soft-delete or per-user hidden
   flag vs a hard delete).
2. **How do conversations get created?** Invite by email? Pick from a user list?
   This determines whether v1 needs any user-discovery surface at all.
3. **Group or 1:1?** `participantIds` is modeled as an array, which permits
   groups — but if v1 is strictly 1:1, several UI and authorization decisions
   simplify.
4. **AI invocation trigger.** A slash command, an @mention, a button, or always-on?
5. **AI context scope.** Does the assistant see the whole conversation including
   other users' messages? This is a privacy decision as much as a technical one.
6. **Does AI streaming fan out?** Streaming partial tokens to the invoking user is
   straightforward. Broadcasting them live to every other participant multiplies
   real-time message volume — the simpler alternative is to fan out only the
   completed message.
