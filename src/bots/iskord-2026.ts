import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { readPrefixedEnv, requirePrefixedEnv } from "../config.js";
import type { BotModule, SlashCommand } from "../types.js";

const PREFIX = "ISKORD";
const VERIFIED = "Verified 🌻";
const BATCH = "Batch 2026";
const COLLEGES = ["CAFS", "CAS", "CDC", "CEAT", "CEM", "CFNR", "CHE", "CVM"];
const DEGREE_PROGRAMS = [
  "BS Agri", "BS ABT", "BSAC", "BS FST", "AA SS", "BACA", "BA Philo", "BA Soc",
  "BS AMAT", "BS APhy", "BS Bio", "BS Chem", "BSCS", "BS Math", "BS MST", "BS Stat",
  "ASDC", "BSDC", "BS ABE", "BS ChE", "BSCE", "BSEE", "BSIE", "BS MatE", "BSME",
  "AA Entrep", "BS Acc", "BS ABME", "BS AAE", "BS Econ", "AScF", "BSF", "BSHE",
  "BS Nutri", "DVM", "DPWAS",
];
const COLLEGE_BY_DEGREE: Record<string, string | string[]> = {
  "BS Agri": "CAFS", "BS ABT": "CAFS", BSAC: ["CAS", "CAFS"], "BS FST": "CAFS",
  "AA SS": "CAS", BACA: "CAS", "BA Philo": "CAS", "BA Soc": "CAS", "BS AMAT": "CAS",
  "BS APhy": "CAS", "BS Bio": "CAS", "BS Chem": "CAS", BSCS: "CAS", "BS Math": "CAS",
  "BS MST": "CAS", "BS Stat": "CAS", ASDC: "CDC", BSDC: "CDC", "BS ABE": "CEAT",
  "BS ChE": "CEAT", BSCE: "CEAT", BSEE: "CEAT", BSIE: "CEAT", "BS MatE": "CEAT",
  BSME: "CEAT", "AA Entrep": "CEM", "BS Acc": "CEM", "BS ABME": "CEM", "BS AAE": "CEM",
  "BS Econ": "CEM", AScF: "CFNR", BSF: "CFNR", BSHE: "CHE", "BS Nutri": "CHE", DVM: "CVM",
};

function hasStaffRole(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as GuildMember | null;
  return Boolean(
    member?.permissions.has(PermissionFlagsBits.Administrator) ||
      member?.roles.cache.some((role) =>
        ["Membership Committee", "Admin", "Server Owner", "The Guard", "Trainee Mod"].includes(role.name),
      ),
  );
}

function deny(interaction: ChatInputCommandInteraction): Promise<unknown> {
  return interaction.reply({ content: "🛡️ Access denied.", ephemeral: true });
}

function degreeOption(option: { addStringOption: (fn: (option: any) => any) => any }) {
  return option.addStringOption((o: any) =>
    o.setName("degree_program").setDescription("Degree-program role name").setRequired(true),
  );
}

async function verify(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!hasStaffRole(interaction)) {
    await deny(interaction);
    return;
  }
  const member = interaction.options.getMember("member");
  const nickname = interaction.options.getString("nickname", true);
  const degree = interaction.options.getString("degree_program", true);
  if (!member || !("roles" in member) || !interaction.guild) {
    await interaction.reply({ content: "Member not found in this server.", ephemeral: true });
    return;
  }
  const target = member as GuildMember;
  const verified = interaction.guild.roles.cache.find((r) => r.name === VERIFIED);
  const batch = interaction.guild.roles.cache.find((r) => r.name === BATCH);
  const degreeRole = interaction.guild.roles.cache.find((r) => r.name === degree);
  if (!verified || !batch || !degreeRole) {
    await interaction.reply({ content: "Required verification roles are missing.", ephemeral: true });
    return;
  }
  const colleges = COLLEGE_BY_DEGREE[degree];
  const collegeNames = colleges ? (Array.isArray(colleges) ? colleges : [colleges]) : [];
  const collegeRoles = collegeNames
    .map((name) => interaction.guild?.roles.cache.find((r) => r.name === name))
    .filter((role): role is NonNullable<typeof role> => Boolean(role));
  if (degree !== "DPWAS" && collegeRoles.length !== collegeNames.length) {
    await interaction.reply({ content: `College role for ${degree} is missing.`, ephemeral: true });
    return;
  }
  const oldRoles = target.roles.cache.filter((role) =>
    DEGREE_PROGRAMS.includes(role.name) || COLLEGES.includes(role.name) || [VERIFIED, BATCH].includes(role.name),
  );
  const formattedNickname = `${nickname} | ${degree} '26`.slice(0, 32);
  try {
    await interaction.deferReply();
    await target.roles.remove(oldRoles);
    await target.roles.add([verified, batch, degreeRole, ...collegeRoles]);
    await target.setNickname(formattedNickname);
    await interaction.editReply(`✅ Verified ${target} as **${degree}** (${formattedNickname}).`);
  } catch (error) {
    await interaction.editReply(`❌ Could not update member: ${String(error)}`);
  }
}

async function deverify(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!hasStaffRole(interaction)) {
    await deny(interaction);
    return;
  }
  const member = interaction.options.getMember("member");
  if (!member || !("roles" in member)) {
    await interaction.reply({ content: "Member not found in this server.", ephemeral: true });
    return;
  }
  const target = member as GuildMember;
  const roles = target.roles.cache.filter((role) =>
    DEGREE_PROGRAMS.includes(role.name) || COLLEGES.includes(role.name) || [VERIFIED, BATCH].includes(role.name),
  );
  try {
    await target.roles.remove(roles);
    await target.setNickname(null);
    await interaction.reply({ content: `✅ De-verified ${target}.`, ephemeral: true });
  } catch (error) {
    await interaction.reply({ content: `❌ Could not update member: ${String(error)}`, ephemeral: true });
  }
}

function buildCommands(): SlashCommand[] {
  const verifyCommand = new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Verify a Batch 2026 member")
    .addUserOption((o) => o.setName("member").setDescription("Member to verify").setRequired(true))
    .addStringOption((o) => o.setName("nickname").setDescription("Preferred nickname").setRequired(true));
  degreeOption(verifyCommand);
  const deverifyCommand = new SlashCommandBuilder()
    .setName("deverify")
    .setDescription("Remove Batch 2026 verification roles")
    .addUserOption((o) => o.setName("member").setDescription("Member to de-verify").setRequired(true));
  return [
    { data: verifyCommand, execute: verify },
    { data: deverifyCommand, execute: deverify },
    {
      data: new SlashCommandBuilder()
        .setName("say")
        .setDescription("Send an embed to a channel")
        .addChannelOption((o) => o.setName("channel").setDescription("Target channel").setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("Embed text").setRequired(true)),
      async execute(interaction) {
        if (!hasStaffRole(interaction)) return void (await deny(interaction));
        const channel = interaction.options.getChannel("channel");
        const message = interaction.options.getString("message", true);
        const target = channel as TextChannel;
        if (!target || typeof target.send !== "function") return void (await interaction.reply({ content: "Invalid channel.", ephemeral: true }));
        await target.send({ embeds: [new EmbedBuilder().setDescription(message).setColor(0xf7d92d)] });
        await interaction.reply({ content: "Message sent.", ephemeral: true });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName("send_post")
        .setDescription("Send a plain text post")
        .addChannelOption((o) => o.setName("channel").setDescription("Target channel").setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("Post text").setRequired(true)),
      async execute(interaction) {
        if (!hasStaffRole(interaction)) return void (await deny(interaction));
        const channel = interaction.options.getChannel("channel");
        const target = channel as TextChannel;
        if (!target || typeof target.send !== "function") return void (await interaction.reply({ content: "Invalid channel.", ephemeral: true }));
        await target.send(interaction.options.getString("message", true));
        await interaction.reply({ content: "Post sent.", ephemeral: true });
      },
    },
    {
      data: new SlashCommandBuilder()
        .setName("edit")
        .setDescription("Edit an embed sent by this bot")
        .addStringOption((o) => o.setName("message_id").setDescription("Message ID").setRequired(true))
        .addStringOption((o) => o.setName("message").setDescription("New embed text").setRequired(true))
        .addStringOption((o) => o.setName("image_url").setDescription("Optional image URL")),
      async execute(interaction) {
        if (!hasStaffRole(interaction)) return void (await deny(interaction));
        const channel = interaction.channel as TextChannel;
        if (!channel || typeof channel.messages?.fetch !== "function") {
          return void (await interaction.reply({ content: "This command must run in a text channel.", ephemeral: true }));
        }
        try {
          const message = await channel.messages.fetch(interaction.options.getString("message_id", true));
          if (message.author.id !== interaction.client.user?.id) {
            return void (await interaction.reply({ content: "I can only edit my own messages.", ephemeral: true }));
          }
          const embed = new EmbedBuilder()
            .setDescription(interaction.options.getString("message", true))
            .setColor(0xf7d92d);
          const imageUrl = interaction.options.getString("image_url");
          if (imageUrl) embed.setImage(imageUrl);
          await message.edit({ embeds: [embed] });
          await interaction.reply({ content: "Message edited.", ephemeral: true });
        } catch (error) {
          await interaction.reply({ content: `Could not edit message: ${String(error)}`, ephemeral: true });
        }
      },
    },
  ];
}

export const iskordModule: BotModule = {
  id: "iskord-2026",
  label: "Iskord Batch 2026",
  envPrefix: PREFIX,
  isConfigured: () => Boolean(readPrefixedEnv(PREFIX, "DISCORD_TOKEN")),
  createCommands: buildCommands,
};

export const iskordToken = () => requirePrefixedEnv(PREFIX, "DISCORD_TOKEN");
