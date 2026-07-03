import "dotenv/config";
import { createBotHost } from "./host.js";
import { log } from "./log.js";

async function main() {
  const host = createBotHost();
  await host.start();

  const shutdown = async (signal: string) => {
    log("info", `${signal} received — shutting down`);
    await host.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  log("error", String(err));
  process.exit(1);
});
