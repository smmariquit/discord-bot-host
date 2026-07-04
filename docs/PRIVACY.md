# Privacy Policy

**Last updated:** July 4, 2026

This host runs multiple Discord bots in a single deployment. This policy covers the host process and enabled child bots.

## What we process

- **Discord account data** from enabled bots when users invoke slash commands — passed through to the relevant bot handler only.
- **Health-check HTTP requests** to `/health` (minimal technical metadata).
- **Environment configuration** (bot tokens, guild IDs) stored on the host — never logged in plaintext.

## What we do not do

- We do **not** sell personal data.
- We do **not** use Discord interaction data for third-party advertising.
- We do **not** merge data across bots for profiling.

## Child bots

Each enabled bot may have its own supplemental policy in its source repository. See [docs/ADDING_A_BOT.md](ADDING_A_BOT.md) for the bot list.

## Related policies

- UPLB Tools org policy (when live): [uplbtools.me/privacy](https://uplbtools.me/privacy)

## Contact

Open an issue in this repository.
