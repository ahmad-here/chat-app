"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_PATH } from "@/lib/socket-events";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/lib/socket-events";
import type { Message } from "@/lib/types";

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface UseChatSocketOptions {
  /** The conversation to subscribe to. Null when none is open. */
  chatId: string | null;
  /** Server-rendered history for `chatId`, used as the starting point. */
  initialMessages: Message[];
}

interface UseChatSocketResult {
  messages: Message[];
  send: (content: string) => void;
  isConnected: boolean;
}

export function useChatSocket({
  chatId,
  initialMessages,
}: UseChatSocketOptions): UseChatSocketResult {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<ChatSocket | null>(null);

  // One socket for the page's lifetime, not one per conversation. Reconnecting
  // on every conversation switch would re-run the auth handshake needlessly;
  // rooms are what scope delivery.
  useEffect(() => {
    // No auth token is passed: the browser sends the Auth.js session cookie with
    // the handshake automatically, and server.mts reads it there. Putting a
    // token in client JS would expose it to any script on the page.
    const socket: ChatSocket = io({ path: SOCKET_PATH });
    socketRef.current = socket;

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Reset to the server's history when the conversation changes.
  //
  // Adjusted during render rather than in an effect. Syncing props into state
  // with useEffect + setState causes a cascading render (React renders the stale
  // list, commits, then immediately re-renders) and trips
  // react-hooks/set-state-in-effect. This is React's documented pattern for
  // "reset state when a prop changes": React discards the in-progress render and
  // restarts before anything reaches the DOM, so the wrong conversation's
  // messages are never painted.
  const [syncedChatId, setSyncedChatId] = useState(chatId);
  if (chatId !== syncedChatId) {
    setSyncedChatId(chatId);
    setMessages(initialMessages);
  }

  // Join the active room, and refetch history whenever we (re)join.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !chatId) return;

    async function refetchHistory(id: string): Promise<void> {
      // Closes the reconnection gap. Socket.IO reconnects transparently and
      // rejoining a room does NOT backfill what was missed while offline — the
      // connection just looks healthy again while the client sits on a hole in
      // its history. Only refetching fills it. See docs/architecture.md §3.
      try {
        const res = await fetch(`/api/chats/${id}/messages`);
        if (!res.ok) return;
        const data: { messages: Message[] } = await res.json();
        setMessages(data.messages);
      } catch {
        // Offline again; the next reconnect will retry.
      }
    }

    function join(): void {
      socket?.emit("chat:join", chatId as string, (ok) => {
        if (!ok) {
          // The server refused: not a participant, or the chat is gone.
          setMessages([]);
        }
      });
    }

    join();
    // `connect` fires on every reconnect, not just the first — that is exactly
    // when the room must be rejoined and the gap refilled.
    socket.on("connect", join);
    const onReconnect = (): void => void refetchHistory(chatId);
    socket.on("connect", onReconnect);

    return () => {
      socket.off("connect", join);
      socket.off("connect", onReconnect);
      socket.emit("chat:leave", chatId);
    };
  }, [chatId]);

  // Append broadcasts for the open conversation.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    function onMessage(message: Message): void {
      setMessages((prev) => {
        // Ignore messages for other rooms this socket happens to be in.
        if (chatId && message.chatId !== chatId) return prev;
        // Idempotent: a duplicate can arrive if a refetch races a broadcast.
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    }

    socket.on("message:new", onMessage);
    return () => {
      socket.off("message:new", onMessage);
    };
  }, [chatId]);

  const send = useCallback(
    (content: string) => {
      const socket = socketRef.current;
      if (!socket || !chatId) return;
      // Deliberately NOT optimistic. The server broadcasts to the whole room
      // including the author, so the message arrives via "message:new" like any
      // other. Inserting it locally as well is what produces the classic
      // duplicate-message bug; this way there is exactly one code path that puts
      // a message on screen, and it's the one that proves the server stored it.
      socket.emit("message:send", { chatId, content });
    },
    [chatId],
  );

  return { messages, send, isConnected };
}
