#!/bin/bash
# Boot the discord bots (primary) plus the classroom nagger loop.
# Secrets arrive as Heroku config vars; the ephemeral disk gets them at boot.
if [ -n "$GOOGLE_CREDENTIALS_JSON" ]; then
  printf '%s' "$GOOGLE_CREDENTIALS_JSON" > nagger/credentials.json
  printf '%s' "$GOOGLE_TOKEN_JSON" > nagger/token.json
  printf '%s' "$NAGGER_CONFIG_JSON" > nagger/config.json
  ( while true; do
      python3 nagger/nagger.py 2>&1 | sed 's/^/[nagger] /'
      sleep 300
    done ) &
  # spaced-repetition drill, deck from SRS_CARDS_JSON (kept out of the public repo)
  if [ -n "$SRS_CARDS_JSON" ]; then
    printf '%s' "$SRS_CARDS_JSON" > nagger/cards.json
    ( while true; do
        python3 nagger/srs.py 2>&1 | sed 's/^/[srs] /'
        sleep 5
      done ) &
  fi
fi
exec node dist/main.js
