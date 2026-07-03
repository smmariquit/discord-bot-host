import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  SlashCommandBuilder,
} from "discord.js";
import { log } from "../log.js";
import type { BotClient, BotModule, SlashCommand } from "../types.js";

export function createBotClient(module: BotModule, commands: SlashCommand[]): BotClient {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  }) as BotClient;

  client.commands = new Collection(commands.map((cmd) => [cmd.data.name, cmd]));

  client.once(Events.ClientReady, (ready) => {
    log("info", `[${module.id}] logged in as ${ready.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      log("error", `[${module.id}] ${interaction.commandName}: ${String(err)}`);
      const payload = { content: "Something went wrong. Try again later.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  });

  return client;
}

export function buildPingCommand(): SlashCommand {
  return {
    data: new SlashCommandBuilder().setName("ping").setDescription("Check bot latency"),
    async execute(interaction) {
      const start = Date.now();
      await interaction.reply({ content: "Pong…", ephemeral: true });
      const ms = Date.now() - start;
      await interaction.editReply({
        content: `Pong — ${ms}ms (gateway: ${interaction.client.ws.ping}ms)`,
      });
    },
  };
}

export function buildInfoCommand(
  name: string,
  description: string,
  messageTemplate: string,
  resolveUrl: () => string,
): SlashCommand {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription(description),
    async execute(interaction) {
      await interaction.reply({
        content: messageTemplate.replace("{url}", resolveUrl()),
      });
    },
  };
}
