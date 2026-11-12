import { describe, expect, test } from "bun:test";
import { FIRST_SLOT, QUESTIONS, questionFor, slotStart } from "./weekly-question.js";

const WEEK = 7 * 24 * 60 * 60 * 1000;
// Wed 2026-11-18 19:00 Manila is 11:00 UTC.
const manila = (iso: string) => Date.parse(`${iso}+08:00`);

describe("weekly question", () => {
  test("first slot is Wednesday 7 PM Manila", () => {
    expect(FIRST_SLOT).toBe(manila("2026-11-18T19:00:00"));
  });

  test("slotStart rolls back to the latest Wednesday 7 PM", () => {
    expect(slotStart(manila("2026-11-18T19:00:00"))).toBe(FIRST_SLOT);
    expect(slotStart(manila("2026-11-18T18:59:00"))).toBe(FIRST_SLOT - WEEK);
    expect(slotStart(manila("2026-11-24T23:00:00"))).toBe(FIRST_SLOT);
    expect(slotStart(manila("2026-11-25T19:30:00"))).toBe(FIRST_SLOT + WEEK);
    // Wednesday morning in Manila is still Tuesday in UTC.
    expect(slotStart(manila("2026-11-25T07:00:00"))).toBe(FIRST_SLOT);
  });

  test("questions go in order and wrap around", () => {
    expect(questionFor(FIRST_SLOT)).toBe(QUESTIONS[0]);
    expect(questionFor(FIRST_SLOT + WEEK)).toBe(QUESTIONS[1]);
    expect(questionFor(FIRST_SLOT + QUESTIONS.length * WEEK)).toBe(QUESTIONS[0]);
  });

  test("every question fits a thread name", () => {
    for (const q of QUESTIONS) expect(q.length).toBeLessThanOrEqual(100);
  });
});
