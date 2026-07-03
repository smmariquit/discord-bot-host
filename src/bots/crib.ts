import { readPrefixedEnv, requirePrefixedEnv } from "../config.js";
import { buildInfoCommand, buildPingCommand } from "../discord/create-client.js";
import type { BotModule } from "../types.js";

const PREFIX = "CRIB";
const DEFAULT_URL = "https://crib.stimmie.dev";

export const cribModule: BotModule = {
  id: "crib",
  label: "TheCribMC Bot",
  envPrefix: PREFIX,
  isConfigured() {
    return Boolean(readPrefixedEnv(PREFIX, "DISCORD_TOKEN"));
  },
  createCommands() {
    const website = readPrefixedEnv(PREFIX, "PUBLIC_WEBSITE_URL") ?? DEFAULT_URL;
    return [
      buildPingCommand(),
      buildInfoCommand(
        "crib",
        "The Crib server address and links",
        "**The Crib** — Java & Bedrock survival. Connect: `mc.stimmie.dev`\nWebsite: {url}",
        () => website,
      ),
    ];
  },
};

export function cribToken(): string {
  return requirePrefixedEnv(PREFIX, "DISCORD_TOKEN");
}

export function cribClientId(): string | undefined {
  return readPrefixedEnv(PREFIX, "DISCORD_CLIENT_ID");
}

export function cribGuildId(): string | undefined {
  return readPrefixedEnv(PREFIX, "DISCORD_GUILD_ID");
}
