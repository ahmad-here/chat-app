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
| Friends | Every user has a permanent **connect code**, shown in their profile |
| Friends | Entering someone's code connects both users instantly — the code IS the consent |
| Friends | A user can see who they're connected to |
| Chat | Start a 1:1 conversation with a friend (explicit action, not automatic) |
| Chat | Send and receive messages in real time, without polling or refresh |
| Chat | A user can hold multiple conversations concurrently |
| Chat | Remove a conversation from **your own** list, leaving the other person's intact |
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

### 3.2 Friends and conversations

**Connecting.** Every user has a permanent connect code. Sharing it and having
someone enter it makes both users friends immediately — **the code is the
consent**, so there is no request/accept step. Consequences that follow from
"permanent":

- The code cannot be revoked without changing it (not built; a `regenerate`
  action is the obvious extension).
- It is a standing **enumeration** target. Length defends against guessing one
  specific person's code; only rate limiting defends against scanning for *any*
  valid code. `/api/friends/connect` is limited to 10 attempts/minute per user.
- Entering your own code is rejected. Re-entering a friend's code is a no-op, not
  an error — the end state is what the user wanted either way.

**Conversations.** Connecting does not create a conversation; starting one is an
explicit action ("Start chat"). Exactly one 1:1 conversation exists per pair,
even if both users start one simultaneously.

- A conversation has participants and an ordered message history.
- A user sees only conversations they participate in. This is an **authorization
  requirement, not a UI filter** — the server enforces it on every read and
  write, *including the real-time channel*: a socket may only join a room after
  the server checks membership in the database.
- **No rename, and no stored title.** A 1:1 title is derived per viewer — Alice
  sees "Bob", Bob sees "Alice". A single shared, mutable title is meaningless
  here (your friend renaming your chat is strange), so the field and the feature
  are both gone. Revisit when group chats arrive.
- **Delete means "hide for me".** It removes the conversation from the acting
  user's list only; the other participant keeps it and the full history. A hard
  shared delete would let one person destroy the other's record with no recourse.
  A new message un-hides it.

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
| `connectCode` | Permanent share code. **Unique + sparse index.** Assigned **lazily on first read**, not at signup — Google users are created by the Auth.js adapter and never touch `/api/signup`, and users predating the feature have none. Lazy assignment covers every path with no migration |
| `image` | Optional avatar |
| `createdAt` | |

### friendships
Symmetric, stored **once** per pair with the ids canonically ordered
(`userA < userB`), so (A,B) and (B,A) produce the same key.

| Field | Notes |
|---|---|
| `_id` | Primary key |
| `userA` / `userB` | Canonically ordered. **Unique compound index** — this is what makes a duplicate friendship impossible, including when both users enter each other's code at the same instant |
| `createdAt` | |

### chats
| Field | Notes |
|---|---|
| `_id` | Primary key |
| `participantIds` | Array of user ids; indexed — every access check reads this |
| `pairKey` | Canonical `"<idA>_<idB>"` for 1:1 chats. **Unique + sparse index** — guarantees one conversation per pair under concurrent "Start chat". Absent for future group chats, which sparse exempts |
| `hiddenFor` | Users who removed this chat from their list. Delete is per-user; a new message clears it |
| `createdAt` / `updatedAt` | `updatedAt` drives conversation-list ordering |

No `title`: 1:1 titles are derived per viewer (§3.2).

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

### Answered 2026-07-17

1. ~~**Conversation delete semantics.**~~ **Hide for the acting user only.** The
   other participant keeps the conversation and history (`chats.hiddenFor`).
2. ~~**How do conversations get created?**~~ **Permanent connect code → instant
   friendship → explicit "Start chat".** No user-discovery surface is needed:
   you cannot find someone without their code.
3. ~~**Group or 1:1?**~~ **1:1 for now.** `participantIds` stays an array and the
   `pairKey` index is sparse, so groups remain possible without a migration.

### Still open

4. **AI invocation trigger.** A slash command, an @mention, a button, or always-on?
5. **AI context scope.** Does the assistant see the whole conversation including
   other users' messages? This is a privacy decision as much as a technical one.
6. **Does AI streaming fan out?** Streaming partial tokens to the invoking user is
   straightforward. Broadcasting them live to every other participant multiplies
   real-time message volume — the simpler alternative is to fan out only the
   completed message.
