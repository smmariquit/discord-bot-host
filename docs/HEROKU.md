# Heroku deployment

## One dyno, many bots

Heroku requires a web process binding `PORT`. This host:

1. Starts Express on `PORT` (default 3000 locally).
2. Logs in each bot listed in `ENABLED_BOTS` that has `{PREFIX}_DISCORD_TOKEN` set.
3. Reports readiness at `GET /health`.

## Create app

```sh
heroku create smmariquit-discord-bots # name varies
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

## Automatic deployment from GitHub

The repository includes two workflows:

- `Check` runs on pull requests and pushes to `main`.
- `Deploy to Heroku` runs only after `Check` succeeds on `main`.

Add these GitHub Actions repository secrets once:

```text
HEROKU_API_KEY   # Heroku account API key
HEROKU_APP_NAME  # exact Heroku app name
```

After that, a merged push to `main` deploys the host. Discord tokens remain Heroku config vars and never enter GitHub.

Manual deploy (useful for recovery):

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

The host fetches and builds [uplbtools/discord-bot](https://github.com/uplbtools/discord-bot) during Heroku's postbuild, then calls `createUplbToolsRuntime({ envPrefix: "UPLB_", listen: false })`. Its Discord client, cron jobs, and webhook routes share this dyno; the host owns `PORT`. Enable it with `uplbtools` in `ENABLED_BOTS` and set the `UPLB_*` vars from its `.env.example`.
