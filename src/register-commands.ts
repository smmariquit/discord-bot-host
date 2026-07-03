import "dotenv/config";
import { REST, Routes } from "discord.js";
import { readPrefixedEnv } from "./config.js";
import { allBotModules } from "./bots/registry.js";
import { log } from "./log.js";

async function registerOne(botId: string) {
  const mod = allBotModules.find((m) => m.id === botId);
  if (!mod) {
    log("error", `Unknown bot: ${botId}`);
    return;
  }
  if (!mod.isConfigured()) {
    log("warn", `[${botId}] skip — missing ${mod.envPrefix}_DISCORD_TOKEN`);
    return;
  }

  const token = readPrefixedEnv(mod.envPrefix, "DISCORD_TOKEN");
  const clientId = readPrefixedEnv(mod.envPrefix, "DISCORD_CLIENT_ID");
  const guildId = readPrefixedEnv(mod.envPrefix, "DISCORD_GUILD_ID");
  if (!token || !clientId) {
    log("error", `[${botId}] needs ${mod.envPrefix}_DISCORD_TOKEN and _DISCORD_CLIENT_ID`);
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);
  const body = mod.createCommands().map((c) => c.data.toJSON());

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    log("info", `[${botId}] registered ${body.length} guild commands`);
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body });
    log("info", `[${botId}] registered ${body.length} global commands`);
  }
}

async function main() {
  const target = process.argv[2]?.trim().toLowerCase();
  if (target && target !== "all") {
    await registerOne(target);
    return;
  }
  for (const mod of allBotModules) {
    await registerOne(mod.id);
  }
}

main().catch((err) => {
  log("error", String(err));
  process.exit(1);
});
