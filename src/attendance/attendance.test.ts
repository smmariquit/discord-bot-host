import { describe, expect, test } from "bun:test";
import { parseDynoVoiceEmbed, parsePhTime, summarize } from "./attendance.js";

const VC = "111";
const min = (m: number) => m * 60_000;

describe("attendance", () => {
  test("parses Dyno join, leave, switch", () => {
    expect(parseDynoVoiceEmbed("<@5> joined voice channel <#111>", "ID: 5", "a", 0)[0].kind).toBe(
      "join",
    );
    expect(parseDynoVoiceEmbed("<@5> left voice channel <#111>", "ID: 5", "a", 0)[0].kind).toBe(
      "leave",
    );
    const sw = parseDynoVoiceEmbed("<@5> switched voice channel <#222> -> <#111>", "ID: 5", "a", 0);
    expect(sw.map((e) => [e.channelId, e.kind])).toEqual([
      ["222", "leave"],
      ["111", "join"],
    ]);
    expect(parseDynoVoiceEmbed("Message deleted in <#111>", "ID: 5", "a", 0)).toEqual([]);
  });

  test("sums minutes, handles rejoin, already-in, still-in, peak", () => {
    const ev = (at: number, userId: string, kind: "join" | "leave") => ({
      at: min(at),
      userId,
      name: userId,
      channelId: VC,
      kind,
    });
    const { rows, peak, peakAt } = summarize(
      [
        ev(0, "a", "join"),
        ev(10, "b", "join"),
        ev(20, "a", "leave"),
        ev(30, "a", "join"),
        ev(40, "c", "leave"), // c was in before `from`
        { ...ev(5, "d", "join"), channelId: "other" },
      ],
      VC,
      0,
      min(60),
    );
    const m = Object.fromEntries(rows.map((r) => [r.userId, r.minutes]));
    expect(m).toEqual({ a: 50, b: 50, c: 40 });
    expect(peak).toBe(3);
    expect(peakAt).toBe(min(10));
  });

  test("PH time", () => {
    expect(new Date(parsePhTime("2026-10-04 19:00")).toISOString()).toBe(
      "2026-10-04T11:00:00.000Z",
    );
  });
});
