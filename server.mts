import { createServer } from "node:http";
import next from "next";
import { Server as SocketServer } from "socket.io";
import { getToken } from "next-auth/jwt";
import { createMessage, isParticipant } from "./lib/chat-data.ts";
import { roomFor, SOCKET_PATH } from "./lib/socket-events.ts";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./lib/socket-events.ts";

/** Custom Node server: Next.js + Socket.IO on one HTTP server.
 *
 * WHY THIS FILE EXISTS
 * Human-to-human real time needs a persistent connection. Next route handlers
 * can't hold one on a serverless host — functions are short-lived and don't
 * share memory, so a Socket.IO server created in a route handler wouldn't
 * survive between invocations or see connections held by another instance. That
 * is a hosting constraint, not a Next one: on a long-lived Node process the same
 * code works. See docs/architecture.md §3.
 *
 * WHY .mts
 * Node 24 strips TypeScript types natively, so this runs with no build step.
 * The extension is deliberate: package.json has no `"type": "module"`, so a
 * `.ts` file would load as CommonJS and these `import` statements would fail.
 * `.mts` is unconditionally ESM. Node ESM also requires explicit file
 * extensions, hence the `.ts` on the relative imports above (permitted by
 * `allowImportingTsExtensions` in tsconfig.json).
 *
 * WHAT THIS COSTS
 * `output: "standalone"` can no longer be used — it emits its own server.js and
 * does not trace custom server files. Deployment must be a long-lived Node
 * process, not serverless. See docs/architecture.md §8.
 */

const dev = process.env.NODE_ENV !== "production";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "localhost";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error("[server] request failed", error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  });
});

/** Socket.IO is attached AFTER `app.prepare()` and after the HTTP server exists.
 *
 * Order matters and the failure is silent. engine.io's `attach()` captures the
 * server's existing "upgrade" listeners, removes them, and installs its own that
 * delegates non-matching paths back to them. Attach before Next has registered
 * its dev HMR upgrade listener and there is nothing to capture — HMR then breaks
 * with no error, just a dev server that stops hot-reloading. */
const io = new SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>(httpServer, { path: SOCKET_PATH });

/** Authenticate the handshake against the Auth.js session cookie.
 *
 * The session JWT is ENCRYPTED (JWE, A256CBC-HS512), so `jsonwebtoken` and
 * friends cannot read it — only Auth.js's own `getToken` can. It needs a `req`,
 * but only reads `.headers`, so the handshake headers suffice.
 *
 * `secureCookie` is derived from AUTH_URL's protocol, NOT NODE_ENV. Auth.js
 * picks the cookie name from `url.protocol === "https:"` (`@auth/core/lib/
 * init.ts`), and the decryption salt is derived from that same cookie name. Get
 * it wrong and BOTH the name and the salt are wrong, so getToken returns null
 * and every socket silently fails to authenticate. Keying it off NODE_ENV — the
 * obvious guess — breaks the moment production runs behind http or dev over
 * https. */
const secureCookie = (process.env.AUTH_URL ?? "").startsWith("https://");

io.use(async (socket, nextFn) => {
  try {
    // Node's IncomingHttpHeaders allows string[] values, which getToken's
    // `Headers | Record<string, string>` does not accept. getToken only reads
    // the cookie, so hand it exactly that in a real Headers object.
    const headers = new Headers();
    const cookie = socket.handshake.headers.cookie;
    if (cookie) headers.set("cookie", cookie);

    const token = await getToken({
      req: { headers },
      secret: process.env.AUTH_SECRET,
      secureCookie,
    });

    if (!token?.sub) {
      nextFn(new Error("unauthorized"));
      return;
    }

    // The ONLY source of identity for this socket. Everything downstream reads
    // socket.data.userId and never a client-supplied id.
    socket.data.userId = token.sub;
    nextFn();
  } catch (error) {
    console.error("[socket] auth failed", error);
    nextFn(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  const { userId } = socket.data;

  socket.on("chat:join", async (chatId, ack) => {
    // Authorize every join. Without this check a client could join any room by
    // guessing a chat id and receive a stranger's messages in real time. The
    // room name is derived from the id — never trusted from the client.
    const allowed = await isParticipant(userId, chatId);
    if (allowed) await socket.join(roomFor(chatId));
    ack?.(allowed);
  });

  socket.on("chat:leave", async (chatId) => {
    await socket.leave(roomFor(chatId));
  });

  socket.on("message:send", async ({ chatId, content }, ack) => {
    try {
      // createMessage re-checks membership and validates content. The socket
      // being in the room is not proof of anything — membership could have
      // changed since the join.
      const message = await createMessage(userId, chatId, content);
      if (!message) {
        ack?.({ ok: false, error: "Could not send that message." });
        return;
      }

      // Broadcast to everyone in the room INCLUDING the author (io.to, not
      // socket.broadcast.to). The author's own client renders from this echo
      // rather than inserting optimistically, which is what keeps the sender
      // from seeing their message twice.
      io.to(roomFor(chatId)).emit("message:new", message);
      ack?.({ ok: true });
    } catch (error) {
      console.error("[socket] message:send failed", error);
      ack?.({ ok: false, error: "Could not send that message." });
    }
  });
});

httpServer.listen(port, () => {
  console.log(`> Ready on http://${hostname}:${port} (socket.io at ${SOCKET_PATH})`);
});
