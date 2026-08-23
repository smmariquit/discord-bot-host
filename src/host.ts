import type { Server } from "node:http";
import type { Express } from "express";
import { loadHostConfig, parseEnabledBots } from "./config.js";
import { createBotClient } from "./discord/create-client.js";
import { allBotModules, getBotModule, tokenForModule } from "./bots/registry.js";
import { uplbToolsModule } from "./bots/uplbtools.js";
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

type UplbRuntime = {
  client: BotHandle["client"];
  app: Express;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

function resolveEnabledModules(): { modules: BotModule[]; uplbEnabled: boolean } {
  const { ENABLED_BOTS } = loadHostConfig();
  const ids = parseEnabledBots(ENABLED_BOTS);
  if (ids.length === 0) {
    log("warn", "ENABLED_BOTS is empty — no Discord clients will start");
    return { modules: [], uplbEnabled: false };
  }

  const modules: BotModule[] = [];
  const uplbEnabled = ids.includes(uplbToolsModule.id);
  for (const id of ids) {
    if (id === uplbToolsModule.id) continue;
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
  return { modules, uplbEnabled };
}

export async function createBotHost(): Promise<BotHost> {
  const { modules, uplbEnabled } = resolveEnabledModules();
  const enabled = [...modules];
  let uplbRuntime: UplbRuntime | null = null;
  if (uplbEnabled) {
    if (!uplbToolsModule.isConfigured()) {
      log("warn", "[uplbtools] skipped — missing UPLB_DISCORD_TOKEN");
    } else {
      const runtimePath = new URL("../.vendor/uplbtools/dist/runtime.js", import.meta.url).href;
      const { createUplbToolsRuntime } = await import(runtimePath);
      uplbRuntime = createUplbToolsRuntime({ envPrefix: "UPLB_", listen: false });
      enabled.push(uplbToolsModule);
    }
  }
  const handles: BotHandle[] = modules.map((module) => ({
    module,
    client: createBotClient(module, module.createCommands()),
  }));
  if (uplbRuntime) handles.push({ module: uplbToolsModule, client: uplbRuntime.client });
  const app = createServer(handles, uplbRuntime ? [uplbRuntime.app] : []);

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
        if (handle.module.id === uplbToolsModule.id) continue;
        const token = tokenForModule(handle.module);
        await handle.client.login(token);
        log("info", `[${handle.module.id}] Discord session started`);
      }
      if (uplbRuntime) {
        await uplbRuntime.start();
        log("info", "[uplbtools] Discord session started");
      }

      if (handles.length === 0) {
        log("warn", "Host running HTTP only — configure ENABLED_BOTS and tokens");
      } else {
        log("info", `Host ready with ${handles.length} bot(s): ${handles.map((h) => h.module.id).join(", ")}`);
      }
    },
    async stop() {
      for (const handle of handles) {
        if (handle.module.id === uplbToolsModule.id) continue;
        await handle.client.destroy();
        log("info", `[${handle.module.id}] stopped`);
      }
      if (uplbRuntime) await uplbRuntime.stop();
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
