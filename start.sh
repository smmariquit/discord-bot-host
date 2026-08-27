#!/bin/bash
# Boot the discord bots (primary) plus the classroom nagger loop.
# Secrets arrive as Heroku config vars; the ephemeral disk gets them at boot.
if [ -n "$GOOGLE_CREDENTIALS_JSON" ]; then
  printf '%s' "$GOOGLE_CREDENTIALS_JSON" > nagger/credentials.json
  printf '%s' "$GOOGLE_TOKEN_JSON" > nagger/token.json
  printf '%s' "$NAGGER_CONFIG_JSON" > nagger/config.json
  ( while true; do
      python3 nagger/nagger.py >> /tmp/nag.log 2>&1
      sleep 300
    done ) &
fi
exec node dist/main.js
