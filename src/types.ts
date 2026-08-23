import type {
  ChatInputCommandInteraction,
  Client,
  Collection,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";

export type SlashCommand = {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};

export type BotClient = Client & {
  commands: Collection<string, SlashCommand>;
};

export type BotModule = {
  /** Stable id — matches ENABLED_BOTS entry */
  id: string;
  /** Human label for logs */
  label: string;
  /** Env prefix, e.g. PIZZA → PIZZA_DISCORD_TOKEN */
  envPrefix: string;
  isConfigured: () => boolean;
  createCommands: () => SlashCommand[];
};

export type BotHandle = {
  module: BotModule;
  client: BotClient;
};
