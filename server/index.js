import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server as SocketIOServer } from "socket.io";
import { RoomDirectory } from "./room-directory.js";
import { RoomEventLog } from "./room-event-log.js";
import { GameStateStore } from "./game-state-store.js";
import { registerSocketEvents } from "./events.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_RETRIES = Number(process.env.PORT_RETRY_LIMIT ?? 5);

function createServerContext() {
  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  });

  const roomDirectory = new RoomDirectory();
  const eventLog = new RoomEventLog();
  const gameStore = new GameStateStore();

  // 静态文件服务
  const staticPath = path.join(__dirname, '..');
  app.use(express.static(staticPath));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  io.on("connection", (socket) => {
    registerSocketEvents({ io, socket, roomDirectory, eventLog, gameStore });
  });

  server.on("close", () => {
    io.close();
  });

  return { app, server, io };
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(port, () => {
      server.off("error", onError);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve(actualPort);
    });
  });
}

export async function startServer(desiredPort = DEFAULT_PORT, options = {}) {
  const { maxRetries = MAX_PORT_RETRIES } = options;
  let currentPort = desiredPort;
  let attempts = 0;
  let lastError;

  while (attempts <= maxRetries) {
    const context = createServerContext();
    try {
      const actualPort = await listen(context.server, currentPort);
      console.log(`WebSocket server listening on http://localhost:${actualPort}`);
      return { ...context, port: actualPort };
    } catch (error) {
      lastError = error;
      context.io.close();
      context.server.close();
      if (error.code === "EADDRINUSE" && currentPort !== 0 && attempts < maxRetries) {
        console.warn(`端口 ${currentPort} 已被占用，尝试使用 ${currentPort + 1}`);
        currentPort += 1;
        attempts += 1;
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error("Unable to bind server port");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    console.error("服务器启动失败:", error);
    process.exitCode = 1;
  });
}
