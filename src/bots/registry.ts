import { cribModule, cribToken } from "./crib.js";
import { comskiesModule, comskiesToken } from "./comskies.js";
import { pizzaModule, pizzaToken } from "./pizza.js";
import type { BotModule } from "../types.js";

/** All bot modules known to this host. Add new entries when onboarding a bot repo. */
export const allBotModules: BotModule[] = [pizzaModule, cribModule, comskiesModule];

export function getBotModule(id: string): BotModule | undefined {
  return allBotModules.find((m) => m.id === id);
}

export function tokenForModule(module: BotModule): string {
  switch (module.id) {
    case "pizza":
      return pizzaToken();
    case "crib":
      return cribToken();
    case "comskies":
      return comskiesToken();
    default:
      throw new Error(`No token helper for bot: ${module.id}`);
  }
}
