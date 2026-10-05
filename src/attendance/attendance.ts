import {
  AttachmentBuilder,
  ChannelType,
  type Message,
  PermissionFlagsBits,
  SlashCommandBuilder,
  SnowflakeUtil,
} from "discord.js";
import type { SlashCommand } from "../types.js";

export type VoiceEvent = {
  at: number;
  userId: string;
  name: string;
  channelId: string;
  kind: "join" | "leave";
};

export type AttendanceRow = { userId: string; name: string; minutes: number; firstSeen: number };

export type AttendanceSummary = {
  rows: AttendanceRow[];
  peak: number;
  peakAt: number;
};

const TZ = "Asia/Manila";

/**
 * Dyno's voice log embeds read "<@user> joined|left voice channel <#chan>" or
 * "<@user> switched voice channels <#old> -> <#new>", with "ID: <user>" in the footer.
 * ponytail: Dyno's #logs is the store of every join. Swap to our own table if Dyno ever leaves.
 */
export function parseDynoVoiceEmbed(
  description: string,
  footer: string,
  name: string,
  at: number,
): VoiceEvent[] {
  const userId = footer.match(/ID:\s*(\d+)/)?.[1];
  if (!userId) return [];
  const channels = [...description.matchAll(/<#(\d+)>/g)].map((m) => m[1]);
  const base = { at, userId, name };
  if (/\bjoined voice channel\b/.test(description) && channels[0]) {
    return [{ ...base, channelId: channels[0], kind: "join" }];
  }
  if (/\bleft voice channel\b/.test(description) && channels[0]) {
    return [{ ...base, channelId: channels[0], kind: "leave" }];
  }
  if (/\bswitched voice channels?\b/.test(description) && channels.length >= 2) {
    return [
      { ...base, channelId: channels[0], kind: "leave" },
      { ...base, channelId: channels[1], kind: "join" },
    ];
  }
  return [];
}

/** Minutes per person inside [from, to]. A leave with no join means they were already in at `from`. */
export function summarize(
  events: VoiceEvent[],
  channelId: string,
  from: number,
  to: number,
): AttendanceSummary {
  const open = new Map<string, number>();
  const intervals: { userId: string; name: string; start: number; end: number }[] = [];
  const names = new Map<string, string>();
  const sorted = events
    .filter((e) => e.channelId === channelId && e.at >= from && e.at <= to)
    .sort((a, b) => a.at - b.at);

  for (const e of sorted) {
    names.set(e.userId, e.name);
    if (e.kind === "join") {
      if (!open.has(e.userId)) open.set(e.userId, e.at);
      continue;
    }
    const start = open.get(e.userId) ?? from;
    open.delete(e.userId);
    intervals.push({ userId: e.userId, name: e.name, start, end: e.at });
  }
  for (const [userId, start] of open) {
    intervals.push({ userId, name: names.get(userId) ?? userId, start, end: to });
  }

  const byUser = new Map<string, AttendanceRow>();
  for (const i of intervals) {
    const row = byUser.get(i.userId) ?? {
      userId: i.userId,
      name: i.name,
      minutes: 0,
      firstSeen: i.start,
    };
    row.minutes += (i.end - i.start) / 60_000;
    row.firstSeen = Math.min(row.firstSeen, i.start);
    byUser.set(i.userId, row);
  }

  // Sweep for peak headcount. Leaves sort before joins at the same instant.
  const points = intervals
    .flatMap((i) => [
      { at: i.start, d: 1 },
      { at: i.end, d: -1 },
    ])
    .sort((a, b) => a.at - b.at || a.d - b.d);
  let now = 0;
  let peak = 0;
  let peakAt = from;
  for (const p of points) {
    now += p.d;
    if (now > peak) {
      peak = now;
      peakAt = p.at;
    }
  }

  const rows = [...byUser.values()].sort((a, b) => b.minutes - a.minutes);
  return { rows, peak, peakAt };
}

/** "2026-10-04 19:00" in Philippine time. */
export function parsePhTime(raw: string): number {
  const ms = Date.parse(`${raw.trim().replace(" ", "T")}:00+08:00`);
  if (Number.isNaN(ms)) throw new Error(`Bad time "${raw}". Use YYYY-MM-DD HH:MM (PH time).`);
  return ms;
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleString("en-PH", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function fetchDynoEvents(
  logs: {
    messages: { fetch: (o: { after: string; limit: number }) => Promise<Map<string, Message>> };
  },
  from: number,
  to: number,
): Promise<VoiceEvent[]> {
  const events: VoiceEvent[] = [];
  let after = SnowflakeUtil.generate({ timestamp: from }).toString();
  // ponytail: pages 100 at a time, capped at 50 pages (5,000 log lines) per query.
  for (let page = 0; page < 50; page++) {
    const batch = [...(await logs.messages.fetch({ after, limit: 100 })).values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );
    if (batch.length === 0) break;
    for (const m of batch) {
      if (m.createdTimestamp > to) return events;
      for (const embed of m.embeds) {
        events.push(
          ...parseDynoVoiceEmbed(
            embed.description ?? "",
            embed.footer?.text ?? "",
            embed.author?.name ?? "",
            m.createdTimestamp,
          ),
        );
      }
    }
    after = batch[batch.length - 1].id;
  }
  return events;
}

export function buildAttendanceCommand(logsChannelId: () => string): SlashCommand {
  return {
    data: new SlashCommandBuilder()
      .setName("attendance")
      .setDescription("Who was in a voice channel during a time range (from Dyno #logs)")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("Voice channel")
          .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o.setName("from").setDescription("Start, PH time: 2026-10-04 19:00").setRequired(true),
      )
      .addStringOption((o) => o.setName("to").setDescription("End, PH time (default: now)"))
      .addIntegerOption((o) =>
        o
          .setName("min_minutes")
          .setDescription("Count as attended after this many minutes (default 15)")
          .setMinValue(0),
      ),
    async execute(interaction) {
      const channel = interaction.options.getChannel("channel", true);
      let from: number;
      let to: number;
      try {
        from = parsePhTime(interaction.options.getString("from", true));
        const rawTo = interaction.options.getString("to");
        to = rawTo ? parsePhTime(rawTo) : Date.now();
      } catch (err) {
        await interaction.reply({ content: String((err as Error).message), ephemeral: true });
        return;
      }
      const minMinutes = interaction.options.getInteger("min_minutes") ?? 15;
      await interaction.deferReply({ ephemeral: true });

      const logs = await interaction.client.channels.fetch(logsChannelId());
      if (!logs || !logs.isTextBased() || !("messages" in logs)) {
        await interaction.editReply(
          "Can't read the logs channel. Check COMSKIES_LOGS_CHANNEL_ID and bot access.",
        );
        return;
      }
      const events = await fetchDynoEvents(logs, from, to);
      const { rows, peak, peakAt } = summarize(events, channel.id, from, to);
      const stayed = rows.filter((r) => r.minutes >= minMinutes).length;

      const csv = [
        "name,user_id,minutes,first_seen",
        ...rows.map((r) => `${r.name},${r.userId},${Math.round(r.minutes)},${fmt(r.firstSeen)}`),
      ].join("\n");
      const top = rows
        .slice(0, 40)
        .map((r) => `${r.name}: ${Math.round(r.minutes)} min`)
        .join("\n");

      await interaction.editReply({
        content: [
          `**<#${channel.id}>**, ${fmt(from)} to ${fmt(to)}`,
          `${rows.length} joined, ${stayed} stayed ${minMinutes}+ min, peak ${peak} at ${fmt(peakAt)}`,
          top ? `\`\`\`\n${top}\n\`\`\`` : "No voice activity in that range.",
        ]
          .join("\n")
          .slice(0, 2000),
        files: rows.length
          ? [new AttachmentBuilder(Buffer.from(csv), { name: "attendance.csv" })]
          : [],
      });
    },
  };
}
