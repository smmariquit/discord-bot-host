#!/usr/bin/env python3
"""Spaced-repetition drill that nags until you show you know the answer.

One card is pending at a time. It goes out by Telegram and email, and you
answer by typing a reply in the Telegram chat. The answer passes when it
contains every required term of the card ("must"); each term may list
alternatives as "a|b". Matching ignores case and whitespace.
Pass: the card moves up a Leitner box (next review 1, 2, 4, 8, 16, then 32
days out) and the next due card follows. Fail: the model answer is shown,
the card drops to the first box, and it stays pending. A pending card is
re-asked on both channels every REMIND_MIN minutes in waking hours.

Deck: cards.json, [{"id": "koch", "q": "...", "a": "...", "must": ["4", "3", "1.26"]}].
On Heroku start.sh writes it from the SRS_CARDS_JSON config var, so the deck
stays out of this public repo.
State: one jsonb row in Postgres when DATABASE_URL is set, else srs.json.
Channels: telegram_token, telegram_chat_id, email_to from config.json; email
reuses nagger.py's Gmail sender and token.json (gmail.send scope only).

Each run long-polls Telegram for up to POLL_S seconds, so replies land at
once; start.sh restarts it in a loop. Self-check: python3 srs.py --selftest
"""

import datetime as dt
import html
import json
import os
import re
import sys
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

import drill

HERE = Path(__file__).parent
TZ = ZoneInfo("Asia/Manila")
INTERVALS_DAYS = [1, 2, 4, 8, 16, 32]
NEW_PER_DAY = 8
REMIND_MIN = 60
WAKING = (8, 23)  # local hours, start inclusive, end exclusive
POLL_S = 50
STATE_FILE = HERE / "srs.json"
DB = os.environ.get("DATABASE_URL")
CONFIG = json.loads((HERE / "config.json").read_text()) if (HERE / "config.json").exists() else {}
CHAT = str(CONFIG.get("telegram_chat_id", ""))


def load_state():
    if DB:
        import psycopg

        with psycopg.connect(DB) as c:
            c.execute("create table if not exists srs_state (k text primary key, v jsonb not null)")
            row = c.execute("select v from srs_state where k = 'srs'").fetchone()
        return row[0] if row else {}
    try:
        return json.loads(STATE_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(state):
    if DB:
        import psycopg
        from psycopg.types.json import Jsonb

        with psycopg.connect(DB) as c:
            c.execute(
                "insert into srs_state values ('srs', %s) "
                "on conflict (k) do update set v = excluded.v",
                [Jsonb(state)],
            )
    else:
        STATE_FILE.write_text(json.dumps(state))


def tg(method, http_timeout=15, **params):
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{CONFIG['telegram_token']}/{method}",
        data=json.dumps(params).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=http_timeout) as r:
        return json.load(r)["result"]


def email(card):
    try:
        import nagger
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        gmail = build("gmail", "v1", cache_discovery=False,
                      credentials=Credentials.from_authorized_user_file(HERE / "token.json"))
        nagger.notify_email(gmail, f"Drill: {card['q']}",
                            f"{card['q']}\n\nAnswer it in the Telegram chat to stop these emails.")
    except Exception as e:
        print(f"email failed: {e}")


def norm(s):
    return re.sub(r"\s+", "", s.lower())


def missing_terms(card, text):
    t = norm(text)
    return [term.split("|")[0] for term in card.get("must", [])
            if not any(norm(alt) in t for alt in term.split("|"))]


def pick(state, deck, now):
    """Most overdue review first, else a new card if today's quota allows."""
    cards = state.get("cards", {})
    due = [c for c in deck if c["id"] in cards
           and dt.datetime.fromisoformat(cards[c["id"]]["due"]) <= now]
    if due:
        return min(due, key=lambda c: cards[c["id"]]["due"])
    new = state.get("new_today", {})
    if new.get("date") == f"{now:%F}" and new.get("n", 0) >= NEW_PER_DAY:
        return None
    return next((c for c in deck if c["id"] not in cards), None)


def grade(state, card, text, now):
    """Check a typed answer against the pending card, return the reply line."""
    cards = state.setdefault("cards", {})
    if card["id"] not in cards:
        new = state.get("new_today", {})
        n = new.get("n", 0) if new.get("date") == f"{now:%F}" else 0
        state["new_today"] = {"date": f"{now:%F}", "n": n + 1}
    missing = missing_terms(card, text)
    if missing:
        cards[card["id"]] = {"box": 0, "due": now.isoformat()}
        state["pending"]["sent"] = now.isoformat()  # re-ask a full interval from now
        return f"Not yet, missing: {', '.join(missing)}. Asking again in {REMIND_MIN} min."
    box = cards.get(card["id"], {}).get("box", 0)
    days = INTERVALS_DAYS[box]
    cards[card["id"]] = {"box": min(box + 1, len(INTERVALS_DAYS) - 1),
                         "due": (now + dt.timedelta(days=days)).isoformat()}
    state["pending"] = None
    return f"Correct. Next review in {days} day{'s' * (days > 1)}."


def send(state, card, now):
    old = (state.get("pending") or {}).get("msg")
    if old:
        try:  # keep one live question in the chat
            tg("deleteMessage", chat_id=CHAT, message_id=old)
        except Exception:
            pass  # older than 48h or already gone
    msg = tg("sendMessage", chat_id=CHAT, parse_mode="HTML",
             text=f"<b>Drill</b>\n{html.escape(card['q'])}\n\n<i>Reply with your answer.</i>")
    state["pending"] = {"id": card["id"], "msg": msg["message_id"], "sent": now.isoformat()}
    email(card)


def main():
    deck = json.loads((HERE / "cards.json").read_text())
    state = load_state()
    updates = tg("getUpdates", http_timeout=POLL_S + 10, timeout=POLL_S,
                 offset=state.get("offset", 0), allowed_updates=["message", "callback_query"])
    now = dt.datetime.now(TZ)
    for u in updates:
        state["offset"] = u["update_id"] + 1
        try:
            if drill.handle(u, tg, now):  # Daily Ten links and answers, from any chat
                continue
        except Exception as e:
            print(f"drill handle failed: {e}")
        m = u.get("message") or {}
        text = m.get("text", "")
        # trust boundary: only the configured chat answers, commands are ignored
        if str(m.get("chat", {}).get("id")) != CHAT or not text or text.startswith("/"):
            continue
        pending = state.get("pending") or {}
        card = next((c for c in deck if c["id"] == pending.get("id")), None)
        if not card:
            tg("sendMessage", chat_id=CHAT, text="Nothing pending.")
            continue
        verdict = grade(state, card, text, now)
        tg("sendMessage", chat_id=CHAT, parse_mode="HTML", reply_to_message_id=m["message_id"],
           text=f"{html.escape(verdict)}\n\n<b>Model answer:</b> {html.escape(card['a'])}")
        print(f"{card['id']}: {verdict}")

    pending = state.get("pending")
    if pending and not any(c["id"] == pending["id"] for c in deck):
        pending = state["pending"] = None  # card left the deck
    if WAKING[0] <= now.hour < WAKING[1]:
        if pending:
            since = now - dt.datetime.fromisoformat(pending["sent"])
            if since >= dt.timedelta(minutes=REMIND_MIN):
                send(state, next(c for c in deck if c["id"] == pending["id"]), now)
                print(f"{pending['id']}: re-asked")
        elif card := pick(state, deck, now):
            send(state, card, now)
            print(f"{card['id']}: sent")
    try:
        drill.tick(tg, now)
    except Exception as e:
        print(f"drill tick failed: {e}")
    save_state(state)


def selftest():
    now = dt.datetime(2026, 10, 22, 9, tzinfo=TZ)
    koch = {"id": "koch", "q": "q", "a": "a", "must": ["4", "3", "1.26|log4/log3"]}
    assert missing_terms(koch, "log 4 / log 3") == []
    assert missing_terms(koch, "D = 1.2619 from 4 pieces at 1/3") == []
    assert missing_terms(koch, "about 1.5") == ["4", "3", "1.26"]
    deck = [dict(koch, id=f"c{i}") for i in range(NEW_PER_DAY + 1)]
    s = {}
    assert pick(s, deck, now)["id"] == "c0"
    s["pending"] = {"id": "c0", "sent": now.isoformat()}
    later = now + dt.timedelta(minutes=5)
    assert grade(s, deck[0], "idk", later).startswith("Not yet")
    assert s["pending"] == {"id": "c0", "sent": later.isoformat()}  # still nagging
    assert s["cards"]["c0"]["box"] == 0
    assert grade(s, deck[0], "log4/log3", later) == "Correct. Next review in 1 day."
    assert s["pending"] is None and s["cards"]["c0"]["box"] == 1
    for c in deck[1:NEW_PER_DAY]:
        s["pending"] = {"id": c["id"], "sent": now.isoformat()}
        grade(s, c, "1.26 = log 4 / log 3", now)
    assert pick(s, deck, now) is None  # new-card quota spent
    tomorrow = now + dt.timedelta(days=1, hours=1)
    assert pick(s, deck, tomorrow)["id"] in {c["id"] for c in deck[:NEW_PER_DAY]}
    s["pending"] = {"id": "c0", "sent": now.isoformat()}
    s["cards"]["c0"] = {"box": 5, "due": now.isoformat()}
    assert grade(s, deck[0], "1.26 4 3", now) == "Correct. Next review in 32 days."
    assert s["cards"]["c0"]["box"] == 5  # capped at the last box
    print("selftest ok")


if __name__ == "__main__":
    selftest() if sys.argv[1:] == ["--selftest"] else main()
