# Discord Bot Host

Run **multiple Discord bots in one Heroku web dyno** — shared HTTP health check, prefixed env vars, graceful shutdown.

| Bot id | Source repo | Env prefix |
| ------ | ----------- | ---------- |
| `pizza` | [smmariquit/pizzabot](https://github.com/smmariquit/pizzabot) | `PIZZA_` |
| `crib` | [smmariquit/thecribmc-bot](https://github.com/smmariquit/thecribmc-bot) | `CRIB_` |
| `comskies` | [smmariquit/comskies-bot](https://github.com/smmariquit/comskies-bot) | `COMSKIES_` |

Child repos stay the **source of truth** for bot logic during development (`bun run dev` solo). This host is what you deploy to Heroku.

## Local dev

```sh
cp .env.example .env   # fill tokens; set ENABLED_BOTS to bots you have creds for
bun install
bun run register-commands:all   # or: bun run register-commands pizza
bun run dev
curl localhost:3000/health
```

## Heroku

```sh
heroku create your-bot-host
heroku config:set ENABLED_BOTS=pizza,crib,comskies
heroku config:set PIZZA_DISCORD_TOKEN=... PIZZA_DISCORD_CLIENT_ID=...
# … repeat per bot prefix
git push heroku main
```

Detail: [docs/HEROKU.md](docs/HEROKU.md) · Add a bot: [docs/ADDING_A_BOT.md](docs/ADDING_A_BOT.md)

## Architecture

```text
Heroku web dyno
├── Express  GET /health  (503 until all enabled bots are ready)
└── Discord clients (one login per bot id)
    ├── pizza   → PIZZA_DISCORD_TOKEN
    ├── crib    → CRIB_DISCORD_TOKEN
    └── comskies → COMSKIES_DISCORD_TOKEN
```

## Scripts

| Command | Action |
| ------- | ------ |
| `bun run dev` | Host + enabled bots (watch) |
| `bun run register-commands pizza` | Register slash commands for one bot |
| `bun run register-commands:all` | Register all configured bots |
| `bun run check` | Lint, test, build |

## License

MIT — see [LICENSE](LICENSE).
