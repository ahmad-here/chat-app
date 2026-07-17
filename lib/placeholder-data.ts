/** Placeholder data for UI development.
 *
 * Temporary: replaced by MongoDB reads in roadmap Phase 3. It exists so the UI
 * can be built and reviewed before the backend lands, and so components are
 * written against the real shape (lib/types.ts) rather than an invented one.
 *
 * Timestamps are fixed ISO strings, not `new Date()`. Generating them at render
 * time would produce different values on server and client and cause hydration
 * mismatches — see the flash-before-hydration guide in
 * node_modules/next/dist/docs/01-app/02-guides/. */

import type { Conversation, Message, User } from "./types";

/** Stands in for the authenticated user until auth lands (Phase 2). */
export const CURRENT_USER_ID = "u_ahmad";

export const users: User[] = [
  { id: "u_ahmad", name: "Ahmad Jeel" },
  { id: "u_sara", name: "Sara Malik" },
  { id: "u_devteam", name: "Bilal Khan" },
];

export const conversations: Conversation[] = [
  {
    id: "c_design",
    title: "Design review",
    participantIds: ["u_ahmad", "u_sara"],
    updatedAt: "2026-07-17T09:24:00Z",
  },
  {
    id: "c_api",
    title: "API integration",
    participantIds: ["u_ahmad", "u_devteam"],
    updatedAt: "2026-07-17T08:02:00Z",
  },
  {
    id: "c_standup",
    title: "Weekly standup",
    participantIds: ["u_ahmad", "u_sara", "u_devteam"],
    updatedAt: "2026-07-16T16:45:00Z",
  },
];

export const messages: Message[] = [
  {
    id: "m_1",
    chatId: "c_design",
    authorId: "u_sara",
    role: "user",
    content: "Morning! Did you get a chance to look at the new sidebar layout?",
    createdAt: "2026-07-17T09:02:00Z",
  },
  {
    id: "m_2",
    chatId: "c_design",
    authorId: "u_ahmad",
    role: "user",
    content:
      "Yes — it collapses well on mobile now. The drawer feels much better than the old tab bar.",
    createdAt: "2026-07-17T09:08:00Z",
  },
  {
    id: "m_3",
    chatId: "c_design",
    authorId: "u_sara",
    role: "user",
    content: "Can the assistant summarise what we changed this week?",
    createdAt: "2026-07-17T09:15:00Z",
  },
  {
    id: "m_4",
    chatId: "c_design",
    role: "assistant",
    content:
      "This week you replaced the tab bar with a slide-in drawer, introduced elevation tokens for the sidebar, and moved the theme toggle into the header.",
    createdAt: "2026-07-17T09:16:00Z",
  },
  {
    id: "m_5",
    chatId: "c_design",
    authorId: "u_ahmad",
    role: "user",
    content: "That's the one. Let's ship it.",
    createdAt: "2026-07-17T09:24:00Z",
  },
  {
    id: "m_6",
    chatId: "c_api",
    authorId: "u_devteam",
    role: "user",
    content: "The socket handshake needs the session cookie — I'll wire it up.",
    createdAt: "2026-07-17T08:02:00Z",
  },
  {
    id: "m_7",
    chatId: "c_standup",
    authorId: "u_sara",
    role: "user",
    content: "Standup notes are in the doc.",
    createdAt: "2026-07-16T16:45:00Z",
  },
];

export function getMessages(chatId: string): Message[] {
  return messages.filter((m) => m.chatId === chatId);
}

export function getUser(userId: string): User | undefined {
  return users.find((u) => u.id === userId);
}
