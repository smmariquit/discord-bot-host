#!/usr/bin/env python3
"""Classroom deadline nagger, multi-channel.

Channels per nag: desktop notification, email (Gmail API, same OAuth),
GitHub issue in a private repo (via gh CLI), Discord webhook ping.
Channels configure in config.json; missing/empty entries are skipped.

config.json:
{
  "email_to": "smmariquit@up.edu.ph",
  "github_repo": "smmariquit/nags",
  "discord_webhook": ""   // paste a channel webhook URL to enable
}

Cron (every 2 hours):
0 */2 * * * cd ~/dev/personal/classroom-nagger && OAUTHLIB_RELAX_TOKEN_SCOPE=1 uv run python nagger.py
"""

import base64
import datetime as dt
import json
import subprocess
import urllib.request
from email.mime.text import MIMEText
from pathlib import Path
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
    "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]
HERE = Path(__file__).parent
TZ = ZoneInfo("Asia/Manila")
NAG_HOURS = 48
# escalation ladder: each tier fires once as the deadline approaches;
# below the last tier (10 min) every check fires until due or turned in
TIERS = [(1 / 6, "10m"), (0.5, "30m"), (1.0, "1h"), (2.0, "2h"),
         (5.0, "5h"), (48.0, "48h")]
CRITICAL_HOURS = 1.0
STATE_FILE = HERE / "seen.json"
CONFIG = json.loads((HERE / "config.json").read_text()) if (HERE / "config.json").exists() else {}


def creds():
    token = HERE / "token.json"
    c = None
    if token.exists():
        c = Credentials.from_authorized_user_file(token, SCOPES)
        # scope set changed since the token was minted -> force re-consent
        if not set(SCOPES) <= set(c.scopes or []):
            c = None
    if not c or not c.valid:
        if c and c.expired and c.refresh_token:
            c.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                HERE / "credentials.json", SCOPES
            )
            c = flow.run_local_server(port=0)
        token.write_text(c.to_json())
    return c


def due_datetime(work):
    d = work.get("dueDate")
    if not d:
        return None
    t = work.get("dueTime", {})
    return dt.datetime(
        d["year"], d["month"], d["day"],
        t.get("hours", 23), t.get("minutes", 59), tzinfo=dt.timezone.utc,
    ).astimezone(TZ)


def notify_desktop(summary, body, critical):
    args = ["notify-send", "-a", "classroom-nagger"]
    if critical:
        args += ["-u", "critical"]
    try:
        subprocess.run(args + [summary, body], check=False)
    except FileNotFoundError:
        pass  # headless host, no notify-send


def notify_email(gmail, summary, body):
    to = CONFIG.get("email_to")
    if not to or gmail is None:
        return
    msg = MIMEText(body)
    msg["to"] = to
    msg["subject"] = f"[NAG] {summary}"
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    try:
        gmail.users().messages().send(userId="me", body={"raw": raw}).execute()
    except Exception as e:
        print(f"email failed: {e}")


def notify_github(summary, body):
    repo = CONFIG.get("github_repo")
    if not repo:
        return
    try:
        subprocess.run(
            ["gh", "issue", "create", "--repo", repo,
             "--title", f"[NAG] {summary}", "--body", body],
            check=False, capture_output=True,
        )
    except FileNotFoundError:
        pass  # no gh CLI on this host


def notify_telegram(summary, body):
    token = CONFIG.get("telegram_token")
    chat_id = CONFIG.get("telegram_chat_id")
    if not token or not chat_id:
        return
    payload = json.dumps(
        {"chat_id": chat_id, "text": f"NAG: {summary}\n{body}"}
    ).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=payload, headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(req, timeout=15)
    except Exception as e:
        print(f"telegram failed: {e}")


def notify_discord(summary, body, critical):
    url = CONFIG.get("discord_webhook")
    if not url:
        return
    prefix = "@everyone " if critical else ""
    payload = json.dumps({"content": f"{prefix}**{summary}**\n{body}"}).encode()
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        urllib.request.urlopen(req, timeout=15)
    except Exception as e:
        print(f"discord failed: {e}")


def main():
    c = creds()
    service = build("classroom", "v1", credentials=c)
    gmail = build("gmail", "v1", credentials=c)
    seen = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    now = dt.datetime.now(TZ)
    nagged = 0

    courses = service.courses().list(
        studentId="me", courseStates=["ACTIVE"]
    ).execute().get("courses", [])

    for course in courses:
        works = service.courses().courseWork().list(
            courseId=course["id"]
        ).execute().get("courseWork", [])
        for work in works:
            due = due_datetime(work)
            if not due:
                continue
            hours_left = (due - now).total_seconds() / 3600
            if not (0 < hours_left <= NAG_HOURS):
                continue

            subs = service.courses().courseWork().studentSubmissions().list(
                courseId=course["id"], courseWorkId=work["id"], userId="me"
            ).execute().get("studentSubmissions", [])
            state = subs[0].get("state") if subs else "NEW"
            if state in ("TURNED_IN", "RETURNED"):
                continue

            tier = next(label for th, label in TIERS if hours_left <= th)
            key = f"{work['id']}:{tier}"
            if tier == "10m":
                # fire on every check in the endgame
                key = f"{work['id']}:10m:{now:%H%M}"
            if seen.get(key):
                continue
            seen[key] = True
            nagged += 1
            critical = hours_left <= CRITICAL_HOURS
            summary = f"{course['name']}: {work['title']}"
            body = (
                f"Due {due:%a %b %d, %I:%M %p} ({hours_left:.0f}h left), "
                f"not turned in.\n{work.get('alternateLink', '')}"
            )
            notify_desktop(summary, body, critical)
            notify_email(gmail, summary, body)
            notify_github(summary, body)
            notify_telegram(summary, body)
            notify_discord(summary, body, critical)

    STATE_FILE.write_text(json.dumps(seen))
    print(f"{now:%F %T} checked {len(courses)} courses, sent {nagged} nags")


if __name__ == "__main__":
    main()
