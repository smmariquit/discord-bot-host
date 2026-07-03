import { describe, expect, test } from "bun:test";
import { parseEnabledBots } from "./config.js";
import { allBotModules, getBotModule } from "./bots/registry.js";

describe("host config", () => {
  test("parseEnabledBots splits comma list", () => {
    expect(parseEnabledBots("pizza, crib ,comskies")).toEqual(["pizza", "crib", "comskies"]);
  });
});

describe("bot registry", () => {
  test("knows pizza, crib, comskies", () => {
    expect(allBotModules.map((m) => m.id)).toEqual(["pizza", "crib", "comskies"]);
    expect(getBotModule("pizza")?.envPrefix).toBe("PIZZA");
  });
});
