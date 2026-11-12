import { ChannelType, Events } from "discord.js";
import { readPrefixedEnv } from "../config.js";
import { log } from "../log.js";
import type { BotClient } from "../types.js";

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;
/** Manila is UTC+8 all year. */
const MANILA_MS = 8 * HOUR_MS;
/** Wednesday, 7 PM Manila. */
const SLOT_DAY = 3;
const SLOT_HOUR = 19;
/** First post, Wed 2026-11-18 7 PM Manila. Question 0 goes out that week. */
export const FIRST_SLOT = Date.UTC(2026, 10, 18, SLOT_HOUR) - MANILA_MS;
const CHECK_EVERY_MS = 15 * 60 * 1000;
/** After a long outage, skip the week instead of posting a day late. */
const MAX_LATE_MS = 12 * HOUR_MS;

export const QUESTIONS = [
  "whats the best thing u ate this week?",
  "what did u do this week na walang screen involved?",
  "whats the most useless skill u have?",
  "best ulam of all time, go",
  "whats a song u have on repeat rn?",
  "whats the last thing that made u laugh irl?",
  "pineapple on pizza, yes or no? defend ur answer",
  "whats a small thing that made ur week better?",
  "whats ur go-to fast food order?",
  "whats something ur weirdly good at?",
  "what are u looking forward to this month?",
  "whats the best advice u got from someone older?",
  "whats ur comfort show or movie?",
  "free saturday, no gadgets. ano gagawin mo?",
  "whats a place in ur city that more people should know about?",
  "whats something u changed ur mind about recently?",
  "whats the best gift u ever gave or got?",
  "whats a hobby u want to try but havent started?",
  "whats ur most controversial food opinion?",
  "who in ur life deserves a shoutout this week?",
  "whats the last book, article or video that stuck with u?",
  "what was ur childhood dream job?",
  "build ur perfect pizza. what toppings?",
  "whats a family tradition niyo that u actually like?",
  "whats one thing u did this week that ur proud of, kahit maliit?",
  "whats a word or phrase u say way too much?",
  "dinner with anyone, alive or not. sino?",
  "whats ur favorite way to spend a rainy day?",
];

/** Start of the latest weekly slot at or before `now`, in epoch ms. */
export function slotStart(now: number): number {
  const m = new Date(now + MANILA_MS);
  const daysBack = (m.getUTCDay() - SLOT_DAY + 7) % 7;
  const start =
    Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate() - daysBack, SLOT_HOUR) - MANILA_MS;
  return start > now ? start - WEEK_MS : start;
}

export function questionFor(slot: number): string {
  const week = Math.round((slot - FIRST_SLOT) / WEEK_MS);
  return QUESTIONS[week % QUESTIONS.length];
}

async function postIfDue(client: BotClient, tag: string, channelId: string): Promise<void> {
  const now = Date.now();
  const slot = slotStart(now);
  if (slot < FIRST_SLOT || now - slot > MAX_LATE_MS) return;
  const me = client.user?.id;
  const question = questionFor(slot);
  const name = question.slice(0, 100);
  const channel = await client.channels.fetch(channelId);

  if (channel?.type === ChannelType.GuildForum) {
    const [active, archived] = await Promise.all([
      channel.threads.fetchActive(),
      channel.threads.fetchArchived({ limit: 10 }),
    ]);
    const mine = [...active.threads.values(), ...archived.threads.values()];
    if (
      mine.some(
        (t) => t.parentId === channelId && t.ownerId === me && (t.createdTimestamp ?? 0) >= slot,
      )
    )
      return;
    await channel.threads.create({
      name,
      message: { content: question, allowedMentions: { parse: [] } },
    });
  } else if (channel?.type === ChannelType.GuildText) {
    // ponytail: dedup reads recent history instead of storing state, survives dyno restarts
    const recent = await channel.messages.fetch({ limit: 10 });
    if (recent.some((m) => m.author.id === me && m.createdTimestamp >= slot)) return;
    const msg = await channel.send({ content: question, allowedMentions: { parse: [] } });
    await msg.startThread({ name });
  } else {
    log("error", `[${tag}] qotd channel ${channelId} is not a text or forum channel`);
    return;
  }
  log("info", `[${tag}] posted qotd: ${question}`);
}

/** Posts one question a week to {PREFIX}_QOTD_CHANNEL_ID. Off when the channel is unset. */
export function attachWeeklyQuestion(client: BotClient, prefix: string): void {
  const tag = prefix.toLowerCase();
  const channelId = readPrefixedEnv(prefix, "QOTD_CHANNEL_ID");
  if (!channelId) return;
  const tick = () =>
    postIfDue(client, tag, channelId).catch((err) => log("error", `[${tag}] qotd: ${String(err)}`));
  client.once(Events.ClientReady, () => {
    tick();
    setInterval(tick, CHECK_EVERY_MS);
  });
}
