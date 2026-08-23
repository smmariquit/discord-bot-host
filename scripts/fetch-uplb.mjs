import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, ".vendor/uplbtools");

if (!existsSync(resolve(target, "dist/runtime.js"))) {
  // ponytail: build fetches latest main; pin a commit when reproducibility matters.
  mkdirSync(resolve(root, ".vendor"), { recursive: true });
  execFileSync("git", ["clone", "--depth", "1", "https://github.com/uplbtools/discord-bot.git", target], {
    stdio: "inherit",
  });
  execFileSync("npm", ["install", "--ignore-scripts"], { cwd: target, stdio: "inherit" });
  execFileSync("npm", ["run", "build"], { cwd: target, stdio: "inherit" });
}
