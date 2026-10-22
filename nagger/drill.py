#!/usr/bin/env python3
"""Daily Ten concept nagger. Imported by srs.py, which owns the Telegram poll.

A question missed (WA/TLE) on stimmie.dev/dailyten comes back here as a
multiple-choice question. Picking the right option is the proof of understanding.
Wrong answers, or silence, keep it coming: wrong repeats in an hour, silence
re-sends every REMIND_MIN minutes during waking hours. Three right answers at
1, 3, 7 day gaps close it. Getting it right in the quiz closes it too.

Players link their Telegram on the site (t.me/<bot>?start=<code>). Reads the
site's dt_docs (players/*), dt_tg and dt_codes tables; keeps its own dt_drill.
Self-check: python3 drill.py --selftest
"""

import datetime as dt
import html
import json
import os
import random
import sys
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).parent
TZ = ZoneInfo("Asia/Manila")
DB = os.environ.get("DATABASE_URL")
BANK_URL = os.environ.get("DT_BANK_URL", "https://stimmie.dev/dailyten/bank.json")
GAPS_DAYS = [1, 3, 7]
RELEARN = dt.timedelta(hours=1)
REMIND_MIN = 60
WAKING = (8, 23)  # local hours, start inclusive, end exclusive
LETTERS = "ABCD"
CAT = {"cx": "Constraints", "bf": "Brute force", "ed": "Edge case", "py": "Python",
       "tc": "Technique", "db": "Find the bug", "im": "Implementation"}
_bank = {"at": None, "by_id": {}}


def bank(now):
    """Question bank from the site, cached for an hour, last good copy on failure."""
    if _bank["at"] is None or now - _bank["at"] > dt.timedelta(hours=1):
        try:
            with urllib.request.urlopen(BANK_URL, timeout=15) as r:
                _bank["by_id"] = {q["id"]: q for q in json.load(r)}
            _bank["at"] = now
        except Exception as e:
            print(f"bank fetch failed: {e}")
            _bank["at"] = now - dt.timedelta(minutes=50)  # retry in 10 min
    return _bank["by_id"]


def open_misses(results):
    """qid -> day of its latest miss, for questions whose latest verdict isn't AC."""
    latest = {}
    for day in sorted(results or {}):
        for qid, verdict, *_ in (results[day].get("a") or []):
            latest[qid] = (day, verdict)
    return {q: d for q, (d, v) in latest.items() if v != "AC"}


def reconcile(rows, results, now):
    """Return the drill rows after folding in the player's latest quiz results.

    rows: qid -> {box, due, since}. A new miss (later than row.since) reopens a
    question; a later quiz AC closes it."""
    rows = {q: dict(r) for q, r in rows.items()}
    misses = open_misses(results)
    for qid, day in misses.items():
        if qid not in rows or rows[qid]["since"] < day:
            rows[qid] = {"box": 0, "due": now.isoformat(), "since": day}
    for qid, r in rows.items():
        if qid not in misses and r["box"] < len(GAPS_DAYS):
            # solved in a later quiz than the miss we were nagging about
            r["box"] = len(GAPS_DAYS)
    return rows


def grade(row, correct, now):
    """Advance or reset one drill row. Returns (new_row, verdict line)."""
    if not correct:
        return ({**row, "box": 0, "due": (now + RELEARN).isoformat()},
                "Not quite. It comes back in an hour.")
    box = row["box"]
    if box + 1 >= len(GAPS_DAYS):
        return {**row, "box": len(GAPS_DAYS)}, "Right. That one is closed."
    days = GAPS_DAYS[box]
    return ({**row, "box": box + 1, "due": (now + dt.timedelta(days=days)).isoformat()},
            f"Right. Asked again in {days} day{'s' * (days > 1)}.")


def due_ids(rows, now):
    live = [(r["due"], q) for q, r in rows.items()
            if r["box"] < len(GAPS_DAYS) and dt.datetime.fromisoformat(r["due"]) <= now]
    return [q for _, q in sorted(live)]


def question_html(q, order, answered=None):
    """answered: None while open, else (picked_index, correct_bool)."""
    text = f"<b>{CAT.get(q['c'], q['c'])}</b>\n{html.escape(q['q'])}\n"
    if q.get("k"):
        text += f"<pre>{html.escape(q['k'])}</pre>\n"
    for pos, orig in enumerate(order):
        mark = ""
        if answered:
            mark = " (right)" if orig == q["a"] else " (your pick)" if orig == answered[0] else ""
        text += f"\n{LETTERS[pos]}. {html.escape(q['o'][orig])}{mark}"
    if answered:
        text += f"\n\n{html.escape(q['w'])}"
    return text


# ---------- storage ----------

def conn():
    import psycopg
    return psycopg.connect(DB)


def ensure_tables(c):
    c.execute("""create table if not exists dt_drill (
        player_id text, qid text, box int not null, due timestamptz not null, since text not null,
        primary key (player_id, qid))""")
    c.execute("""create table if not exists dt_drill_pending (
        player_id text primary key, qid text not null, msg_id bigint not null,
        sent timestamptz not null, perm jsonb not null)""")
    # the site creates these lazily; the nagger may run first
    c.execute("create table if not exists dt_docs (path text primary key, data jsonb not null, updated_at timestamptz not null default now())")
    c.execute("create table if not exists dt_codes (code text primary key, player_id text not null, created_at timestamptz not null default now())")
    c.execute("create table if not exists dt_tg (player_id text primary key, chat_id text not null)")


# ---------- telegram events ----------

def handle(update, tg, now):
    """Consume link messages and answer taps. True when the update was ours."""
    if not DB:
        return False
    msg = update.get("message")
    if msg and (msg.get("text") or "").startswith("/start") and msg["chat"]["type"] == "private":
        code = msg["text"].partition(" ")[2].strip()
        chat = str(msg["chat"]["id"])
        with conn() as c:
            ensure_tables(c)
            row = c.execute("select player_id from dt_codes where code = %s and created_at > now() - interval '1 day'", [code]).fetchone()
            if not row:
                return False  # not a Daily Ten link, leave it to the other handlers
            c.execute("insert into dt_tg values (%s, %s) on conflict (player_id) do update set chat_id = excluded.chat_id", [row[0], chat])
            c.execute("delete from dt_codes where code = %s", [code])
            nick = c.execute("select data->>'nick' from dt_docs where path = %s", ["players/" + row[0]]).fetchone()
        tg("sendMessage", chat_id=chat, text=f"Linked{' as ' + nick[0] if nick and nick[0] else ''}. "
           "Concepts you miss on the Daily Ten will come back here until you answer them right.")
        return True
    cq = update.get("callback_query")
    if cq and (cq.get("data") or "").startswith("dt:"):
        _, qid, idx = cq["data"].split(":")
        chat = str(cq["message"]["chat"]["id"])
        by_id = bank(now)
        with conn() as c:
            ensure_tables(c)
            pl = c.execute("select player_id from dt_tg where chat_id = %s", [chat]).fetchone()
            pend = pl and c.execute("select qid, msg_id, perm from dt_drill_pending where player_id = %s", [pl[0]]).fetchone()
            if not pend or pend[0] != qid or qid not in by_id:
                answer = "Already answered."
            else:
                q, picked = by_id[qid], int(idx)
                r = c.execute("select box, due, since from dt_drill where player_id = %s and qid = %s", [pl[0], qid]).fetchone()
                row = {"box": r[0], "due": r[1].isoformat(), "since": r[2]}
                new, answer = grade(row, picked == q["a"], now)
                c.execute("update dt_drill set box = %s, due = %s where player_id = %s and qid = %s",
                          [new["box"], new["due"], pl[0], qid])
                c.execute("delete from dt_drill_pending where player_id = %s", [pl[0]])
                tg("editMessageText", chat_id=chat, message_id=pend[1], parse_mode="HTML",
                   text=question_html(q, pend[2], (picked, picked == q["a"])) + f"\n\n<i>{answer}</i>")
                print(f"drill {pl[0][:6]} {qid}: {answer}")
        try:
            tg("answerCallbackQuery", callback_query_id=cq["id"], text=answer)
        except Exception:
            pass
        return True
    return False


def tick(tg, now):
    """Fold in new quiz results, then send or re-send one question per linked player."""
    if not DB or not (WAKING[0] <= now.hour < WAKING[1]):
        return
    by_id = bank(now)
    if not by_id:
        return
    with conn() as c:
        ensure_tables(c)
        for pid, chat in c.execute("select player_id, chat_id from dt_tg").fetchall():
            doc = c.execute("select data from dt_docs where path = %s", ["players/" + pid]).fetchone()
            rows = {q: {"box": b, "due": d.isoformat(), "since": s} for q, b, d, s in
                    c.execute("select qid, box, due, since from dt_drill where player_id = %s", [pid]).fetchall()}
            fresh = reconcile(rows, (doc[0] if doc else {}).get("results"), now)
            for q, r in fresh.items():
                if r != rows.get(q):
                    c.execute("insert into dt_drill values (%s, %s, %s, %s, %s) on conflict (player_id, qid) "
                              "do update set box = excluded.box, due = excluded.due, since = excluded.since",
                              [pid, q, r["box"], r["due"], r["since"]])
            pend = c.execute("select qid, msg_id, sent from dt_drill_pending where player_id = %s", [pid]).fetchone()
            if pend and now - pend[2] < dt.timedelta(minutes=REMIND_MIN):
                continue
            qid = pend[0] if pend else next((q for q in due_ids(fresh, now) if q in by_id), None)
            if pend and (qid not in by_id or fresh.get(qid, {}).get("box", 3) >= len(GAPS_DAYS)):
                qid = next((q for q in due_ids(fresh, now) if q in by_id), None)  # closed meanwhile
            if not qid:
                if pend:
                    c.execute("delete from dt_drill_pending where player_id = %s", [pid])
                continue
            if pend:
                try:
                    tg("deleteMessage", chat_id=chat, message_id=pend[1])
                except Exception:
                    pass  # older than 48h or already gone
            q = by_id[qid]
            order = random.sample(range(4), 4)
            m = tg("sendMessage", chat_id=chat, text=question_html(q, order), parse_mode="HTML",
                   reply_markup={"inline_keyboard": [[
                       {"text": LETTERS[pos], "callback_data": f"dt:{qid}:{orig}"}
                       for pos, orig in enumerate(order)]]})
            c.execute("insert into dt_drill_pending values (%s, %s, %s, %s, %s) on conflict (player_id) "
                      "do update set qid = excluded.qid, msg_id = excluded.msg_id, sent = excluded.sent, perm = excluded.perm",
                      [pid, qid, m["message_id"], now, json.dumps(order)])
            print(f"drill {pid[:6]} {qid}: {'reminder' if pend else 'sent'}")


def selftest():
    now = dt.datetime(2026, 10, 22, 9, tzinfo=TZ)
    day = lambda n: f"2026-10-{n:02d}"
    res = {day(20): {"a": [["a", "WA", 5], ["b", "AC", 9], ["c", "TLE", 75]]},
           day(21): {"a": [["b", "WA", 5], ["c", "AC", 8]]}}
    assert open_misses(res) == {"a": day(20), "b": day(21)}  # c solved later, b missed later
    rows = reconcile({}, res, now)
    assert set(rows) == {"a", "b"}  # c was missed once but solved later, so never opens
    assert sorted(due_ids(rows, now)) == ["a", "b"]
    new, v = grade(rows["a"], True, now)
    assert new["box"] == 1 and v == "Right. Asked again in 1 day."
    assert dt.datetime.fromisoformat(new["due"]) == now + dt.timedelta(days=1)
    new2, v = grade({**new, "box": 2}, True, now)
    assert new2["box"] == 3 and "closed" in v and due_ids({"a": new2}, now + dt.timedelta(days=99)) == []
    bad, v = grade({**new, "box": 2}, False, now)
    assert bad["box"] == 0 and dt.datetime.fromisoformat(bad["due"]) == now + RELEARN
    assert due_ids({"a": bad}, now) == [] and due_ids({"a": bad}, now + RELEARN) == ["a"]
    # a fresh miss after a closed drill reopens it; an older one doesn't
    closed = {"a": {"box": 3, "due": now.isoformat(), "since": day(20)}}
    assert reconcile(closed, res, now)["a"]["box"] == 3
    res[day(22)] = {"a": [["a", "WA", 3]]}
    assert reconcile(closed, res, now)["a"] == {"box": 0, "due": now.isoformat(), "since": day(22)}
    # a later quiz AC closes a drill that is still open
    live = {"a": {"box": 1, "due": now.isoformat(), "since": day(20)}}
    res[day(23)] = {"a": [["a", "AC", 3]]}
    assert reconcile(live, res, now)["a"]["box"] == 3
    q = {"c": "py", "q": "x < y?", "o": ["r", "w1", "w2", "w3"], "a": 0, "w": "because <b>"}
    t = question_html(q, [2, 0, 1, 3], (1, False))
    assert "&lt;" in t and "A. w2" in t and "B. r (right)" in t and "C. w1 (your pick)" in t
    print("selftest ok")


if __name__ == "__main__":
    selftest() if sys.argv[1:] == ["--selftest"] else print("run via srs.py")
