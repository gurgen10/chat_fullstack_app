import "dotenv/config";
import { randomUUID } from "node:crypto";
import http from "node:http";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { publicUser, threadId } from "./chatUtils";
import { migrate } from "./db/migrate";
import { insertMessageRow, listMessagesByThread } from "./db/messages";
import { pool } from "./db/pool";
import {
  createUserRow,
  findUserById,
  findUserByUsername,
  listUsersExcept,
  userExists,
} from "./db/users";
import type { MessageRow, UserRow } from "./types";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-change-me-in-production";
const PORT = Number(process.env.PORT ?? 3000);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function signToken(user: UserRow): string {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
  } catch {
    return null;
  }
}

async function authUser(
  req: express.Request,
): Promise<
  { ok: true; user: UserRow } | { ok: false; status: number; error: string }
> {
  const header = req.headers.authorization;
  const raw = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!raw) return { ok: false, status: 401, error: "Unauthorized" };
  const payload = verifyToken(raw);
  if (!payload) return { ok: false, status: 401, error: "Unauthorized" };
  const user = await findUserById(payload.sub);
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true, user };
}

async function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  try {
    const result = await authUser(req);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    (req as express.Request & { user: UserRow }).user = result.user;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: `${MAX_IMAGE_BYTES + 256 * 1024}` }));

app.post("/api/register", async (req, res) => {
  try {
    const username = req.body?.username as string | undefined;
    const displayName = (req.body?.displayName as string | undefined) ?? "";
    const password = req.body?.password as string | undefined;

    if (typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }
    if (typeof username !== "string") {
      res.status(400).json({ error: "Username required." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await createUserRow(username, displayName, passwordHash);
    if (!created.ok) {
      res.status(400).json({ error: created.error });
      return;
    }

    const token = signToken(created.user);
    res.status(201).json({ token, user: publicUser(created.user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const username = req.body?.username as string | undefined;
    const password = req.body?.password as string | undefined;

    if (typeof username !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Username and password required." });
      return;
    }

    const user = await findUserByUsername(username);
    if (!user) {
      res.status(401).json({ error: "Invalid username or password." });
      return;
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      res.status(401).json({ error: "Invalid username or password." });
      return;
    }

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/users", authMiddleware, async (req, res) => {
  try {
    const user = (req as express.Request & { user: UserRow }).user;
    const list = await listUsersExcept(user.id);
    res.json(list.map(publicUser));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/messages/:peerId", authMiddleware, async (req, res) => {
  try {
    const user = (req as express.Request & { user: UserRow }).user;
    const raw = req.params.peerId;
    const peerId = Array.isArray(raw) ? raw[0] : raw;
    if (!peerId || !(await userExists(peerId))) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    const tid = threadId(user.id, peerId);
    const messages = await listMessagesByThread(tid);
    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: true, credentials: true },
  path: "/socket.io",
});

const onlineCounts = new Map<string, number>();

function incOnline(userId: string) {
  onlineCounts.set(userId, (onlineCounts.get(userId) ?? 0) + 1);
}

function decOnline(userId: string) {
  const next = (onlineCounts.get(userId) ?? 0) - 1;
  if (next <= 0) onlineCounts.delete(userId);
  else onlineCounts.set(userId, next);
}

function onlineUserIds(): string[] {
  return [...onlineCounts.keys()];
}

function broadcastPresence() {
  io.emit("presence:sync", onlineUserIds());
}

io.use(async (socket, next) => {
  try {
    const token =
      typeof socket.handshake.auth?.token === "string"
        ? socket.handshake.auth.token
        : null;
    if (!token) {
      next(new Error("Unauthorized"));
      return;
    }
    const payload = verifyToken(token);
    if (!payload) {
      next(new Error("Unauthorized"));
      return;
    }
    const user = await findUserById(payload.sub);
    if (!user) {
      next(new Error("Unauthorized"));
      return;
    }
    socket.data.userId = user.id;
    next();
  } catch (err) {
    next(err instanceof Error ? err : new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;
  incOnline(userId);
  socket.join(`user:${userId}`);
  broadcastPresence();

  socket.on(
    "chat:send",
    async (
      payload: { peerId?: string; text?: string; imageDataUrl?: string },
      callback?: (err: string | null) => void,
    ) => {
      const peerId = payload?.peerId;
      const text =
        typeof payload?.text === "string" ? payload.text.trim() : "";
      const imageDataUrl =
        typeof payload?.imageDataUrl === "string"
          ? payload.imageDataUrl
          : undefined;

      const fail = (msg: string) => {
        if (typeof callback === "function") callback(msg);
      };

      if (!peerId || typeof peerId !== "string") {
        fail("peerId required");
        return;
      }
      if (peerId === userId) {
        fail("Cannot message yourself");
        return;
      }
      if (!(await userExists(peerId))) {
        fail("User not found");
        return;
      }
      if (!text && !imageDataUrl) {
        fail("Message empty");
        return;
      }
      if (imageDataUrl) {
        const approxBytes = Math.ceil((imageDataUrl.length * 3) / 4);
        if (approxBytes > MAX_IMAGE_BYTES) {
          fail("Image too large");
          return;
        }
      }

      const tid = threadId(userId, peerId);
      const msg: MessageRow = {
        id: randomUUID(),
        threadId: tid,
        senderId: userId,
        text,
        imageDataUrl,
        createdAt: Date.now(),
      };

      try {
        const saved = await insertMessageRow(msg);
        io.to(`user:${userId}`).to(`user:${peerId}`).emit("chat:message", saved);
        if (typeof callback === "function") callback(null);
      } catch (err) {
        console.error(err);
        fail("Server error");
      }
    },
  );

  socket.on("disconnect", () => {
    decOnline(userId);
    broadcastPresence();
  });
});

async function shutdown(signal: string) {
  console.info(`${signal} received, closing…`);
  await new Promise<void>((resolve, reject) => {
    httpServer.close((e) => (e ? reject(e) : resolve()));
  });
  await pool.end();
  process.exit(0);
}

async function main() {
  await migrate();
  httpServer.listen(PORT, () => {
    console.log(`Chat API + Socket.IO listening on http://localhost:${PORT}`);
    console.log("PostgreSQL: tables ensured (users, messages).");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
