# Discord Bot Host

Run **multiple Discord bots in one Heroku web dyno**: shared HTTP health check, prefixed env vars, graceful shutdown.

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

## Heroku student plan: will it go away?

**Short answer:** Nothing public suggests it is about to end, but **yes, it could be reduced or removed**: same as any GitHub Student Developer Pack partner offer.

| What we know (2026) | |
| ------------------- | --- |
| **Still listed** | Heroku remains a [Student Pack partner](https://www.heroku.com/github-students/): about **$13/month platform credit for 24 months** (dynos, Heroku Postgres/KV; not third-party add-ons). |
| **Partner offers change** | [GitHub’s SDP FAQ](https://github.com/github-education-resources/Student-Developer-Pack-Current-Partners-FAQ) states benefits can change scope or leave the pack; partners sometimes pause or exit with limited notice. |
| **Precedent** | Heroku dropped the **free tier in 2022**; student credits are a separate, explicit program: but it is not a permanent entitlement. |
| **After you redeem** | If Heroku leaves the pack while you are enrolled, you usually keep the **already-granted credit term** (see GitHub/Heroku terms at signup time). |

**Is a sudden retraction *likely*?** Not more likely than for other Pack partners: there is no announced sunset. Treat it as **convenient while it lasts**, not a long-term infra guarantee.

**If credits disappear or you graduate:** this host is plain Node + Express + discord.js: portable to Railway, Fly.io, Render, a $5 VPS, etc. One dyno running several bots keeps the escape cost low. See [docs/HEROKU.md](docs/HEROKU.md) for deploy steps today; plan B is re-point `git push` and env vars elsewhere, not rewrite bot logic.

*Last checked against public Heroku/GitHub docs: July 2026: verify before budgeting.*

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

## Legal

- [Privacy Policy](docs/PRIVACY.md)
- [Terms of Service](docs/TERMS.md)
- UPLB Tools org policy (when live): [uplbtools.me/privacy](https://uplbtools.me/privacy)

## License

MIT: see [LICENSE](LICENSE).
