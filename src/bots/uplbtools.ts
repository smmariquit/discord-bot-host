import type { BotModule } from "../types.js";

export const uplbToolsModule: BotModule = {
  id: "uplbtools",
  label: "UPLB Tools",
  envPrefix: "UPLB",
  isConfigured: () => Boolean(process.env.UPLB_DISCORD_TOKEN),
  createCommands: () => [],
};
