import { z } from "zod";

const hostSchema = z.object({
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(["info", "warn", "error"]).default("info"),
  ENABLED_BOTS: z.string().default(""),
  HOST_SECRET: z.string().optional(),
});

export type HostConfig = z.infer<typeof hostSchema>;

export function loadHostConfig(): HostConfig {
  return hostSchema.parse(process.env);
}

export function parseEnabledBots(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function readPrefixedEnv(prefix: string, key: string): string | undefined {
  const value = process.env[`${prefix}_${key}`]?.trim();
  return value || undefined;
}

export function requirePrefixedEnv(prefix: string, key: string): string {
  const value = readPrefixedEnv(prefix, key);
  if (!value) {
    throw new Error(`Missing env var: ${prefix}_${key}`);
  }
  return value;
}
