import express from "express";
import type { BotHandle } from "./types.js";

export function createServer(handles: BotHandle[]) {
  const app = express();

  app.get("/health", (_req, res) => {
    const bots = handles.map((h) => ({
      id: h.module.id,
      label: h.module.label,
      ready: h.client.isReady(),
      user: h.client.user?.tag ?? null,
      ping: h.client.isReady() ? h.client.ws.ping : null,
    }));
    const allReady = handles.length === 0 || bots.every((b) => b.ready);
    res.status(allReady ? 200 : 503).json({
      ok: allReady,
      bots,
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  app.get("/", (_req, res) => {
    res.type("text/plain").send("discord-bot-host — see /health");
  });

  return app;
}
