# Adding a bot to the host

## Today (v0.1)

Bot adapters live in `src/bots/{id}.ts`. Each child repo ([pizzabot](https://github.com/smmariquit/pizzabot), etc.) is developed standalone; the host duplicates the command wiring until bots export a shared runtime.

### Checklist

1. **Child repo**: bot works with `bun run dev` and documents its env vars.
2. **Host adapter**: add `src/bots/yourbot.ts`:
 - `id`, `label`, `envPrefix`
 - `isConfigured()` → checks `{PREFIX}_DISCORD_TOKEN`
 - `createCommands()` → slash command definitions
3. **Registry**: import in `src/bots/registry.ts`, add to `allBotModules`, extend `tokenForModule`.
4. **Env**: document `{PREFIX}_*` in `.env.example`.
5. **ENABLED_BOTS**: include new id in README table.
6. **Deploy**: `heroku config:set NEWBOT_DISCORD_TOKEN=…` and add id to `ENABLED_BOTS`.
   Code changes deploy automatically after merging to `main`; config-var changes take effect after `heroku restart`.

### Env prefix convention

| Prefix | Bot |
| ------ | --- |
| `PIZZA_` | Pizzabot |
| `CRIB_` | TheCribMC |
| `COMSKIES_` | Comskies |
| `ISKORD_` | Iskord Batch 2026 |

Use uppercase prefix + highlight. Required keys per bot:

- `{PREFIX}_DISCORD_TOKEN`
- `{PREFIX}_DISCORD_CLIENT_ID` (for `register-commands` only)

Optional:

- `{PREFIX}_DISCORD_GUILD_ID`: dev guild command registration
- `{PREFIX}_PUBLIC_WEBSITE_URL`: info command links

## Current limitation

The standalone bot repositories remain their own source trees today. A push to `pizzabot`, `comskies-bot`, `Iskord-2026`, or `uplbtools/discord-bot` does not deploy this host automatically; merge the corresponding central-host change to `main`. Do not silently run both a standalone bot and its host adapter with the same token.

## Future

- Publish `createBotModule()` from each child repo (`exports` in package.json).
- Host depends on `github:smmariquit/pizzabot#main` and registers exported modules dynamically.
- Shared `@smmariquit/discord-bot-core` for ping/helpers to avoid duplication.
