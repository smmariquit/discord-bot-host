# Heroku deployment

## One dyno, many bots

Heroku requires a web process binding `PORT`. This host:

1. Starts Express on `PORT` (default 3000 locally).
2. Logs in each bot listed in `ENABLED_BOTS` that has `{PREFIX}_DISCORD_TOKEN` set.
3. Reports readiness at `GET /health`.

## Create app

```sh
heroku create smmariquit-discord-bots   # name varies
heroku git:remote -a smmariquit-discord-bots
```

Or use the [Heroku deploy button](https://heroku.com/deploy) with root `app.json`.

## Config vars

| Var | Example | Notes |
| --- | ------- | ----- |
| `ENABLED_BOTS` | `pizza,crib,comskies` | Subset ok for staging |
| `PIZZA_DISCORD_TOKEN` | `…` | From Discord Developer Portal |
| `PIZZA_DISCORD_CLIENT_ID` | `…` | Same application |
| `PIZZA_DISCORD_GUILD_ID` | `…` | Optional; guild-scoped slash reg |
| `CRIB_*` / `COMSKIES_*` | | Same pattern |

Register slash commands **once** after deploy (or from CI):

```sh
heroku run "node dist/register-commands.js all" -a smmariquit-discord-bots
```

Locally:

```sh
bun run register-commands:all
```

## Deploy

```sh
git push heroku main
heroku logs --tail -a smmariquit-discord-bots
curl https://your-app.herokuapp.com/health
```

## Health check

`GET /health` returns `200` when every **enabled** bot client is `ready`. Returns `503` during startup or if a bot failed login: useful for uptime monitors.

## Scaling notes

- **One dyno** runs all bots in one Node process (fine for low-traffic community bots).
- If one bot misbehaves, it currently shares the process: split to a second Heroku app only if needed.
- `SIGTERM` (Heroku dyno restart) destroys all clients gracefully.

## UPLB Tools bot

The heavier [uplbtools/discord-bot](https://github.com/uplbtools/discord-bot) (HTTP webhooks, cron, GitHub) can stay on its **own** Heroku app or be wired in later via `UPLB_` prefix + optional dependency: not bundled in v0.1.
