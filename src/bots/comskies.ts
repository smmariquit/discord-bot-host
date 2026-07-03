import { readPrefixedEnv, requirePrefixedEnv } from "../config.js";
import { buildInfoCommand, buildPingCommand } from "../discord/create-client.js";
import type { BotModule } from "../types.js";

const PREFIX = "COMSKIES";
const DEFAULT_URL = "https://room-tba.uplbtools.me";

export const comskiesModule: BotModule = {
  id: "comskies",
  label: "Comskies Bot (ICS Discord)",
  envPrefix: PREFIX,
  isConfigured() {
    return Boolean(readPrefixedEnv(PREFIX, "DISCORD_TOKEN"));
  },
  createCommands() {
    const website = readPrefixedEnv(PREFIX, "PUBLIC_WEBSITE_URL") ?? DEFAULT_URL;
    return [
      buildPingCommand(),
      buildInfoCommand(
        "ics",
        "ICS Discord resources and campus tools",
        "**ICS Discord** — UPLB Institute of Computer Science community.\nCampus map: {url}",
        () => website,
      ),
    ];
  },
};

export function comskiesToken(): string {
  return requirePrefixedEnv(PREFIX, "DISCORD_TOKEN");
}

export function comskiesClientId(): string | undefined {
  return readPrefixedEnv(PREFIX, "DISCORD_CLIENT_ID");
}

export function comskiesGuildId(): string | undefined {
  return readPrefixedEnv(PREFIX, "DISCORD_GUILD_ID");
}
