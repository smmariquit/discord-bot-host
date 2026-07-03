import type { Server } from "node:http";
import type { Express } from "express";
import { loadHostConfig, parseEnabledBots } from "./config.js";
import { createBotClient } from "./discord/create-client.js";
import { allBotModules, getBotModule, tokenForModule } from "./bots/registry.js";
import { log } from "./log.js";
import { createServer } from "./server.js";
import type { BotHandle, BotModule } from "./types.js";

export type BotHost = {
  enabled: BotModule[];
  handles: BotHandle[];
  app: Express;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

let httpServer: Server | null = null;

function resolveEnabledModules(): BotModule[] {
  const { ENABLED_BOTS } = loadHostConfig();
  const ids = parseEnabledBots(ENABLED_BOTS);
  if (ids.length === 0) {
    log("warn", "ENABLED_BOTS is empty — no Discord clients will start");
    return [];
  }

  const modules: BotModule[] = [];
  for (const id of ids) {
    const mod = getBotModule(id);
    if (!mod) {
      log("warn", `Unknown bot id in ENABLED_BOTS: ${id}`);
      continue;
    }
    if (!mod.isConfigured()) {
      log("warn", `[${id}] skipped — missing ${mod.envPrefix}_DISCORD_TOKEN`);
      continue;
    }
    modules.push(mod);
  }
  return modules;
}

export function createBotHost(): BotHost {
  const enabled = resolveEnabledModules();
  const handles: BotHandle[] = enabled.map((module) => ({
    module,
    client: createBotClient(module, module.createCommands()),
  }));
  const app = createServer(handles);

  return {
    enabled,
    handles,
    app,
    async start() {
      const { PORT } = loadHostConfig();
      await new Promise<void>((resolve, reject) => {
        httpServer = app.listen(PORT, () => {
          log("info", `HTTP listening on port ${PORT}`);
          resolve();
        });
        httpServer?.once("error", reject);
      });

      for (const handle of handles) {
        const token = tokenForModule(handle.module);
        await handle.client.login(token);
        log("info", `[${handle.module.id}] Discord session started`);
      }

      if (handles.length === 0) {
        log("warn", "Host running HTTP only — configure ENABLED_BOTS and tokens");
      } else {
        log("info", `Host ready with ${handles.length} bot(s): ${handles.map((h) => h.module.id).join(", ")}`);
      }
    },
    async stop() {
      for (const handle of handles) {
        await handle.client.destroy();
        log("info", `[${handle.module.id}] stopped`);
      }
      if (httpServer) {
        await new Promise<void>((resolve, reject) => {
          httpServer?.close((err) => (err ? reject(err) : resolve()));
        });
        httpServer = null;
      }
    },
  };
}

export { allBotModules };
