import { readPrefixedEnv, requirePrefixedEnv } from "../config.js";
import { buildInfoCommand, buildPingCommand } from "../discord/create-client.js";
import type { BotModule } from "../types.js";

const PREFIX = "PIZZA";
const DEFAULT_URL = "https://joinpizza.fun";

export const pizzaModule: BotModule = {
  id: "pizza",
  label: "Pizzabot (joinpizza.fun)",
  envPrefix: PREFIX,
  isConfigured() {
    return Boolean(readPrefixedEnv(PREFIX, "DISCORD_TOKEN"));
  },
  createCommands() {
    const website = readPrefixedEnv(PREFIX, "PUBLIC_WEBSITE_URL") ?? DEFAULT_URL;
    return [
      buildPingCommand(),
      buildInfoCommand(
        "pizza",
        "Links and info for Pizza & Friends",
        "**Pizza & Friends** — a not-so-serious tech community.\nWebsite: {url}",
        () => website,
      ),
    ];
  },
};

export function pizzaToken(): string {
  return requirePrefixedEnv(PREFIX, "DISCORD_TOKEN");
}

export function pizzaClientId(): string | undefined {
  return readPrefixedEnv(PREFIX, "DISCORD_CLIENT_ID");
}

export function pizzaGuildId(): string | undefined {
  return readPrefixedEnv(PREFIX, "DISCORD_GUILD_ID");
}
