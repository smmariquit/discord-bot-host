import { buildAttendanceCommand } from "../attendance/attendance.js";
import { readPrefixedEnv, requirePrefixedEnv } from "../config.js";
import { buildInfoCommand, buildPingCommand } from "../discord/create-client.js";
import type { BotModule } from "../types.js";

const PREFIX = "COMSKIES";
const DEFAULT_URL = "https://room-tba.uplbtools.me";
/** Dyno #logs in the ICS server */
const DEFAULT_LOGS_CHANNEL_ID = "1450882679326249103";

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
      buildAttendanceCommand(
        () => readPrefixedEnv(PREFIX, "LOGS_CHANNEL_ID") ?? DEFAULT_LOGS_CHANNEL_ID,
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
