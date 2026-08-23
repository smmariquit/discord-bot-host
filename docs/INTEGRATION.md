# Central hosting

These bots are developed in their own repositories and hosted together by [`smmariquit/discord-bot-host`](https://github.com/smmariquit/discord-bot-host).

## Production shape

```text
GitHub main
  -> Check workflow (typecheck, tests, build)
  -> Deploy workflow
  -> one Heroku web dyno
       -> Express /health
       -> Pizza & Friends Discord client
       -> Comskies Discord client
       -> Iskord 2026 Discord client
       -> UPLB Tools Discord client (runtime export)
```

Each bot has a separate Discord application and token. The host starts only the ids listed in `ENABLED_BOTS`; a missing token is logged and that bot is skipped.

## Integration contract

| Bot | Host integration | Token prefix |
| --- | --- | --- |
| Pizza & Friends | `src/bots/pizza.ts` adapter | `PIZZA_` |
| Comskies | `src/bots/comskies.ts` adapter | `COMSKIES_` |
| Iskord 2026 | `src/bots/iskord-2026.ts` adapter | `ISKORD_` |
| UPLB Tools | `createUplbToolsRuntime({ envPrefix: "UPLB_", listen: false })` | `UPLB_` |

The host owns the Heroku `PORT`. UPLB Tools runs with `listen: false` so its Discord client, cron jobs, and webhook handlers share the host lifecycle instead of opening a second HTTP listener.

## Deploys and credits

Merge to `main` in the central host to deploy. GitHub Actions checks the code first, then pushes the slug to Heroku. Bot tokens and integration secrets live only in Heroku config vars.

The current plan is funded by a Heroku GitHub Student Developer Pack credit with a target horizon of **May 2028** (24 months from the expected start). Treat that date as a planning estimate; confirm the actual expiry and remaining balance in Heroku before budgeting.

## Adding or changing a bot

Change bot behavior in its source repository, update the matching host adapter/runtime integration, add or update its prefixed config vars, then merge the central host change. Standalone bot pushes do not deploy the central host automatically unless a corresponding central-host change is made.
