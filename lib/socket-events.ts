import type { Message } from "./types.ts";

/** The Socket.IO wire protocol, shared by the server and the browser so the two
 *  cannot drift apart. Imported by server.mts (Node ESM) — hence the explicit
 *  `.ts` extension on the import above. */

export interface ClientToServerEvents {
  /** Ask to join a conversation's room. The server verifies membership against
   *  the database before honouring it — a client-supplied chatId is a request,
   *  never a grant. */
  "chat:join": (chatId: string, ack?: (ok: boolean) => void) => void;
  "chat:leave": (chatId: string) => void;
  /** Send a message. The server persists it, then broadcasts to the room. */
  "message:send": (
    payload: { chatId: string; content: string },
    ack?: (result: { ok: boolean; error?: string }) => void,
  ) => void;
}

export interface ServerToClientEvents {
  /** A message was persisted in a room this socket has joined. Sent to EVERY
   *  member including the author — see the note in use-chat-socket.ts on why the
   *  author does not render optimistically. */
  "message:new": (message: Message) => void;
}

export interface SocketData {
  userId: string;
}

/** One room per conversation. Centralised so the server and any future tooling
 *  derive the name identically. */
export function roomFor(chatId: string): string {
  return `chat:${chatId}`;
}

/** Socket.IO's default path is `/socket.io/`. Next's dev HMR uses
 *  `/_next/webpack-hmr`, so they don't collide — but keeping the path explicit
 *  documents the constraint and stops a future change from silently colliding. */
export const SOCKET_PATH = "/socket.io";
