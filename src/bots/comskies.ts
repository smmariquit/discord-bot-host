import { fileURLToPath } from "node:url";
import { AttachmentBuilder, EmbedBuilder, Events, GatewayIntentBits } from "discord.js";
import { buildAttendanceCommand } from "../attendance/attendance.js";
import { readPrefixedEnv, requirePrefixedEnv } from "../config.js";
import { buildInfoCommand, buildPingCommand } from "../discord/create-client.js";
import { log } from "../log.js";
import type { BotModule } from "../types.js";

const PREFIX = "COMSKIES";
const DEFAULT_URL = "https://room-tba.uplbtools.me";
/** Dyno #logs in the ICS server */
const DEFAULT_LOGS_CHANNEL_ID = "1450882679326249103";
const ICS_GUILD_ID = "1450015925167456289";
const WELCOME_CHANNEL_ID = "1450381070594998366";
const RULES_CHANNEL_ID = "1450376311578038333";
const WELCOME_BANNER = fileURLToPath(
  new URL("../../assets/comskies-welcome-banner.png", import.meta.url),
);

/** Same text and banner Comskies posted in #welcome before the move to this host. */
function welcomeMessage(userId: string, memberCount: number) {
  return {
    content: `Welcome to the **ICS Students' Discord Server**, <@${userId}>! <a:ICS_wave:1452943522364657664>`,
    embeds: [
      new EmbedBuilder()
        .setColor(0x0d59bb)
        .setTitle(`Member #${memberCount} has joined!`)
        .setDescription(
          [
            "Glad to see you here! <:ICS_piplupHi:1455207745644134420> ",
            `Before anything else, please do read the <#${RULES_CHANNEL_ID}> channel `,
            "Pick up your roles here in the <id:customize> section and check out the other channels as well! ",
            "<:zICS_whiteLine:1455225732610527274>".repeat(10),
            "Enjoy your stay here at **Comskies**! <a:zICS_sparkles:1455208116634259548>",
          ].join("\n"),
        )
        .setImage("attachment://welcome_banner.png"),
    ],
    files: [new AttachmentBuilder(WELCOME_BANNER, { name: "welcome_banner.png" })],
  };
}

export const comskiesModule: BotModule = {
  id: "comskies",
  label: "Comskies Bot (ICS Discord)",
  envPrefix: PREFIX,
  isConfigured() {
    return Boolean(readPrefixedEnv(PREFIX, "DISCORD_TOKEN"));
  },
  intents: [GatewayIntentBits.GuildMembers],
  setup(client) {
    client.on(Events.GuildMemberAdd, async (member) => {
      if (member.guild.id !== ICS_GUILD_ID || member.user.bot) return;
      try {
        const channel = await client.channels.fetch(WELCOME_CHANNEL_ID);
        if (channel?.isSendable())
          await channel.send(welcomeMessage(member.id, member.guild.memberCount));
      } catch (err) {
        log("error", `[comskies] welcome for ${member.id}: ${String(err)}`);
      }
    });
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
